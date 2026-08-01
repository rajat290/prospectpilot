import assert from "node:assert/strict";
import test from "node:test";
import { oauthSyncCursor } from "./gmail-connection-sync.js";

test("initial Gmail connection starts from the current provider history", () => {
  assert.equal(oauthSyncCursor(null, "history-100"), "history-100");
});

test("Gmail reconnect preserves the existing sync cursor", () => {
  assert.equal(oauthSyncCursor({ id: "connection-1" }, "history-200"), undefined);
});
