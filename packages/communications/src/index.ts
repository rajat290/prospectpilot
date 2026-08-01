export type CommunicationChannel = "EMAIL" | "WHATSAPP" | "LINKEDIN" | "INSTAGRAM" | "SMS" | "CALL";

export type ProviderMessageInput = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{ fileName: string; mimeType: string; contentBase64: string }>;
};

export type ProviderMessageResult = {
  providerMessageId: string;
  providerThreadId?: string;
  status: "SUBMITTED";
};

export type CampaignSchedulePolicy = {
  timezone: string;
  dailyLimit: number;
  perDomainLimit: number;
  minIntervalSeconds: number;
  sendWindowStartMinutes: number;
  sendWindowEndMinutes: number;
  skipWeekends: boolean;
};

export type CampaignScheduleTarget = {
  id: string;
  domain: string;
};

export type GmailTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

export interface CommunicationProvider {
  sendMessage(accessToken: string, input: ProviderMessageInput): Promise<ProviderMessageResult>;
  createDraft(accessToken: string, input: ProviderMessageInput): Promise<{ providerDraftId: string; providerMessageId: string }>;
  getThread(accessToken: string, threadId: string): Promise<unknown>;
  listHistory(accessToken: string, startHistoryId: string): Promise<unknown>;
}

export class CommunicationSafetyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CommunicationSafetyError";
  }
}

export function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

export function extractDomain(value: string) {
  return normalizeAddress(value).split("@")[1] || "";
}

export function assertSendAllowed(input: {
  destination: string;
  suppressionReasons?: string[];
  companyTrustStatus: string;
  contactability: string;
  mailboxStatus: string;
  duplicateSubmitted: boolean;
  approvalStatus?: string;
  requireApproval: boolean;
}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAddress(input.destination))) {
    throw new CommunicationSafetyError("INVALID_DESTINATION", "Recipient email is not valid.");
  }
  if (input.suppressionReasons?.length) {
    throw new CommunicationSafetyError("SUPPRESSED", `Recipient is suppressed: ${input.suppressionReasons.join(", ")}`);
  }
  if (["REJECTED", "CONFLICTING", "STALE"].includes(input.companyTrustStatus)) {
    throw new CommunicationSafetyError("UNTRUSTED_LEAD", `Lead trust state ${input.companyTrustStatus} blocks sending.`);
  }
  if (["BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(input.contactability)) {
    throw new CommunicationSafetyError("UNREACHABLE_CONTACT", `Contactability state ${input.contactability} blocks sending.`);
  }
  if (input.mailboxStatus !== "CONNECTED") {
    throw new CommunicationSafetyError("MAILBOX_UNAVAILABLE", "Sending mailbox is not connected.");
  }
  if (input.duplicateSubmitted) {
    throw new CommunicationSafetyError("DUPLICATE_SEND", "This message has already been submitted.");
  }
  if (input.requireApproval && input.approvalStatus !== "APPROVED") {
    throw new CommunicationSafetyError("APPROVAL_REQUIRED", "Operator approval is required before sending.");
  }
}

export function renderTemplate(template: string, variables: Record<string, string | undefined>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

export function appendOptOutLine(body: string, optOutLine = "If this is not relevant, reply no and I will not contact you again.") {
  const normalized = body.trim();
  if (/\b(unsubscribe|opt[\s-]?out|not contact you again|stop contacting)\b/i.test(normalized)) return normalized;
  return `${normalized}\n\n${optOutLine}`;
}

export function campaignAddressIssues(value: string) {
  const address = normalizeAddress(value);
  const [localPart = "", domain = ""] = address.split("@");
  const issues: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) issues.push("Invalid email format");
  if (["webmaster", "postmaster", "mailer-daemon", "noreply", "no-reply", "donotreply", "do-not-reply"].includes(localPart)) {
    issues.push("Technical or non-reply mailbox");
  }
  if (
    domain === "domain.com" ||
    domain.endsWith(".example") ||
    domain === "example.com" ||
    domain.endsWith(".local") ||
    domain.includes("sentry-next.wixpress.com")
  ) {
    issues.push("Placeholder or infrastructure domain");
  }
  if (domain === "car-part.com") issues.push("Directory-platform mailbox is not the business contact");
  return issues;
}

