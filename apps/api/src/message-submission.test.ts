import assert from "node:assert/strict";
import test from "node:test";
import { messageSubmissionIssue } from "./message-submission.js";

test("allows an approved unsent message", () => {
  assert.equal(messageSubmissionIssue({ status: "APPROVED", approvalStatus: "APPROVED" }), null);
});

test("blocks a second submission before another queue record is created", () => {
  assert.match(
    messageSubmissionIssue({ status: "QUEUED", approvalStatus: "APPROVED" }) ?? "",
    /already queued/
  );
});

test("keeps approval as an independent gate", () => {
  assert.match(
    messageSubmissionIssue({ status: "PENDING_APPROVAL", approvalStatus: "PENDING" }) ?? "",
    /needs approval/
  );
});
