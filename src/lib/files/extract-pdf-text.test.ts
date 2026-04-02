import assert from "node:assert/strict";
import test from "node:test";
import { parsePdfPlumberResult } from "./extract-pdf-text";

test("parsePdfPlumberResult normalizes pdfplumber output", () => {
  const result = parsePdfPlumberResult(
    JSON.stringify({
      pages: [
        {
          pageNumber: 1,
          text: " Statement Title \n\n  Transaction one  ",
        },
        {
          pageNumber: 2,
          text: " Transaction two ",
        },
      ],
      metadata: {
        title: "Monthly Statement",
        author: "Bank Corp",
        subject: "Checking",
        keywords: "statement,banking",
        creator: "Core Banking",
        producer: "PDF Engine",
      },
    }),
  );

  assert.equal(result.fullText, "Statement Title\n\n  Transaction one\n\nTransaction two");
  assert.deepEqual(result.pages, [
    {
      num: 1,
      text: "Statement Title\n\n  Transaction one",
      pageLabel: null,
    },
    {
      num: 2,
      text: "Transaction two",
      pageLabel: null,
    },
  ]);
  assert.deepEqual(result.titleCandidates, ["Monthly Statement", "Statement Title"]);
  assert.deepEqual(result.metadata, {
    author: "Bank Corp",
    subject: "Checking",
    keywords: "statement,banking",
    creator: "Core Banking",
    producer: "PDF Engine",
    fingerprint: null,
    outlineTitles: [],
  });
});

test("parsePdfPlumberResult rejects invalid json", () => {
  assert.throws(() => parsePdfPlumberResult("not-json"), /invalid JSON/i);
});
