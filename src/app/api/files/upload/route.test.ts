import assert from "node:assert/strict";
import test from "node:test";
import { buildStoragePath, sanitizeFileName } from "@/lib/files/storage-path";

test("sanitizeFileName removes unsafe characters", () => {
  assert.equal(sanitizeFileName("q1 report (final).pdf"), "q1_report__final_.pdf");
});

test("buildStoragePath includes user id and file", () => {
  const path = buildStoragePath("user-123", "hello.txt");
  assert.equal(path.startsWith("user-123/"), true);
  assert.equal(path.endsWith("-hello.txt"), true);
});
