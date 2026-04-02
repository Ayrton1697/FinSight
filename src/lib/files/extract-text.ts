import { extractTextFromImage } from "@/lib/ai/openai";
import { extractPdfTextWithPdfPlumber } from "@/lib/files/extract-pdf-text";
import { getAllowedUploadKind } from "@/lib/files/allowed-upload";
import { normalizeDocumentText, type DocumentSection, type JsonObject } from "@/lib/rag/chunk-document";

export type ExtractedDocument = {
  text: string;
  title: string | null;
  metadata: JsonObject;
  sections: DocumentSection[];
};

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function firstMeaningfulLine(text: string): string | null {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);

  return line ? line.slice(0, 160) : null;
}

function deriveTitle(fileName: string, candidates: Array<string | null | undefined>): string {
  const title = candidates.find((candidate) => candidate && candidate.trim());
  return (title?.trim() || fileStem(fileName)).slice(0, 200);
}

function normalizeSectionText(text: string): string {
  return normalizeDocumentText(text);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.filter((value) => value.length > 0);
}

function buildCsvSections(csvText: string, columnNames: string[]): DocumentSection[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const header = lines[0];
  const dataRows = lines.slice(1);

  if (!dataRows.length) {
    return [
      {
        text: header,
        metadata: {
          sourceType: "csv",
          rowStart: 0,
          rowEnd: 0,
          columnNames,
        },
      },
    ];
  }

  const rowsPerSection = 50;
  const sections: DocumentSection[] = [];

  for (let index = 0; index < dataRows.length; index += rowsPerSection) {
    const chunkRows = dataRows.slice(index, index + rowsPerSection);
    sections.push({
      text: `${header}\n${chunkRows.join("\n")}`,
      metadata: {
        sourceType: "csv",
        rowStart: index + 1,
        rowEnd: index + chunkRows.length,
        columnNames,
      },
    });
  }

  return sections;
}

async function extractTextFromPdf(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
  const extracted = await extractPdfTextWithPdfPlumber(buffer);
  const sections: DocumentSection[] = [];

  for (const page of extracted.pages) {
    const text = normalizeSectionText(page.text);
    if (!text) {
      continue;
    }

    sections.push({
      text,
      metadata: {
        sourceType: "pdf",
        pageNumber: page.num,
        pageLabel: page.pageLabel,
      },
    });
  }

  const title = deriveTitle(fileName, extracted.titleCandidates);

  return {
    text: normalizeSectionText(extracted.fullText),
    title,
    metadata: {
      sourceType: "pdf",
      pageCount: extracted.pages.length,
      author: extracted.metadata.author,
      subject: extracted.metadata.subject,
      keywords: extracted.metadata.keywords,
      creator: extracted.metadata.creator,
      producer: extracted.metadata.producer,
      fingerprint: extracted.metadata.fingerprint,
      outlineTitles: extracted.metadata.outlineTitles,
    },
    sections,
  };
}

async function extractTextFromCsv(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
  const csvText = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const normalized = normalizeSectionText(csvText);
  const lines = normalized.split("\n").filter(Boolean);
  const columnNames = lines[0] ? parseCsvLine(lines[0]).slice(0, 100) : [];

  return {
    text: normalized,
    title: deriveTitle(fileName, [fileStem(fileName)]),
    metadata: {
      sourceType: "csv",
      rowCount: Math.max(lines.length - 1, 0),
      columnNames,
    },
    sections: buildCsvSections(csvText, columnNames),
  };
}

async function extractTextFromImageUpload(file: File, buffer: Buffer): Promise<ExtractedDocument> {
  const mimeType = file.type || "image/png";
  const text = normalizeSectionText(await extractTextFromImage(buffer, mimeType));
  const title = deriveTitle(file.name, [firstMeaningfulLine(text), fileStem(file.name)]);

  return {
    text,
    title,
    metadata: {
      sourceType: "image",
      extractedLineCount: text ? text.split("\n").filter(Boolean).length : 0,
    },
    sections: text
      ? [
          {
            text,
            metadata: {
              sourceType: "image",
            },
          },
        ]
      : [],
  };
}

export async function extractTextFromUpload(file: File): Promise<ExtractedDocument> {
  const kind = getAllowedUploadKind(file);
  if (!kind) {
    throw new Error("Unsupported file type");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "pdf") {
    return extractTextFromPdf(buffer, file.name);
  }
  if (kind === "csv") {
    return extractTextFromCsv(buffer, file.name);
  }

  return extractTextFromImageUpload(file, buffer);
}
