import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertSendAllowed,
  appendOptOutLine,
  buildMimeMessage,
  campaignAddressIssues,
  CommunicationSafetyError,
  decryptSecret,
  encryptSecret,
  GmailAdapter,
  MAX_ATTACHMENT_BYTES,
  planCampaignSchedule,
  renderTemplate,
  createAttachmentSignature,
  readStoredAttachment,
  storeAttachment,
  verifyAttachmentSignature
} from "./index.js";

test("builds reply-safe MIME headers", () => {
  const mime = buildMimeMessage({
    from: "vikas@example.com",
    to: ["lead@example.com"],
    subject: "Re: Workflow idea",
    text: "Thanks for the reply.",
    threadId: "thread-1",
    inReplyTo: "<message-1@example.com>",
    references: ["<message-1@example.com>"]
  });
  assert.match(mime, /In-Reply-To: <message-1@example.com>/);
  assert.match(mime, /References: <message-1@example.com>/);
  assert.match(mime, /Content-Type: multipart\/alternative/);
});

test("builds MIME attachments without breaking the alternative body", () => {
  const mime = buildMimeMessage({
    from: "vikas@example.com",
    to: ["lead@example.com"],
    subject: "Proposal",
    text: "Attached.",
    attachments: [{ fileName: "scope.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("demo").toString("base64") }]
  });
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /filename="scope.pdf"/);
});

test("stores clean attachments and rejects malware signatures", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "prospectpilot-attachment-"));
  try {
    const clean = await storeAttachment({
      bytes: Buffer.from("safe proposal"),
      fileName: "../scope?.txt",
      mimeType: "text/plain",
      storageRoot: root
    });
    assert.equal(clean.scanStatus, "CLEAN");
    assert.equal((await readStoredAttachment(root, clean.storageKey)).toString(), "safe proposal");
    const quarantined = await storeAttachment({
      bytes: Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"),
      fileName: "test.txt",
      mimeType: "text/plain",
      storageRoot: root
    });
    assert.equal(quarantined.scanStatus, "QUARANTINED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses expiring signatures for attachment downloads", () => {
  const expires = Math.floor(Date.now() / 1000) + 60;
  const signature = createAttachmentSignature("attachment-1", expires, "test-signing-key");
  assert.equal(verifyAttachmentSignature("attachment-1", expires, signature, "test-signing-key"), true);
  assert.equal(verifyAttachmentSignature("attachment-2", expires, signature, "test-signing-key"), false);
  assert.equal(verifyAttachmentSignature("attachment-1", Math.floor(Date.now() / 1000) - 1, signature, "test-signing-key"), false);
});

test("blocks oversized, executable, and unapproved MIME attachments", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "prospectpilot-attachment-policy-"));
  try {
    await assert.rejects(
      storeAttachment({
        bytes: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
        fileName: "large.pdf",
        mimeType: "application/pdf",
        storageRoot: root
      }),
      /10 MB limit/
    );
    await assert.rejects(
      storeAttachment({
        bytes: Buffer.from("echo unsafe"),
        fileName: "run.ps1",
        mimeType: "text/plain",
        storageRoot: root
      }),
      /blocked/
    );
    await assert.rejects(
      storeAttachment({
        bytes: Buffer.from("archive"),
        fileName: "archive.zip",
        mimeType: "application/zip",
        storageRoot: root
      }),
      /not allowed/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renders only declared template values", () => {
  assert.equal(
    renderTemplate("Hi {{firstName}}, an idea for {{companyName}}: {{missing}}", {
      firstName: "Asha",
      companyName: "Northstar"
    }),
    "Hi Asha, an idea for Northstar: "
  );
});

test("blocks suppressed or unapproved sends", () => {
  assert.throws(
    () => assertSendAllowed({
      destination: "lead@example.com",
      suppressionReasons: ["UNSUBSCRIBED"],
      companyTrustStatus: "VERIFIED",
      contactability: "REACHABLE",
      mailboxStatus: "CONNECTED",
      duplicateSubmitted: false,
      approvalStatus: "APPROVED",
      requireApproval: true
    }),
    (error: unknown) => error instanceof CommunicationSafetyError && error.code === "SUPPRESSED"
  );
});

test("Gmail adapter preserves thread id in the send payload", async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const adapter = new GmailAdapter({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body || "") });
      return new Response(JSON.stringify({ id: "gmail-1", threadId: "thread-1" }), { status: 200 });
    }
  });
  const result = await adapter.sendMessage("token", {
    from: "vikas@example.com",
    to: ["lead@example.com"],
    subject: "Re: Hello",
    text: "Reply",
    threadId: "thread-1",
    inReplyTo: "<one@example.com>",
    references: ["<one@example.com>"]
  });
  assert.equal(result.status, "SUBMITTED");
  assert.match(calls[0]?.body || "", /"threadId":"thread-1"/);
});

test("encrypts refresh tokens with authenticated encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptSecret("refresh-token", key);
  assert.notEqual(encrypted, "refresh-token");
  assert.equal(decryptSecret(encrypted, key), "refresh-token");
});

test("adds a respectful opt-out only when one is missing", () => {
  const original = "Hi Asha,\n\nI noticed a workflow issue.";
  assert.match(appendOptOutLine(original), /reply no/i);
  assert.equal(appendOptOutLine(`${original}\n\nReply no and I will not contact you again.`), `${original}\n\nReply no and I will not contact you again.`);
});

test("blocks placeholder, telemetry, and directory-platform campaign addresses", () => {
  assert.deepEqual(campaignAddressIssues("sales@real-business.com"), []);
  assert.match(campaignAddressIssues("webmaster@car-part.com").join(" "), /Technical|Directory/);
  assert.match(campaignAddressIssues("hash@sentry-next.wixpress.com").join(" "), /infrastructure/);
  assert.match(campaignAddressIssues("person@demo.example").join(" "), /Placeholder/);
});

test("plans paced campaign sends across daily and domain limits", () => {
  const schedule = planCampaignSchedule(
    [
      { id: "one", domain: "example.com" },
      { id: "two", domain: "example.com" },
      { id: "three", domain: "other.com" }
    ],
    new Date("2026-07-27T12:00:00.000Z"),
    {
      timezone: "UTC",
      dailyLimit: 2,
      perDomainLimit: 1,
      minIntervalSeconds: 60,
      sendWindowStartMinutes: 9 * 60,
      sendWindowEndMinutes: 17 * 60,
      skipWeekends: true
    }
  );
  assert.equal(schedule.length, 3);
  assert.equal(schedule[0]?.dueAt.toISOString(), "2026-07-27T12:00:00.000Z");
  assert.equal(schedule[1]?.dueAt.toISOString(), "2026-07-28T09:00:00.000Z");
  assert.equal(schedule[2]?.dueAt.toISOString(), "2026-07-28T09:01:00.000Z");
});

test("Gmail adapter revokes provider access without exposing the token", async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const adapter = new GmailAdapter({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body || "") });
      return new Response(null, { status: 200 });
    }
  });
  await adapter.revokeToken("secret-refresh-token");
  assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/revoke");
  assert.match(calls[0]?.body || "", /^token=/);
});
