import assert from "node:assert/strict";
import test from "node:test";
import { classifySafetyBlock } from "./communication-worker.js";

test("suppression produces terminal cancellation states", () => {
  assert.deepEqual(classifySafetyBlock("SUPPRESSED", "SCHEDULED"), {
    preserveTerminal: false,
    messageStatus: "CANCELLED",
    scheduleStatus: "CANCELLED"
  });
});

test("provider-independent preflight failures remain visible as failures", () => {
  assert.deepEqual(classifySafetyBlock("MAILBOX_UNAVAILABLE", "QUEUED"), {
    preserveTerminal: false,
    messageStatus: "FAILED",
    scheduleStatus: "FAILED"
  });
});

test("a duplicate job cannot rewrite an already submitted message", () => {
  assert.equal(classifySafetyBlock("DUPLICATE_SEND", "SENT").preserveTerminal, true);
});
