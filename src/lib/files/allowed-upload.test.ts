import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedUploadFile } from "./allowed-upload";

function mockFile(name: string, type: string): File {
  return new File([""], name, { type });
}

test("allows pdf and csv by mime or extension", () => {
  assert.equal(isAllowedUploadFile(mockFile("a.pdf", "application/pdf")), true);
  assert.equal(isAllowedUploadFile(mockFile("a.csv", "text/csv")), true);
  assert.equal(isAllowedUploadFile(mockFile("data.CSV", "")), true);
});

test("allows images by mime or common extensions", () => {
  assert.equal(isAllowedUploadFile(mockFile("x.png", "image/png")), true);
  assert.equal(isAllowedUploadFile(mockFile("x", "image/jpeg")), true);
  assert.equal(isAllowedUploadFile(mockFile("photo.JPG", "")), true);
});

test("rejects other types", () => {
  assert.equal(isAllowedUploadFile(mockFile("n.txt", "text/plain")), false);
  assert.equal(isAllowedUploadFile(mockFile("n.docx", "application/vnd...")), false);
});