export function buildMimeMessage(input: ProviderMessageInput) {
  const alternativeBoundary = `prospectpilot_alt_${cryptoRandomId()}`;
  const mixedBoundary = `prospectpilot_mix_${cryptoRandomId()}`;
  const hasAttachments = Boolean(input.attachments?.length);
  const headers = [
    `From: ${sanitizeHeader(input.from)}`,
    `To: ${input.to.map(sanitizeHeader).join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.map(sanitizeHeader).join(", ")}` : "",
    input.bcc?.length ? `Bcc: ${input.bcc.map(sanitizeHeader).join(", ")}` : "",
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    input.inReplyTo ? `In-Reply-To: ${sanitizeHeader(input.inReplyTo)}` : "",
    input.references?.length ? `References: ${input.references.map(sanitizeHeader).join(" ")}` : "",
    `Content-Type: multipart/${hasAttachments ? "mixed" : "alternative"}; boundary="${hasAttachments ? mixedBoundary : alternativeBoundary}"`
  ].filter(Boolean);
  const alternativeParts = [
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeLineEndings(input.text),
    input.html
      ? [
          `--${alternativeBoundary}`,
          'Content-Type: text/html; charset="UTF-8"',
          "Content-Transfer-Encoding: 8bit",
          "",
          normalizeLineEndings(input.html)
        ].join("\r\n")
      : "",
    `--${alternativeBoundary}--`
  ].filter(Boolean);
  if (!hasAttachments) return [...headers, "", ...alternativeParts].join("\r\n");
  const mixedParts = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    ...alternativeParts,
    ...(input.attachments ?? []).flatMap((attachment) => [
      `--${mixedBoundary}`,
      `Content-Type: ${sanitizeHeader(attachment.mimeType)}; name="${sanitizeFileNameHeader(attachment.fileName)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeFileNameHeader(attachment.fileName)}"`,
      "",
      wrapBase64(attachment.contentBase64)
    ]),
    `--${mixedBoundary}--`
  ];
  return [...headers, "", ...mixedParts].join("\r\n");
}

export function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function encryptSecret(value: string, base64Key: string) {
  const key = parseEncryptionKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(payload: string, base64Key: string) {
  const [version, ivText, tagText, ciphertextText] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Encrypted secret payload is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", parseEncryptionKey(base64Key), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export class GmailAdapter implements CommunicationProvider {
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      pubsubTopic?: string;
      fetcher?: typeof fetch;
    }
  ) {}

  authorizationUrl(state: string) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      scope: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid"
      ].join(" ")
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string) {
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code"
    });
    return this.requestToken(body);
  }

  async refreshToken(refreshToken: string) {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token"
    });
    return this.requestToken(body);
  }

  async revokeToken(token: string) {
    const body = new URLSearchParams({ token });
    const response = await (this.config.fetcher ?? fetch)("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`Google token revocation failed with HTTP ${response.status}`);
    return { revoked: true };
  }

  async getProfile(accessToken: string) {
    return this.gmailRequest<{ emailAddress: string; historyId: string }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/profile"
    );
  }

  async sendMessage(accessToken: string, input: ProviderMessageInput): Promise<ProviderMessageResult> {
    const payload = await this.gmailRequest<{ id: string; threadId?: string }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        body: JSON.stringify({
          raw: encodeBase64Url(buildMimeMessage(input)),
          threadId: input.threadId
        })
      }
    );
    return { providerMessageId: payload.id, providerThreadId: payload.threadId, status: "SUBMITTED" };
  }

  async createDraft(accessToken: string, input: ProviderMessageInput) {
    const payload = await this.gmailRequest<{ id: string; message: { id: string } }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        body: JSON.stringify({
          message: {
            raw: encodeBase64Url(buildMimeMessage(input)),
            threadId: input.threadId
          }
        })
      }
    );
    return { providerDraftId: payload.id, providerMessageId: payload.message.id };
  }

  async getThread(accessToken: string, threadId: string) {
    return this.gmailRequest(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`);
  }

  async getMessage(accessToken: string, messageId: string) {
    return this.gmailRequest(
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`
    );
  }

  async getAttachment(accessToken: string, messageId: string, attachmentId: string) {
    return this.gmailRequest<{ data: string; size: number }>(
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
    );
  }

  async listThreads(accessToken: string, query = "newer_than:30d", maxResults = 50) {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    return this.gmailRequest<{ threads?: Array<{ id: string; historyId?: string }>; nextPageToken?: string }>(
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`
    );
  }

  async listHistory(accessToken: string, startHistoryId: string) {
    return this.gmailRequest(
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded`
    );
  }

  async watch(accessToken: string) {
    if (!this.config.pubsubTopic) throw new Error("GMAIL_PUBSUB_TOPIC is not configured.");
    return this.gmailRequest<{ historyId: string; expiration: string }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        method: "POST",
        body: JSON.stringify({
          topicName: this.config.pubsubTopic,
          labelIds: ["INBOX"],
          labelFilterBehavior: "INCLUDE"
        })
      }
    );
  }

  private async requestToken(body: URLSearchParams) {
    const response = await (this.config.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`Google OAuth token exchange failed with HTTP ${response.status}`);
    return response.json() as Promise<GmailTokenResponse>;
  }

  private async gmailRequest<T = unknown>(accessToken: string, url: string, init: RequestInit = {}) {
    const response = await (this.config.fetcher ?? fetch)(url, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gmail API returned HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  }
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  return /[^\x20-\x7E]/.test(clean) ? `=?UTF-8?B?${Buffer.from(clean).toString("base64")}?=` : clean;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function sanitizeFileNameHeader(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 160);
}

