import { spawn } from "node:child_process";
import path from "node:path";
import { normalizeDocumentText } from "@/lib/rag/chunk-document";

type PageText = {
  text: string;
};

function coerceOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const asString = String(value).trim();
  return asString || null;
}

function firstMeaningfulLineFromPages(pages: PageText[]): string | null {
  for (const page of pages) {
    const line = page.text
      .split("\n")
      .map((part) => part.trim())
      .find(Boolean);
    if (line) {
      return line.slice(0, 160);
    }
  }
  return null;
}

type PdfPlumberJson = {
  pages?: Array<{
    pageNumber?: unknown;
    text?: unknown;
  }>;
  metadata?: {
    title?: unknown;
    author?: unknown;
    subject?: unknown;
    keywords?: unknown;
    creator?: unknown;
    producer?: unknown;
  };
};

export type PdfTextExtraction = {
  fullText: string;
  pages: Array<{ num: number; text: string; pageLabel: string | null }>;
  titleCandidates: Array<string | null | undefined>;
  metadata: {
    author: string | null;
    subject: string | null;
    keywords: string | null;
    creator: string | null;
    producer: string | null;
    fingerprint: string | null;
    outlineTitles: string[];
  };
};

function pdfPlumberScriptPath(): string {
  return path.join(process.cwd(), "scripts", "extract_pdf_text.py");
}

type PythonInvocation = {
  command: string;
  args: string[];
};

const PYTHON_INVOCATIONS: PythonInvocation[] = [
  { command: "python", args: [] },
  { command: "py", args: ["-3"] },
  { command: "python3", args: [] },
];

function formatExtractorError(message: string): Error {
  if (message.includes("No module named 'pdfplumber'") || message.includes('No module named "pdfplumber"')) {
    return new Error("pdfplumber is not installed. Run `python -m pip install -r requirements.txt`.");
  }

  return new Error(`pdfplumber extraction failed: ${message}`);
}

async function runPdfPlumberScript(buffer: Buffer): Promise<string> {
  const scriptPath = pdfPlumberScriptPath();
  let lastError: Error | null = null;

  for (const invocation of PYTHON_INVOCATIONS) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(invocation.command, [...invocation.args, scriptPath], {
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });

        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve(stdout);
            return;
          }

          reject(formatExtractorError(stderr.trim() || `Python exited with code ${code}`));
        });

        child.stdin.on("error", () => undefined);
        child.stdin.end(buffer);
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      lastError = error instanceof Error ? error : new Error("Unknown pdfplumber extraction error");
      break;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Python 3 was not found. Install Python and ensure `python` or `py -3` works.");
}

export function parsePdfPlumberResult(serialized: string): PdfTextExtraction {
  let parsed: PdfPlumberJson;

  try {
    parsed = JSON.parse(serialized) as PdfPlumberJson;
  } catch {
    throw new Error("pdfplumber returned invalid JSON output");
  }

  const rawPages = Array.isArray(parsed.pages) ? parsed.pages : [];
  const pages = rawPages.map((page, index) => ({
    num:
      typeof page?.pageNumber === "number" && Number.isFinite(page.pageNumber)
        ? page.pageNumber
        : index + 1,
    text: normalizeDocumentText(typeof page?.text === "string" ? page.text : ""),
    pageLabel: null,
  }));

  const fullText = normalizeDocumentText(
    pages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n"),
  );

  const metadata = parsed.metadata ?? {};

  return {
    fullText,
    pages,
    titleCandidates: [coerceOptionalString(metadata.title), firstMeaningfulLineFromPages(pages)],
    metadata: {
      author: coerceOptionalString(metadata.author),
      subject: coerceOptionalString(metadata.subject),
      keywords: coerceOptionalString(metadata.keywords),
      creator: coerceOptionalString(metadata.creator),
      producer: coerceOptionalString(metadata.producer),
      fingerprint: null,
      outlineTitles: [],
    },
  };
}

export async function extractPdfTextWithPdfPlumber(buffer: Buffer): Promise<PdfTextExtraction> {
  const output = await runPdfPlumberScript(buffer);
  return parsePdfPlumberResult(output);
}
