import type { Job as BullJob } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import {
  assertSendAllowed,
  decryptSecret,
  encryptSecret,
  extractDomain,
  GmailAdapter,
  normalizeAddress
} from "@prospectpilot/communications";
import { JOB_NAMES } from "@prospectpilot/shared";

config({ path: new URL("../../../.env", import.meta.url) });

const encryptionKey = process.env.COMMUNICATION_ENCRYPTION_KEY ?? "";
const gmail = new GmailAdapter({
  clientId: process.env.GMAIL_CLIENT_ID ?? "",
  clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
  redirectUri: process.env.GMAIL_REDIRECT_URI ?? "http://localhost:4000/communications/oauth/gmail/callback",
  pubsubTopic: process.env.GMAIL_PUBSUB_TOPIC
});

export async function processCommunicationJob(job: BullJob, prisma: PrismaClient) {
  const trackedJobId = (job.data as { trackedJobId?: string }).trackedJobId;
  if (trackedJobId) {
    await prisma.job.update({
      where: { id: trackedJobId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: job.attemptsMade + 1 }
    });
  }
  try {
    let result: unknown;
    if (job.name === JOB_NAMES.sendCommunication) {
      result = await sendCommunication((job.data as { messageId: string }).messageId, prisma);
    } else if (job.name === JOB_NAMES.syncGmail) {
      result = await syncGmailMailbox((job.data as { connectionId: string }).connectionId, prisma);
    } else if (job.name === JOB_NAMES.renewGmailWatch) {
      result = await renewGmailWatch((job.data as { connectionId: string }).connectionId, prisma);
    }
    if (trackedJobId) {
      await prisma.job.update({
        where: { id: trackedJobId },
        data: { status: "COMPLETE", completedAt: new Date(), result: asJson(result) }
      });
    }
    return result;
  } catch (error) {
    if (trackedJobId) {
      await prisma.job.update({
        where: { id: trackedJobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Communication job failed"
        }
      });
    }
    throw error;
  }
}

