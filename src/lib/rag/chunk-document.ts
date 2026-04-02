import { TokenTextSplitter } from "@langchain/textsplitters";

export const CHUNK_SIZE_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 100;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type DocumentSection = {
  text: string;
  metadata?: JsonObject;
};

export type DocumentChunk = {
  content: string;
  metadata: JsonObject;
};

const splitter = new TokenTextSplitter({
  encodingName: "cl100k_base",
  chunkSize: CHUNK_SIZE_TOKENS,
  chunkOverlap: CHUNK_OVERLAP_TOKENS,
});

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function chunkDocumentText(text: string): Promise<string[]> {
  const normalized = normalizeDocumentText(text);
  if (!normalized) {
    return [];
  }

  const chunks = await splitter.splitText(normalized);
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export async function chunkDocumentSections(sections: DocumentSection[]): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const contentChunks = await chunkDocumentText(section.text);
    for (const content of contentChunks) {
      chunks.push({
        content,
        metadata: section.metadata ?? {},
      });
    }
  }

  return chunks;
}
