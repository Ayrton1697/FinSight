import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUNK_OVERLAP_TOKENS,
  CHUNK_SIZE_TOKENS,
  chunkDocumentSections,
  chunkDocumentText,
  normalizeDocumentText,
} from "./chunk-document";

test("normalizeDocumentText trims noisy whitespace", () => {
  const normalized = normalizeDocumentText("Line one \r\n\r\n\r\nLine two\t \n");
  assert.equal(normalized, "Line one\n\nLine two");
});

test("chunkDocumentText creates overlapping token chunks", async () => {
  const words = Array.from(
    { length: CHUNK_SIZE_TOKENS + CHUNK_OVERLAP_TOKENS + 50 },
    (_, index) => `word${String(index).padStart(4, "0")}`,
  );
  const chunks = await chunkDocumentText(words.join(" "));
  const firstChunkWords = chunks[0].split(/\s+/);
  const secondChunkWords = chunks[1].split(/\s+/);
  const trailingWindow = firstChunkWords.slice(-40);

  assert.equal(chunks.length >= 2, true);
  assert.equal(chunks[0].includes("word0000"), true);
  assert.equal(trailingWindow.some((word) => secondChunkWords.includes(word)), true);
});

test("chunkDocumentSections preserves section metadata", async () => {
  const chunks = await chunkDocumentSections([
    {
      text: "alpha beta gamma",
      metadata: { pageNumber: 3, sourceType: "pdf" },
    },
  ]);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].metadata, { pageNumber: 3, sourceType: "pdf" });
});
