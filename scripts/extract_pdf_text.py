import io
import json
import sys
import traceback

import pdfplumber


def normalize_string(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")

    text = str(value).strip()
    return text or None


def extract_page_text(page):
    text = page.extract_text(layout=True, x_tolerance=2, y_tolerance=3)
    if not text:
        text = page.extract_text()
    return text or ""


def main():
    payload = sys.stdin.buffer.read()
    if not payload:
        raise ValueError("No PDF data received on stdin")

    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        metadata = pdf.metadata or {}
        result = {
            "pages": [
                {
                    "pageNumber": index,
                    "text": extract_page_text(page),
                }
                for index, page in enumerate(pdf.pages, start=1)
            ],
            "metadata": {
                "title": normalize_string(metadata.get("Title")),
                "author": normalize_string(metadata.get("Author")),
                "subject": normalize_string(metadata.get("Subject")),
                "keywords": normalize_string(metadata.get("Keywords")),
                "creator": normalize_string(metadata.get("Creator")),
                "producer": normalize_string(metadata.get("Producer")),
            },
        }

    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
