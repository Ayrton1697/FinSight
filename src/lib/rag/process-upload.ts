import { createEmbeddings } from "@/lib/ai/rag";
import { extractTextFromUpload } from "@/lib/files/extract-text";
import {
  chunkDocumentSections,
  normalizeDocumentText,
  type DocumentChunk,
  type JsonObject,
} from "@/lib/rag/chunk-document";

export type IndexedUpload = {
  extractedText: string;
  title: string | null;
  fileMetadata: JsonObject;
  chunks: DocumentChunk[];
  embeddings: number[][];
};

function metadataLines(metadata: JsonObject): string[] {
  const lines: string[] = [];

  if (typeof metadata.sourceType === "string") {
    lines.push(`Source type: ${metadata.sourceType}`);
  }
  if (typeof metadata.pageNumber === "number") {
    lines.push(`Page number: ${metadata.pageNumber}`);
  }
  if (typeof metadata.pageLabel === "string" && metadata.pageLabel) {
    lines.push(`Page label: ${metadata.pageLabel}`);
  }
  if (typeof metadata.rowStart === "number" && typeof metadata.rowEnd === "number") {
    lines.push(`CSV rows: ${metadata.rowStart}-${metadata.rowEnd}`);
  }
  if (Array.isArray(metadata.columnNames) && metadata.columnNames.length) {
    lines.push(`Columns: ${metadata.columnNames.join(", ")}`);
  }

  return lines;
}

function buildEmbeddingInput(title: string | null, fileName: string, fileMetadata: JsonObject, chunk: DocumentChunk): string {
  const lines = [
    `File name: ${fileName}`,
    title ? `Title: ${title}` : null,
    ...metadataLines(fileMetadata),
    ...metadataLines(chunk.metadata),
    "",
    chunk.content,
  ].filter((value): value is string => Boolean(value));

  return lines.join("\n");
}

export async function processUploadForIndexing(file: File): Promise<IndexedUpload> {
  const extracted = await extractTextFromUpload(file);
  const extractedText = normalizeDocumentText(extracted.text);

  if (!extractedText) {
    throw new Error("No text could be extracted from the uploaded file");
  }

  const chunks = await chunkDocumentSections(extracted.sections);
  if (!chunks.length) {
    throw new Error("No indexable text chunks were generated");
  }

  const embeddings = await createEmbeddings(
    chunks.map((chunk) => buildEmbeddingInput(extracted.title, file.name, extracted.metadata, chunk)),
  );

  return {
    extractedText,
    title: extracted.title,
    fileMetadata: extracted.metadata,
    chunks,
    embeddings,
  };
}
