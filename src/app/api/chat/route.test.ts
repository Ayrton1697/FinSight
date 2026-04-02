import assert from "node:assert/strict";
import test from "node:test";
import { buildRagUserPrompt, sanitizeModelText } from "@/lib/ai/rag";

test("buildRagUserPrompt includes the question and numbered context", () => {
  const prompt = buildRagUserPrompt("What changed in revenue?", ["doc-a", "doc-b"]);
  assert.equal(prompt.includes("What changed in revenue?"), true);
  assert.equal(prompt.includes("[1] doc-a"), true);
  assert.equal(prompt.includes("[2] doc-b"), true);
});

test("sanitizeModelText removes qwen thinking blocks", () => {
  const text = sanitizeModelText("<think>internal reasoning</think>\nFinal answer");
  assert.equal(text, "Final answer");
});