function wrapBase64(value: string) {
  return value.replace(/\s+/g, "").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseEncryptionKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("COMMUNICATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function planCampaignSchedule(
  targets: CampaignScheduleTarget[],
  startAt: Date,
  policy: CampaignSchedulePolicy
) {
  validateCampaignPolicy(policy);
  const scheduled: Array<{ id: string; dueAt: Date }> = [];
  const dailyCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  let cursor = new Date(startAt);

  for (const target of targets) {
    let guard = 0;
    while (guard++ < 400_000) {
      cursor = normalizeCampaignCursor(cursor, policy);
      const local = zonedParts(cursor, policy.timezone);
      const dayKey = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
      const domainKey = `${dayKey}:${target.domain.toLowerCase()}`;
      if ((dailyCounts.get(dayKey) ?? 0) >= policy.dailyLimit || (domainCounts.get(domainKey) ?? 0) >= policy.perDomainLimit) {
        cursor = nextLocalDay(local, policy);
        continue;
      }
      scheduled.push({ id: target.id, dueAt: new Date(cursor) });
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
      domainCounts.set(domainKey, (domainCounts.get(domainKey) ?? 0) + 1);
      cursor = new Date(cursor.getTime() + policy.minIntervalSeconds * 1000);
      break;
    }
    if (guard >= 400_000) throw new Error("Could not place campaign target inside the configured sending policy.");
  }
  return scheduled;
}

function validateCampaignPolicy(policy: CampaignSchedulePolicy) {
  if (policy.dailyLimit < 1 || policy.dailyLimit > 500) throw new Error("Campaign daily limit must be between 1 and 500.");
  if (policy.perDomainLimit < 1 || policy.perDomainLimit > policy.dailyLimit) throw new Error("Per-domain limit is invalid.");
  if (policy.minIntervalSeconds < 10) throw new Error("Campaign interval must be at least 10 seconds.");
  if (policy.sendWindowStartMinutes < 0 || policy.sendWindowEndMinutes > 1440 || policy.sendWindowStartMinutes >= policy.sendWindowEndMinutes) {
    throw new Error("Campaign sending window is invalid.");
  }
  zonedParts(new Date(), policy.timezone);
}

function normalizeCampaignCursor(value: Date, policy: CampaignSchedulePolicy) {
  let cursor = new Date(value);
  for (let attempt = 0; attempt < 370; attempt += 1) {
    const local = zonedParts(cursor, policy.timezone);
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    if (policy.skipWeekends && (weekday === 0 || weekday === 6)) {
      cursor = nextLocalDay(local, policy);
      continue;
    }
    const minute = local.hour * 60 + local.minute;
    if (minute < policy.sendWindowStartMinutes) {
      return localMinuteToUtc(local.year, local.month, local.day, policy.sendWindowStartMinutes, policy.timezone);
    }
    if (minute >= policy.sendWindowEndMinutes) {
      cursor = nextLocalDay(local, policy);
      continue;
    }
    return cursor;
  }
  throw new Error("Could not find an allowed campaign sending window.");
}

function nextLocalDay(
  local: { year: number; month: number; day: number },
  policy: CampaignSchedulePolicy
) {
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return localMinuteToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    policy.sendWindowStartMinutes,
    policy.timezone
  );
}

function localMinuteToUtc(year: number, month: number, day: number, minuteOfDay: number, timezone: string) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = zonedParts(new Date(utc), timezone);
    const renderedUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute);
    utc -= renderedUtc - Date.UTC(year, month - 1, day, hour, minute);
  }
  return new Date(utc);
}

function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export * from "./storage.js";
