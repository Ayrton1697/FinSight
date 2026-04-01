import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistantReply } from "./route";

test("buildAssistantReply includes context count", () => {
  const reply = buildAssistantReply(["doc-a", "doc-b"]);
  assert.equal(reply.includes("2 context item(s)"), true);
  assert.equal(reply.includes("doc-a"), true);
});