async function sendCommunication(messageId: string, prisma: PrismaClient) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      company: true,
      contact: true,
      connection: true,
      approval: true,
      recipients: true,
      conversation: true,
      schedule: true
    }
  });
  if (!message || !message.company || !message.connection) throw new Error("Message, lead, or sending account is missing.");
  if (message.connection.provider !== "GMAIL") throw new Error("Only Gmail sending is available in this milestone.");
  const to = message.recipients.filter((item) => item.type === "TO");
  if (!to.length) throw new Error("Message has no primary recipient.");

  for (const recipient of to) {
    const suppressions = await prisma.suppressionEntry.findMany({
      where: {
        active: true,
        channel: message.channel,
        OR: [
          { scope: "WORKSPACE" },
          { normalizedDestination: recipient.normalizedAddress },
          { contactId: recipient.contactId || undefined },
          { companyId: message.companyId || undefined },
          { domain: extractDomain(recipient.normalizedAddress) }
        ]
      },
      select: { reason: true }
    });
    assertSendAllowed({
      destination: recipient.address,
      suppressionReasons: suppressions.map((item) => item.reason),
      companyTrustStatus: message.company.trustStatus,
      contactability: message.contact?.contactabilityState || recipient.contactability,
      mailboxStatus: message.connection.status,
      duplicateSubmitted: ["SUBMITTED", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(message.status),
      approvalStatus: message.approval?.status,
      requireApproval: true
    });
  }

  const token = await getAccessToken(message.connection.id, prisma);
  try {
    const result = await gmail.sendMessage(token, {
      from: message.connection.emailAddress,
      to: to.map((item) => item.address),
      cc: message.recipients.filter((item) => item.type === "CC").map((item) => item.address),
      bcc: message.recipients.filter((item) => item.type === "BCC").map((item) => item.address),
      subject: message.subject || "(no subject)",
      text: message.bodyText,
      html: message.bodyHtml || undefined,
      threadId: message.providerThreadId || message.conversation.providerThreadId || undefined,
      inReplyTo: message.inReplyTo || undefined,
      references: message.references
    });
    const submittedAt = new Date();
    await prisma.$transaction([
      prisma.message.update({
        where: { id: message.id },
        data: {
          status: "SUBMITTED",
          providerMessageId: result.providerMessageId,
          providerThreadId: result.providerThreadId,
          submittedAt,
          sentAt: submittedAt,
          events: { create: { type: "SUBMITTED", occurredAt: submittedAt } }
        }
      }),
      prisma.conversation.update({
        where: { id: message.conversationId },
        data: {
          providerThreadId: result.providerThreadId,
          status: "AWAITING_PROSPECT",
          latestMessageAt: submittedAt
        }
      }),
      prisma.scheduledMessage.updateMany({
        where: { messageId: message.id },
        data: { status: "COMPLETE", lastError: null }
      }),
      prisma.activity.create({
        data: {
          companyId: message.company.id,
          type: "EMAIL_SUBMITTED",
          summary: `Email submitted to ${to.map((item) => item.address).join(", ")}`,
          metadata: {
            messageId: message.id,
            conversationId: message.conversationId,
            providerMessageId: result.providerMessageId,
            deliveryConfirmed: false
          }
        }
      })
    ]);
    if (message.contactId) {
      await prisma.contact.update({
        where: { id: message.contactId },
        data: { contactabilityUpdatedAt: submittedAt }
      });
    }
    if (["NEW", "RESEARCH", "QUALIFIED", "OUTREACH_READY"].includes((await prisma.crmItem.findUnique({ where: { companyId: message.company.id } }))?.status || "")) {
      await prisma.crmItem.upsert({
        where: { companyId: message.company.id },
        create: { companyId: message.company.id, status: "CONTACTED" },
        update: { status: "CONTACTED" }
      });
    }
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Provider send failed";
    await prisma.$transaction([
      prisma.message.update({
        where: { id: message.id },
        data: { status: "FAILED", events: { create: { type: "FAILED", metadata: { reason } } } }
      }),
      prisma.scheduledMessage.updateMany({
        where: { messageId: message.id },
        data: { status: "FAILED", lastError: reason }
      }),
      prisma.activity.create({
        data: {
          companyId: message.company.id,
          type: "EMAIL_FAILED",
          summary: "Email submission failed",
          metadata: { messageId: message.id, reason }
        }
      })
    ]);
    throw error;
  }
}

async function syncGmailMailbox(connectionId: string, prisma: PrismaClient) {
  const connection = await prisma.channelConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.provider !== "GMAIL" || connection.status !== "CONNECTED") {
    throw new Error("Connected Gmail account not found.");
  }
  const token = await getAccessToken(connection.id, prisma);
  const threadIds = new Set<string>();
  let newestHistoryId = connection.syncCursor;

  if (!connection.lastSyncedAt) {
    const listed = await gmail.listThreads(token, "newer_than:30d", 50);
    for (const thread of listed.threads ?? []) threadIds.add(thread.id);
  } else if (connection.syncCursor) {
    try {
      const history = await gmail.listHistory(token, connection.syncCursor) as GmailHistoryResponse;
      newestHistoryId = history.historyId || newestHistoryId;
      for (const record of history.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message.threadId) threadIds.add(added.message.threadId);
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("HTTP 404")) throw error;
      const listed = await gmail.listThreads(token, "newer_than:7d", 50);
      for (const thread of listed.threads ?? []) threadIds.add(thread.id);
    }
  }

  let syncedMessages = 0;
  for (const threadId of Array.from(threadIds).slice(0, 50)) {
    const thread = await gmail.getThread(token, threadId) as GmailThread;
    newestHistoryId = thread.historyId || newestHistoryId;
    syncedMessages += await saveGmailThread(connection, thread, prisma);
  }
  const profile = await gmail.getProfile(token);
  newestHistoryId = profile.historyId || newestHistoryId;
  await prisma.channelConnection.update({
    where: { id: connection.id },
    data: {
      syncCursor: newestHistoryId,
      lastSyncedAt: new Date(),
      lastError: null,
      status: "CONNECTED"
    }
  });
  if (process.env.GMAIL_PUBSUB_TOPIC) await renewGmailWatch(connection.id, prisma, token);
  return { syncedThreads: threadIds.size, syncedMessages, historyId: newestHistoryId };
}

