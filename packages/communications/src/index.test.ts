import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSendAllowed,
  buildMimeMessage,
  CommunicationSafetyError,
  decryptSecret,
  encryptSecret,
  GmailAdapter,
  renderTemplate
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
