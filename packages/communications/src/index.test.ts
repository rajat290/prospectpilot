import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertSendAllowed,
  buildMimeMessage,
  CommunicationSafetyError,
  decryptSecret,
  encryptSecret,
  GmailAdapter,
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