async function renewGmailWatch(connectionId: string, prisma: PrismaClient, providedToken?: string) {
  const token = providedToken || await getAccessToken(connectionId, prisma);
  const watch = await gmail.watch(token);
  await prisma.channelConnection.update({
    where: { id: connectionId },
    data: {
      syncCursor: watch.historyId,
      watchExpirationAt: new Date(Number(watch.expiration)),
      lastError: null
    }
  });
  return watch;
}

async function saveGmailThread(
  connection: { id: string; emailAddress: string },
  thread: GmailThread,
  prisma: PrismaClient
) {
  let savedCount = 0;
  for (const payload of thread.messages ?? []) {
    const parsed = parseGmailMessage(payload);
    const existing = await prisma.message.findUnique({
      where: { connectionId_providerMessageId: { connectionId: connection.id, providerMessageId: payload.id } }
    });
    if (existing) continue;
    const inbound = normalizeAddress(parsed.from.address) !== normalizeAddress(connection.emailAddress);
    const externalAddress = inbound ? parsed.from.address : parsed.to[0]?.address;
    const contact = externalAddress
      ? await prisma.contact.findFirst({
          where: { type: "EMAIL", normalizedValue: normalizeAddress(externalAddress) },
          include: { company: true }
        })
      : null;
    const existingConversation = await prisma.conversation.findUnique({
      where: { connectionId_providerThreadId: { connectionId: connection.id, providerThreadId: payload.threadId } }
    });
    const companyId = existingConversation?.companyId || contact?.companyId;
    const conversation = existingConversation || await prisma.conversation.create({
      data: {
        companyId,
        connectionId: connection.id,
        channel: "EMAIL",
        providerThreadId: payload.threadId,
        subject: parsed.subject,
        status: inbound ? "NEEDS_REPLY" : "AWAITING_PROSPECT",
        latestMessageAt: parsed.occurredAt,
        unreadCount: 0
      }
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        companyId,
        contactId: contact?.id,
        connectionId: connection.id,
        channel: "EMAIL",
        direction: inbound ? "INBOUND" : "OUTBOUND",
        status: inbound ? "REPLIED" : "SUBMITTED",
        providerMessageId: payload.id,
        providerThreadId: payload.threadId,
        internetMessageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        subject: parsed.subject,
        bodyText: parsed.text,
        bodyHtml: parsed.html,
        submittedAt: inbound ? undefined : parsed.occurredAt,
        receivedAt: inbound ? parsed.occurredAt : undefined,
        sentAt: parsed.occurredAt,
        recipients: {
          create: [
            { type: "FROM", address: parsed.from.address, normalizedAddress: normalizeAddress(parsed.from.address), contactId: inbound ? contact?.id : undefined },
            ...parsed.to.map((recipient) => ({
              type: "TO" as const,
              address: recipient.address,
              normalizedAddress: normalizeAddress(recipient.address),
              contactId: !inbound ? contact?.id : undefined
            }))
          ]
        },
        events: {
          create: inbound ? [{ type: "SYNCED" }, { type: "REPLIED", occurredAt: parsed.occurredAt }] : [{ type: "SYNCED" }]
        }
      }
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        subject: conversation.subject || parsed.subject,
        latestMessageAt: parsed.occurredAt,
        status: inbound ? "NEEDS_REPLY" : "AWAITING_PROSPECT",
        unreadCount: inbound ? { increment: 1 } : undefined
      }
    });
    for (const participant of [parsed.from, ...parsed.to]) {
      await prisma.conversationParticipant.upsert({
        where: {
          conversationId_normalizedAddress_role: {
            conversationId: conversation.id,
            normalizedAddress: normalizeAddress(participant.address),
            role: normalizeAddress(participant.address) === normalizeAddress(parsed.from.address) ? "SENDER" : "RECIPIENT"
          }
        },
        create: {
          conversationId: conversation.id,
          contactId: normalizeAddress(participant.address) === normalizeAddress(externalAddress || "") ? contact?.id : undefined,
          name: participant.name,
          address: participant.address,
          normalizedAddress: normalizeAddress(participant.address),
          role: normalizeAddress(participant.address) === normalizeAddress(parsed.from.address) ? "SENDER" : "RECIPIENT"
        },
        update: { name: participant.name }
      });
    }
    if (inbound && companyId) {
      await prisma.$transaction([
        prisma.activity.create({
          data: {
            companyId,
            type: "EMAIL_REPLY_RECEIVED",
            summary: `Email reply received from ${parsed.from.address}`,
            metadata: { messageId: message.id, conversationId: conversation.id }
          }
        }),
        prisma.crmItem.upsert({
          where: { companyId },
          create: { companyId, status: "REPLIED" },
          update: { status: "REPLIED" }
        }),
        prisma.sequenceEnrollment.updateMany({
          where: { companyId, status: "ACTIVE" },
          data: { status: "EXITED_REPLY", exitReason: "Inbound reply received", completedAt: new Date(), nextStepAt: null }
        })
      ]);
      if (contact) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { contactabilityState: "REPLIED", contactabilityUpdatedAt: parsed.occurredAt }
        });
      }
    }
    savedCount += 1;
  }
  return savedCount;
}

