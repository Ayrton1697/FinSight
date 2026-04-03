from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Any

import pdfplumber
import tiktoken

from backend.ai import create_embeddings, extract_text_from_image


CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 100
ROWS_PER_CSV_SECTION = 50
ENCODER = tiktoken.get_encoding("cl100k_base")

PDF_MIMES = {"application/pdf"}
PDF_EXTENSIONS = {".pdf"}
CSV_MIMES = {"text/csv", "application/csv"}
CSV_EXTENSIONS = {".csv"}
IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".jfif",
    ".pjpeg",
    ".pjp",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".tif",
    ".tiff",
    ".ico",
    ".heic",
    ".heif",
    ".avif",
}


@dataclass(slots=True)
class DocumentSection:
    text: str
    metadata: dict[str, Any]


@dataclass(slots=True)
class DocumentChunk:
    content: str
    metadata: dict[str, Any]


@dataclass(slots=True)
class IndexedUpload:
    extracted_text: str
    title: str | None
    file_metadata: dict[str, Any]
    chunks: list[DocumentChunk]
    embeddings: list[list[float]]


def extension_of(file_name: str) -> str:
    dot_index = file_name.rfind(".")
    return file_name[dot_index:].lower() if dot_index >= 0 else ""


def sanitize_file_name(file_name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", file_name)


def build_storage_path(user_id: str, file_name: str) -> str:
    import time

    return f"{user_id}/{int(time.time() * 1000)}-{sanitize_file_name(file_name)}"


def get_allowed_upload_kind(file_name: str, mime_type: str | None) -> str | None:
    normalized_type = (mime_type or "").lower()
    if normalized_type:
        if normalized_type in PDF_MIMES:
            return "pdf"
        if normalized_type in CSV_MIMES:
            return "csv"
        if normalized_type.startswith("image/"):
            return "image"

    extension = extension_of(file_name)
    if extension in PDF_EXTENSIONS:
        return "pdf"
    if extension in CSV_EXTENSIONS:
        return "csv"
    if extension in IMAGE_EXTENSIONS:
        return "image"
    return None


def normalize_document_text(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+\n", "\n", text.replace("\x00", "").replace("\r\n", "\n"))).strip()


def file_stem(file_name: str) -> str:
    return re.sub(r"\.[^.]+$", "", file_name)


def first_meaningful_line(text: str) -> str | None:
    for part in text.split("\n"):
        line = part.strip()
        if line:
            return line[:160]
    return None


def derive_title(file_name: str, candidates: list[str | None]) -> str:
    for candidate in candidates:
        if candidate and candidate.strip():
            return candidate.strip()[:200]
    return file_stem(file_name)[:200]


def normalize_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_csv_line(line: str) -> list[str]:
    return [value.strip() for value in next(csv.reader([line]), []) if value.strip()]


def build_csv_sections(csv_text: str, column_names: list[str]) -> list[DocumentSection]:
    lines = [line.rstrip() for line in csv_text.replace("\ufeff", "", 1).replace("\r\n", "\n").split("\n") if line.strip()]
    if not lines:
        return []

    header = lines[0]
    data_rows = lines[1:]
    if not data_rows:
        return [
            DocumentSection(
                text=header,
                metadata={
                    "sourceType": "csv",
                    "rowStart": 0,
                    "rowEnd": 0,
                    "columnNames": column_names,
                },
            )
        ]

    sections: list[DocumentSection] = []
    for index in range(0, len(data_rows), ROWS_PER_CSV_SECTION):
        chunk_rows = data_rows[index : index + ROWS_PER_CSV_SECTION]
        sections.append(
            DocumentSection(
                text=f"{header}\n" + "\n".join(chunk_rows),
                metadata={
                    "sourceType": "csv",
                    "rowStart": index + 1,
                    "rowEnd": index + len(chunk_rows),
                    "columnNames": column_names,
                },
            )
        )
    return sections


def extract_text_from_pdf(file_bytes: bytes, file_name: str) -> tuple[str, str, dict[str, Any], list[DocumentSection]]:
    pages: list[tuple[int, str]] = []
    metadata: dict[str, Any] = {}
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        metadata = pdf.metadata or {}
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(layout=True, x_tolerance=2, y_tolerance=3) or page.extract_text() or ""
            normalized = normalize_document_text(text)
            pages.append((index, normalized))

    sections = [
        DocumentSection(
            text=text,
            metadata={"sourceType": "pdf", "pageNumber": page_number, "pageLabel": None},
        )
        for page_number, text in pages
        if text
    ]
    full_text = normalize_document_text("\n\n".join(text for _, text in pages if text))
    title = derive_title(file_name, [normalize_string(metadata.get("Title")), first_meaningful_line(full_text)])
    return (
        full_text,
        title,
        {
            "sourceType": "pdf",
            "pageCount": len(pages),
            "author": normalize_string(metadata.get("Author")),
            "subject": normalize_string(metadata.get("Subject")),
            "keywords": normalize_string(metadata.get("Keywords")),
            "creator": normalize_string(metadata.get("Creator")),
            "producer": normalize_string(metadata.get("Producer")),
            "fingerprint": None,
            "outlineTitles": [],
        },
        sections,
    )


def extract_text_from_csv(file_bytes: bytes, file_name: str) -> tuple[str, str, dict[str, Any], list[DocumentSection]]:
    csv_text = file_bytes.decode("utf-8", errors="ignore").replace("\ufeff", "", 1)
    normalized = normalize_document_text(csv_text)
    lines = [line for line in normalized.split("\n") if line]
    column_names = parse_csv_line(lines[0])[:100] if lines else []
    return (
        normalized,
        derive_title(file_name, [file_stem(file_name)]),
        {
            "sourceType": "csv",
            "rowCount": max(len(lines) - 1, 0),
            "columnNames": column_names,
        },
        build_csv_sections(csv_text, column_names),
    )


def extract_text_from_image_upload(
    file_bytes: bytes, file_name: str, mime_type: str | None
) -> tuple[str, str, dict[str, Any], list[DocumentSection]]:
    text = normalize_document_text(extract_text_from_image(file_bytes, mime_type or "image/png"))
    title = derive_title(file_name, [first_meaningful_line(text), file_stem(file_name)])
    sections = (
        [DocumentSection(text=text, metadata={"sourceType": "image"})]
        if text
        else []
    )
    return (
        text,
        title,
        {
            "sourceType": "image",
            "extractedLineCount": len([line for line in text.split("\n") if line]),
        },
        sections,
    )


def extract_text_from_upload(
    file_bytes: bytes, file_name: str, mime_type: str | None
) -> tuple[str, str, dict[str, Any], list[DocumentSection]]:
    kind = get_allowed_upload_kind(file_name, mime_type)
    if not kind:
        raise ValueError("Unsupported file type")

    if kind == "pdf":
        return extract_text_from_pdf(file_bytes, file_name)
    if kind == "csv":
        return extract_text_from_csv(file_bytes, file_name)
    return extract_text_from_image_upload(file_bytes, file_name, mime_type)


def chunk_document_text(text: str) -> list[str]:
    normalized = normalize_document_text(text)
    if not normalized:
        return []

    token_ids = ENCODER.encode(normalized)
    step = max(CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS, 1)
    chunks: list[str] = []
    for start in range(0, len(token_ids), step):
        window = token_ids[start : start + CHUNK_SIZE_TOKENS]
        if not window:
            break
        chunk = normalize_document_text(ENCODER.decode(window))
        if chunk:
            chunks.append(chunk)
        if start + CHUNK_SIZE_TOKENS >= len(token_ids):
            break
    return chunks


def chunk_document_sections(sections: list[DocumentSection]) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for section in sections:
        for content in chunk_document_text(section.text):
            chunks.append(DocumentChunk(content=content, metadata=section.metadata or {}))
    return chunks


def metadata_lines(metadata: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    if isinstance(metadata.get("sourceType"), str):
        lines.append(f"Source type: {metadata['sourceType']}")
    if isinstance(metadata.get("pageNumber"), int):
        lines.append(f"Page number: {metadata['pageNumber']}")
    if isinstance(metadata.get("pageLabel"), str) and metadata["pageLabel"]:
        lines.append(f"Page label: {metadata['pageLabel']}")
    if isinstance(metadata.get("rowStart"), int) and isinstance(metadata.get("rowEnd"), int):
        lines.append(f"CSV rows: {metadata['rowStart']}-{metadata['rowEnd']}")
    column_names = metadata.get("columnNames")
    if isinstance(column_names, list) and column_names:
        lines.append(f"Columns: {', '.join(str(value) for value in column_names)}")
    return lines


def build_embedding_input(
    title: str | None, file_name: str, file_metadata: dict[str, Any], chunk: DocumentChunk
) -> str:
    lines = [
        f"File name: {file_name}",
        f"Title: {title}" if title else None,
        *metadata_lines(file_metadata),
        *metadata_lines(chunk.metadata),
        "",
        chunk.content,
    ]
    return "\n".join(line for line in lines if line)


def process_upload_for_indexing(file_bytes: bytes, file_name: str, mime_type: str | None) -> IndexedUpload:
    extracted_text, title, file_metadata, sections = extract_text_from_upload(file_bytes, file_name, mime_type)
    extracted_text = normalize_document_text(extracted_text)
    if not extracted_text:
        raise ValueError("No text could be extracted from the uploaded file")

    chunks = chunk_document_sections(sections)
    if not chunks:
        raise ValueError("No indexable text chunks were generated")

    embeddings = create_embeddings(
        [build_embedding_input(title, file_name, file_metadata, chunk) for chunk in chunks]
    )

    return IndexedUpload(
        extracted_text=extracted_text,
        title=title,
        file_metadata=file_metadata,
        chunks=chunks,
        embeddings=embeddings,
    )
