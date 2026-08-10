import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ApprovalMode,
  CommunicationChannel,
  CommunicationProvider,
  MessageStatus,
  PrismaClient,
  SuppressionReason,
  SuppressionScope,
  TemplateCategory
} from "@prisma/client";
import { encryptSecret, GmailAdapter, normalizeAddress } from "@prospectpilot/communications";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "./env.js";
import { oauthSyncCursor } from "./gmail-connection-sync.js";
import { messageSubmissionIssue } from "./message-submission.js";
import { queueCommunicationSend, queueGmailSync } from "./queues.js";

const gmail = new GmailAdapter({
  clientId: env.gmailClientId,
  clientSecret: env.gmailClientSecret,
  redirectUri: env.gmailRedirectUri,
  pubsubTopic: env.gmailPubsubTopic
});

export async function registerCommunicationRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/communications/status", async () => {
    const [accounts, conversationCount, pendingApprovals, scheduled, suppressions, unmatched, failed] = await Promise.all([
      prisma.channelConnection.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          provider: true,
          channel: true,
          emailAddress: true,
          displayName: true,
          status: true,
          grantedScopes: true,
          lastSyncedAt: true,
          watchExpirationAt: true,
          lastError: true,
          createdAt: true
        }
      }),
      prisma.conversation.count(),
      prisma.approvalRequest.count({ where: { status: "PENDING" } }),
      prisma.scheduledMessage.count({ where: { status: { in: ["PENDING", "QUEUED"] } } }),
      prisma.suppressionEntry.count({ where: { active: true } }),
      prisma.inboundReview.count({ where: { status: "PENDING" } }),
      prisma.message.count({ where: { status: { in: ["FAILED", "BOUNCED"] } } })
    ]);
    return {
      providers: {
        gmail: {
          oauthConfigured: Boolean(env.gmailClientId && env.gmailClientSecret && env.communicationEncryptionKey),
          pubsubConfigured: Boolean(env.gmailPubsubTopic && env.gmailWebhookToken),
          redirectUri: env.gmailRedirectUri
        },
        outlook: { available: false },
        whatsapp: { available: false }
      },
      attachments: {
        signingConfigured: Boolean(env.attachmentSigningKey || env.communicationEncryptionKey),
        storageRootConfigured: Boolean(process.env.ATTACHMENT_STORAGE_ROOT)
      },
      accounts,
      counts: { conversations: conversationCount, pendingApprovals, scheduled, suppressions, unmatched, failed }
    };
  });

  app.post("/communications/oauth/gmail/start", async (request, reply) => {
    if (!env.gmailClientId || !env.gmailClientSecret || !env.communicationEncryptionKey) {
      return reply.code(409).send({
        message: "Gmail OAuth needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and COMMUNICATION_ENCRYPTION_KEY."
      });
    }
    const body = z.object({ returnUrl: z.string().default("/email-settings") }).parse(request.body ?? {});
    const state = randomBytes(32).toString("base64url");
    await prisma.oAuthState.create({
      data: {
        stateHash: sha256(state),
        provider: "GMAIL",
        returnUrl: safeReturnUrl(body.returnUrl),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });
    return { authorizationUrl: gmail.authorizationUrl(state) };
  });

  app.get("/communications/oauth/gmail/callback", async (request, reply) => {
    const query = z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }).parse(request.query);
    if (query.error) return reply.redirect(`${env.webUrl}/communications?error=${encodeURIComponent(query.error)}`);
    if (!query.code || !query.state) return reply.redirect(`${env.webUrl}/communications?error=missing_oauth_response`);
    const state = await prisma.oAuthState.findUnique({ where: { stateHash: sha256(query.state) } });
    if (!state || state.consumedAt || state.expiresAt < new Date()) {
      return reply.redirect(`${env.webUrl}/communications?error=invalid_oauth_state`);
    }
    try {
      const tokens = await gmail.exchangeCode(query.code);
      const profile = await gmail.getProfile(tokens.access_token);
      const existing = await prisma.channelConnection.findUnique({
        where: { provider_emailAddress: { provider: "GMAIL", emailAddress: normalizeAddress(profile.emailAddress) } }
      });
      const refreshTokenEncrypted = tokens.refresh_token
        ? encryptSecret(tokens.refresh_token, env.communicationEncryptionKey)
        : existing?.refreshTokenEncrypted;
      if (!refreshTokenEncrypted) throw new Error("Google did not return a refresh token. Reconnect with consent.");
      const connection = await prisma.channelConnection.upsert({
        where: { provider_emailAddress: { provider: "GMAIL", emailAddress: normalizeAddress(profile.emailAddress) } },
        create: {
          provider: "GMAIL",
          channel: "EMAIL",
          emailAddress: normalizeAddress(profile.emailAddress),
          providerAccountId: profile.emailAddress,
          accessTokenEncrypted: encryptSecret(tokens.access_token, env.communicationEncryptionKey),
          refreshTokenEncrypted,
          accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          grantedScopes: tokens.scope?.split(" ") ?? [],
          status: "CONNECTED",
          syncCursor: oauthSyncCursor(null, profile.historyId)
        },
        update: {
          accessTokenEncrypted: encryptSecret(tokens.access_token, env.communicationEncryptionKey),
          refreshTokenEncrypted,
          accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          grantedScopes: tokens.scope?.split(" ") ?? existing?.grantedScopes ?? [],
          status: "CONNECTED",
          // Preserve the previous cursor so reconciliation can recover mail received while disconnected.
          syncCursor: oauthSyncCursor(existing, profile.historyId),
          lastError: null
        }
      });
      await prisma.oAuthState.update({ where: { id: state.id }, data: { consumedAt: new Date() } });
      await prisma.connectionEvent.create({
        data: {
          connectionId: connection.id,
          type: existing ? "OAUTH_RECONNECTED" : "OAUTH_CONNECTED",
          outcome: "PASS",
          details: existing ? "Google consent refreshed the existing mailbox connection." : "Google consent created the mailbox connection.",
          metadata: { grantedScopeCount: tokens.scope?.split(" ").filter(Boolean).length ?? 0 }
        }
      });
      await queueGmailSync(connection.id);
      return reply.redirect(`${env.webUrl}${state.returnUrl}?connected=gmail`);
    } catch (error) {
      app.log.error(error);
      return reply.redirect(`${env.webUrl}${state.returnUrl}?error=gmail_connection_failed`);
    }
  });

  app.patch("/communications/accounts/:id/disconnect", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.channelConnection.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Mailbox not found." });
    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.channelConnection.update({
        where: { id },
        data: {
          status: "DISCONNECTED",
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          accessTokenExpiresAt: null,
          watchExpirationAt: null,
          lastError: null
        }
      });
      await tx.connectionEvent.create({
        data: {
          connectionId: id,
          type: "DISCONNECTED",
          outcome: "PASS",
          details: "Local OAuth tokens were removed. Google access was not revoked."
        }
      });
      await tx.scheduledMessage.updateMany({
        where: { message: { connectionId: id }, status: { in: ["PENDING", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), lastError: "Sending mailbox disconnected." }
      });
      await tx.message.updateMany({
        where: { connectionId: id, status: { in: ["APPROVED", "SCHEDULED", "QUEUED"] } },
        data: { status: "CANCELLED", failureReason: "Sending mailbox disconnected." }
      });
      await tx.campaignLaunch.updateMany({
        where: { connectionId: id, status: { in: ["AWAITING_APPROVAL", "PREPARING", "READY_TO_SEND", "LAUNCHED"] } },
        data: { status: "PAUSED" }
      });
      return updated;
    });
    return reply.send(account);
  });

  app.post("/communications/accounts/:id/sync", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const account = await prisma.channelConnection.findUnique({ where: { id } });
    if (!account || account.status !== "CONNECTED") return reply.code(409).send({ message: "Mailbox is not connected." });
    return reply.code(202).send(await queueGmailSync(id));
  });

  app.get("/conversations", async (request) => {
    const query = z.object({
      companyId: z.string().optional(),
      channel: z.nativeEnum(CommunicationChannel).optional(),
      status: z.enum(["OPEN", "NEEDS_REPLY", "AWAITING_PROSPECT", "CLOSED"]).optional(),
      q: z.string().optional(),
      limit: z.coerce.number().min(1).max(250).default(100)
    }).parse(request.query);
    return prisma.conversation.findMany({
      where: {
        companyId: query.companyId,
        channel: query.channel,
        status: query.status,
        OR: query.q ? [
          { subject: { contains: query.q, mode: "insensitive" } },
          { company: { name: { contains: query.q, mode: "insensitive" } } },
          { participants: { some: { address: { contains: query.q, mode: "insensitive" } } } }
        ] : undefined
      },
      take: query.limit,
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      include: {
        company: { include: { leadScore: true, crmItem: true } },
        connection: { select: { id: true, provider: true, emailAddress: true, status: true } },
        participants: true,
        intelligence: { orderBy: { createdAt: "desc" }, take: 1 },
        recommendedActions: { where: { status: "PENDING" }, orderBy: [{ priority: "asc" }, { deadlineAt: "asc" }], take: 1 },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { recipients: true, events: { orderBy: { occurredAt: "desc" }, take: 3 } }
        }
      }
    });
  });

  app.get("/conversations/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        company: { include: { contacts: true, leadScore: true, crmItem: true, opportunities: { take: 1 } } },
        connection: { select: { id: true, provider: true, emailAddress: true, status: true } },
        participants: true,
        intelligenceSummary: true,
        intelligence: { orderBy: { createdAt: "desc" }, take: 10 },
        recommendedActions: { orderBy: { createdAt: "desc" }, take: 10 },
        objections: { orderBy: { createdAt: "desc" }, take: 10 },
        meetingIntents: { orderBy: { createdAt: "desc" }, take: 5 },
        suggestedReplies: { orderBy: { createdAt: "desc" }, take: 10 },
        salesTasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: [{ priority: "asc" }, { dueAt: "asc" }] },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            recipients: true,
            attachments: true,
            events: { orderBy: { occurredAt: "asc" } },
            approval: true,
            schedule: true
          }
        }
      }
    });
    return conversation ?? reply.code(404).send({ message: "Conversation not found" });
  });

  app.post("/messages/drafts", async (request, reply) => {
    const body = z.object({
      companyId: z.string(),
      contactId: z.string().optional(),
      connectionId: z.string().optional(),
      conversationId: z.string().optional(),
      to: z.string().email(),
      cc: z.array(z.string().email()).default([]),
      bcc: z.array(z.string().email()).default([]),
      subject: z.string().min(1).max(500),
      bodyText: z.string().min(1).max(100_000),
      bodyHtml: z.string().max(250_000).optional(),
      templateId: z.string().optional()
    }).parse(request.body);
    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company) return reply.code(404).send({ message: "Lead not found" });
    const connection = body.connectionId
      ? await prisma.channelConnection.findUnique({ where: { id: body.connectionId } })
      : await prisma.channelConnection.findFirst({ where: { provider: "GMAIL", status: "CONNECTED" }, orderBy: { updatedAt: "desc" } });
    const normalizedTo = normalizeAddress(body.to);
    const conversation = body.conversationId
      ? await prisma.conversation.findUnique({ where: { id: body.conversationId } })
      : await prisma.conversation.create({
          data: {
            companyId: company.id,
            connectionId: connection?.id,
            channel: "EMAIL",
            subject: body.subject,
            status: "OPEN",
            participants: {
              create: [{ contactId: body.contactId, address: body.to, normalizedAddress: normalizedTo, role: "RECIPIENT" }]
            }
          }
        });
    if (!conversation) return reply.code(404).send({ message: "Conversation not found" });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        companyId: company.id,
        contactId: body.contactId,
        connectionId: connection?.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: "PENDING_APPROVAL",
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml,
        metadata: body.templateId ? { templateId: body.templateId } : undefined,
        recipients: {
          create: [
            { contactId: body.contactId, type: "TO", address: body.to, normalizedAddress: normalizedTo },
            ...body.cc.map((address) => ({ type: "CC" as const, address, normalizedAddress: normalizeAddress(address) })),
            ...body.bcc.map((address) => ({ type: "BCC" as const, address, normalizedAddress: normalizeAddress(address) }))
          ]
        },
        events: { create: [{ type: "CREATED" }, { type: "APPROVAL_REQUESTED" }] },
        approval: {
          create: {
            status: "PENDING",
            reason: "First-touch and replies require operator approval by default.",
            riskFlags: buildRiskFlags(company, connection)
          }
        }
      },
      include: { recipients: true, approval: true }
    });
    await prisma.activity.create({
      data: {
        companyId: company.id,
        type: "MESSAGE_DRAFTED",
        summary: `Email draft created for ${body.to}`,
        metadata: { messageId: message.id, conversationId: conversation.id, channel: "EMAIL" }
      }
    });
    return reply.code(201).send(message);
  });

  app.patch("/messages/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      subject: z.string().min(1).max(500).optional(),
      bodyText: z.string().min(1).max(100_000).optional(),
      bodyHtml: z.string().max(250_000).nullable().optional()
    }).parse(request.body);
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message || !["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(message.status)) {
      return reply.code(409).send({ message: "Only unsent messages can be edited." });
    }
    return prisma.message.update({ where: { id }, data: body });
  });

  app.post("/messages/:id/approve", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reviewNote: z.string().max(2000).optional() }).parse(request.body ?? {});
    const message = await prisma.message.findUnique({ where: { id }, include: { approval: true } });
    if (!message?.approval) return reply.code(404).send({ message: "Approval request not found." });
    const [, updatedMessage] = await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { messageId: id },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: "Internal operator", reviewNote: body.reviewNote }
      }),
      prisma.message.update({ where: { id }, data: { status: "APPROVED", events: { create: { type: "APPROVED" } } } })
    ]);
    return reply.send(updatedMessage);
  });

  app.post("/messages/:id/reject", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reviewNote: z.string().max(2000).optional() }).parse(request.body ?? {});
    await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { messageId: id },
        data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: "Internal operator", reviewNote: body.reviewNote }
      }),
      prisma.message.update({ where: { id }, data: { status: "CANCELLED", events: { create: { type: "REJECTED" } } } })
    ]);
    return reply.send({ ok: true });
  });

  app.post("/messages/:id/submit", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      scheduledAt: z.coerce.date().optional(),
      recipientTimezone: z.string().min(1).max(80).default("UTC")
    }).parse(request.body ?? {});
    const message = await prisma.message.findUnique({ where: { id }, include: { approval: true } });
    if (!message) return reply.code(404).send({ message: "Message not found." });
    const submissionIssue = messageSubmissionIssue({ status: message.status, approvalStatus: message.approval?.status });
    if (submissionIssue) return reply.code(409).send({ message: submissionIssue });
    if (body.scheduledAt && body.scheduledAt <= new Date()) return reply.code(400).send({ message: "Scheduled time must be in the future." });
    const queued = await queueCommunicationSend(id, body.scheduledAt);
    if (body.scheduledAt) {
      await prisma.scheduledMessage.upsert({
        where: { messageId: id },
        create: { messageId: id, dueAt: body.scheduledAt, recipientTimezone: body.recipientTimezone, queueJobId: queued.queueJobId, status: "QUEUED" },
        update: { dueAt: body.scheduledAt, recipientTimezone: body.recipientTimezone, queueJobId: queued.queueJobId, status: "QUEUED", lastError: null, cancelledAt: null }
      });
    }
    await prisma.message.update({
      where: { id },
      data: {
        status: body.scheduledAt ? "SCHEDULED" : "QUEUED",
        scheduledAt: body.scheduledAt,
        events: { create: { type: body.scheduledAt ? "SCHEDULED" : "QUEUED" } }
      }
    });
    return reply.code(202).send(queued.trackedJob);
  });

  app.get("/message-templates", async () => {
    return prisma.messageTemplate.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  });

  app.get("/sequences", async () => {
    return prisma.sequence.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        steps: { orderBy: { position: "asc" } },
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          take: 50,
          include: {
            company: { select: { id: true, name: true, trustStatus: true } },
            contact: { select: { id: true, value: true, contactabilityState: true } }
          }
        },
        _count: { select: { enrollments: true } }
      }
    });
  });

  app.post("/message-templates", async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      category: z.nativeEnum(TemplateCategory),
      channel: z.nativeEnum(CommunicationChannel).default("EMAIL"),
      subject: z.string().optional(),
      body: z.string().min(1),
      variables: z.array(z.string()).default([]),
      approvalMode: z.nativeEnum(ApprovalMode).default("REQUIRED")
    }).parse(request.body);
    return reply.code(201).send(await prisma.messageTemplate.create({ data: body }));
  });

  app.get("/approval-requests", async () => {
    return prisma.approvalRequest.findMany({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
        message: { status: { in: ["PENDING_APPROVAL", "APPROVED"] } }
      },
      orderBy: { requestedAt: "asc" },
      include: {
        message: {
          include: {
            company: { select: { id: true, name: true, trustStatus: true, overallConfidence: true } },
            recipients: true,
            connection: { select: { emailAddress: true, status: true } }
          }
        }
      }
    });
  });

  app.get("/suppressions", async () => {
    return prisma.suppressionEntry.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } }, contact: true }
    });
  });

  app.post("/suppressions", async (request, reply) => {
    const body = z.object({
      channel: z.nativeEnum(CommunicationChannel).default("EMAIL"),
      scope: z.nativeEnum(SuppressionScope),
      normalizedDestination: z.string().optional(),
      companyId: z.string().optional(),
      contactId: z.string().optional(),
      domain: z.string().optional(),
      reason: z.nativeEnum(SuppressionReason),
      details: z.string().max(2000).optional()
    }).parse(request.body);
    if (!body.normalizedDestination && !body.companyId && !body.contactId && !body.domain && body.scope !== "WORKSPACE") {
      return reply.code(400).send({ message: "Suppression target is required." });
    }
    const suppression = await prisma.suppressionEntry.create({
      data: {
        ...body,
        normalizedDestination: body.normalizedDestination ? normalizeAddress(body.normalizedDestination) : undefined,
        domain: body.domain?.toLowerCase()
      }
    });
    if (body.contactId) {
      await prisma.contact.update({
        where: { id: body.contactId },
        data: {
          doNotContact: true,
          contactabilityState: body.reason === "UNSUBSCRIBED" ? "UNSUBSCRIBED" : "DO_NOT_CONTACT",
          contactabilityUpdatedAt: new Date()
        }
      });
    }
    return reply.code(201).send(suppression);
  });

  app.patch("/suppressions/:id/revoke", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return reply.send(await prisma.suppressionEntry.update({ where: { id }, data: { active: false, revokedAt: new Date() } }));
  });

  app.post("/communications/webhooks/gmail", async (request, reply) => {
    if (!env.gmailWebhookToken || !safeTokenEquals(String(request.headers["x-prospectpilot-webhook-token"] || ""), env.gmailWebhookToken)) {
      return reply.code(401).send({ message: "Webhook authentication failed." });
    }
    const body = z.object({
      message: z.object({
        data: z.string(),
        messageId: z.string(),
        publishTime: z.string().optional()
      }),
      subscription: z.string().optional()
    }).parse(request.body);
    const event = await prisma.webhookEvent.upsert({
      where: { provider_externalId: { provider: "GMAIL", externalId: body.message.messageId } },
      create: { provider: "GMAIL", externalId: body.message.messageId, eventType: "MAILBOX_CHANGE", payload: body },
      update: {}
    });
    if (event.status !== "RECEIVED") return reply.send({ ok: true, duplicate: true });
    try {
      const decoded = JSON.parse(Buffer.from(body.message.data, "base64url").toString("utf8")) as { emailAddress: string; historyId: string };
      const connection = await prisma.channelConnection.findUnique({
        where: { provider_emailAddress: { provider: "GMAIL", emailAddress: normalizeAddress(decoded.emailAddress) } }
      });
      if (connection) await queueGmailSync(connection.id);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: connection ? "PROCESSED" : "IGNORED", processedAt: new Date() }
      });
      return reply.send({ ok: true });
    } catch (error) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message : "Invalid notification" }
      });
      return reply.code(400).send({ message: "Invalid Gmail notification." });
    }
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeReturnUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/email-settings";
}

function safeTokenEquals(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildRiskFlags(company: { trustStatus: string; overallConfidence: number }, connection: { status: string } | null) {
  return [
    company.trustStatus !== "VERIFIED" ? `LEAD_${company.trustStatus}` : "",
    company.overallConfidence < 60 ? "LOW_DATA_CONFIDENCE" : "",
    !connection ? "NO_SENDING_ACCOUNT" : connection.status !== "CONNECTED" ? "MAILBOX_NOT_CONNECTED" : ""
  ].filter(Boolean);
}