async function getAccessToken(connectionId: string, prisma: PrismaClient) {
  if (!encryptionKey) throw new Error("COMMUNICATION_ENCRYPTION_KEY is not configured.");
  const connection = await prisma.channelConnection.findUnique({ where: { id: connectionId } });
  if (!connection?.refreshTokenEncrypted) throw new Error("Mailbox refresh token is unavailable.");
  if (
    connection.accessTokenEncrypted &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() > Date.now() + 2 * 60 * 1000
  ) {
    return decryptSecret(connection.accessTokenEncrypted, encryptionKey);
  }
  const refreshed = await gmail.refreshToken(decryptSecret(connection.refreshTokenEncrypted, encryptionKey));
  await prisma.channelConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encryptSecret(refreshed.access_token, encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      status: "CONNECTED",
      lastError: null
    }
  });
  return refreshed.access_token;
}

function parseGmailMessage(message: GmailMessage) {
  const headers = new Map((message.payload.headers ?? []).map((item) => [item.name.toLowerCase(), item.value]));
  const text = findBody(message.payload, "text/plain") || "";
  const html = findBody(message.payload, "text/html") || undefined;
  return {
    from: parseAddress(headers.get("from") || ""),
    to: splitAddresses(headers.get("to") || ""),
    subject: headers.get("subject") || "(no subject)",
    messageId: headers.get("message-id"),
    inReplyTo: headers.get("in-reply-to"),
    references: (headers.get("references") || "").split(/\s+/).filter(Boolean),
    text: text || stripHtml(html || ""),
    html,
    occurredAt: new Date(Number(message.internalDate || Date.now()))
  };
}

function findBody(part: GmailPart, mimeType: string): string | undefined {
  if (part.mimeType === mimeType && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const value = findBody(child, mimeType);
    if (value) return value;
  }
  return undefined;
}

function splitAddresses(value: string) {
  return value.split(",").map(parseAddress).filter((item) => item.address.includes("@"));
}

function parseAddress(value: string) {
  const match = value.trim().match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  return match
    ? { name: match[1]?.trim() || undefined, address: match[2]!.trim() }
    : { name: undefined, address: value.trim() };
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

type GmailHistoryResponse = {
  historyId?: string;
  history?: Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string } }> }>;
};

type GmailThread = {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload: GmailPart;
};

type GmailPart = {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
};
