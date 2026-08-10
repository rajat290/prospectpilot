import { CampaignLaunchStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  appendOptOutLine,
  campaignAddressIssues,
  decryptSecret,
  encryptSecret,
  extractDomain,
  GmailAdapter,
  normalizeAddress,
  planCampaignSchedule
} from "@prospectpilot/communications";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "./env.js";
import {
  cancelCommunicationSend,
  queueCommunicationSend,
  queueGmailSync,
  queueSequenceProcessing
} from "./queues.js";

const gmail = new GmailAdapter({
  clientId: env.gmailClientId,
  clientSecret: env.gmailClientSecret,
  redirectUri: env.gmailRedirectUri,
  pubsubTopic: env.gmailPubsubTopic
});

export async function registerPhase9CRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/communications/acceptance-readiness", async () => {
    const accounts = await prisma.channelConnection.findMany({
      where: { provider: "GMAIL" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        emailAddress: true,
        status: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        accessTokenExpiresAt: true,
        lastSyncedAt: true,
        syncCursor: true,
        lastError: true,
        _count: { select: { connectionEvents: true, conversations: true, messages: true } }
      }
    });
    const realAccounts = accounts.map(({ accessTokenEncrypted, refreshTokenEncrypted, syncCursor, ...account }) => ({
      ...account,
      accessTokenStoredEncrypted: Boolean(accessTokenEncrypted && accessTokenEncrypted.startsWith("v1.")),
      refreshTokenStoredEncrypted: Boolean(refreshTokenEncrypted && refreshTokenEncrypted.startsWith("v1.")),
      syncCursorPresent: Boolean(syncCursor)
    }));
    return {
      phase: "9C",
      implementationReady: true,
      providerActivationRequired: !env.gmailClientId || !env.gmailClientSecret,
      credentials: {
        encryptionKey: Boolean(env.communicationEncryptionKey),
        gmailClientId: Boolean(env.gmailClientId),
        gmailClientSecret: Boolean(env.gmailClientSecret),
        redirectUri: env.gmailRedirectUri,
        pubsub: Boolean(env.gmailPubsubTopic && env.gmailWebhookToken),
        attachmentSigning: Boolean(env.attachmentSigningKey || env.communicationEncryptionKey)
      },
      accounts: realAccounts
    };
  });

  app.get("/communications/accounts/:id/events", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const account = await prisma.channelConnection.findUnique({ where: { id }, select: { id: true } });
    if (!account) return reply.code(404).send({ message: "Mailbox not found." });
    return prisma.connectionEvent.findMany({ where: { connectionId: id }, orderBy: { occurredAt: "desc" }, take: 100 });
  });

  app.post("/communications/accounts/:id/refresh-test", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const account = await prisma.channelConnection.findUnique({ where: { id } });
    if (!account || account.provider !== "GMAIL") return reply.code(404).send({ message: "Gmail mailbox not found." });
    if (!account.refreshTokenEncrypted || !env.communicationEncryptionKey) {
      return reply.code(409).send({ message: "Encrypted refresh token is unavailable." });
    }
    try {
      const refreshed = await gmail.refreshToken(decryptSecret(account.refreshTokenEncrypted, env.communicationEncryptionKey));
      const profile = await gmail.getProfile(refreshed.access_token);
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await prisma.$transaction([
        prisma.channelConnection.update({
          where: { id },
          data: {
            accessTokenEncrypted: encryptSecret(refreshed.access_token, env.communicationEncryptionKey),
            accessTokenExpiresAt: expiresAt,
            status: "CONNECTED",
            lastError: null
          }
        }),
        prisma.connectionEvent.create({
          data: {
            connectionId: id,
            type: "TOKEN_REFRESH_TEST",
            outcome: "PASS",
            details: "Google refreshed the access token and returned the connected mailbox profile.",
            metadata: { profileMatches: normalizeAddress(profile.emailAddress) === normalizeAddress(account.emailAddress), expiresAt }
          }
        })
      ]);
      return { ok: true, profileMatches: normalizeAddress(profile.emailAddress) === normalizeAddress(account.emailAddress), expiresAt };
    } catch (error) {
      const reason = sanitizeProviderError(error);
      await prisma.$transaction([
        prisma.channelConnection.update({ where: { id }, data: { status: providerAuthFailure(error) ? "EXPIRED" : "ERROR", lastError: reason } }),
        prisma.connectionEvent.create({
          data: { connectionId: id, type: "TOKEN_REFRESH_TEST", outcome: "FAIL", details: reason }
        })
      ]);
      return reply.code(502).send({ message: reason });
    }
  });

  app.post("/communications/accounts/:id/revoke", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ confirmation: z.literal("REVOKE") }).parse(request.body);
    void body;
    const account = await prisma.channelConnection.findUnique({ where: { id } });
    if (!account || account.provider !== "GMAIL") return reply.code(404).send({ message: "Gmail mailbox not found." });
    if (!account.refreshTokenEncrypted || !env.communicationEncryptionKey) {
      return reply.code(409).send({ message: "Mailbox has no provider token to revoke." });
    }
    try {
      await gmail.revokeToken(decryptSecret(account.refreshTokenEncrypted, env.communicationEncryptionKey));
      await disconnectMailbox(id, prisma, "Provider access revoked and local tokens removed.", "ACCESS_REVOKED");
      return { ok: true };
    } catch (error) {
      const reason = sanitizeProviderError(error);
      await prisma.connectionEvent.create({ data: { connectionId: id, type: "ACCESS_REVOKE", outcome: "FAIL", details: reason } });
      return reply.code(502).send({ message: reason });
    }
  });

  app.get("/campaigns/readiness", async (request) => {
    const query = z.object({
      sequenceId: z.string().optional(),
      country: z.string().optional(),
      realRevenueOnly: z.coerce.boolean().default(true),
      limit: z.coerce.number().int().min(1).max(500).default(250)
    }).parse(request.query);
    const sequence = query.sequenceId
      ? await prisma.sequence.findUnique({ where: { id: query.sequenceId } })
      : await prisma.sequence.findFirst({ where: { status: "ACTIVE", channel: "EMAIL" }, orderBy: { updatedAt: "desc" } });
    const contacts = await prisma.contact.findMany({
      where: {
        type: "EMAIL",
        company: query.country ? { country: { equals: query.country, mode: "insensitive" } } : undefined
      },
      take: query.limit,
      orderBy: [{ company: { leadScore: { score: "desc" } } }, { confidence: "desc" }],
      include: {
        company: {
          include: {
            leadSource: { select: { id: true, name: true, url: true, dataOrigin: true } },
            leadScore: true,
            crmItem: true,
            opportunities: { orderBy: { confidence: "desc" }, take: 1 }
          }
        },
        communicationPreferences: true
      }
    });
    const evaluated = await evaluateCampaignContacts(prisma, contacts, sequence?.id);
    const visible = query.realRevenueOnly ? evaluated.filter((item) => item.origin === "REAL") : evaluated;
    const connectedMailboxes = await prisma.channelConnection.findMany({
      where: { provider: "GMAIL", channel: "EMAIL", status: "CONNECTED" },
      select: { id: true, emailAddress: true, displayName: true, lastSyncedAt: true }
    });
    const realRevenueSummary = summarizeRealRevenueReadiness(evaluated);
    return {
      codeReady: true,
      providerReady: connectedMailboxes.length > 0,
      sequence,
      connectedMailboxes,
      totalContacts: contacts.length,
      realRevenueOnly: query.realRevenueOnly,
      realRevenueSummary,
      eligibleCount: visible.filter((item) => item.eligible).length,
      blockedCount: visible.filter((item) => !item.eligible).length,
      excludedNoiseCount: evaluated.filter((item) => item.origin !== "REAL").length,
      eligible: visible.filter((item) => item.eligible),
      blocked: visible.filter((item) => !item.eligible),
      launchCap: sequence?.maxLaunchSize ?? 100
    };
  });

  app.get("/campaigns/launches", async () => {
    return prisma.campaignLaunch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        sequence: { select: { id: true, name: true, status: true, dailyLimit: true, perDomainLimit: true, sendingTimezone: true } },
        connection: { select: { id: true, emailAddress: true, status: true } },
        enrollments: {
          orderBy: { enrolledAt: "asc" },
          include: {
            company: { select: { id: true, name: true, country: true } },
            contact: { select: { id: true, value: true, contactabilityState: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, scheduledAt: true } }
          }
        }
      }
    });
  });

  app.post("/campaigns/launches", async (request, reply) => {
    const body = z.object({
      sequenceId: z.string(),
      connectionId: z.string(),
      contactIds: z.array(z.string()).min(1).max(100),
      confirmation: z.string()
    }).parse(request.body);
    if (body.confirmation !== `PREPARE ${body.contactIds.length}`) {
      return reply.code(400).send({ message: `Type PREPARE ${body.contactIds.length} to confirm this campaign selection.` });
    }
    const [sequence, connection, contacts] = await Promise.all([
      prisma.sequence.findUnique({ where: { id: body.sequenceId } }),
      prisma.channelConnection.findUnique({ where: { id: body.connectionId } }),
      prisma.contact.findMany({
        where: { id: { in: body.contactIds } },
        include: {
          company: { include: { leadSource: { select: { id: true, name: true, url: true, dataOrigin: true } }, leadScore: true, crmItem: true, opportunities: { orderBy: { confidence: "desc" }, take: 1 } } },
          communicationPreferences: true
        }
      })
    ]);
    if (!sequence || sequence.status !== "ACTIVE" || sequence.channel !== "EMAIL") {
      return reply.code(409).send({ message: "An active email sequence is required." });
    }
    if (body.contactIds.length > sequence.maxLaunchSize) {
      return reply.code(409).send({ message: `Sequence launch cap is ${sequence.maxLaunchSize}.` });
    }
    if (!connection || connection.provider !== "GMAIL" || connection.status !== "CONNECTED") {
      return reply.code(409).send({ message: "Select a connected real Gmail mailbox." });
    }
    if (contacts.length !== body.contactIds.length) return reply.code(404).send({ message: "One or more contacts were not found." });
    const evaluated = await evaluateCampaignContacts(prisma, contacts, sequence.id);
    const blocked = evaluated.filter((item) => !item.eligible);
    if (blocked.length) {
      return reply.code(409).send({ message: "Campaign contains blocked contacts.", blocked });
    }
    const launch = await prisma.$transaction(async (tx) => {
      const created = await tx.campaignLaunch.create({
        data: {
          sequenceId: sequence.id,
          connectionId: connection.id,
          status: "AWAITING_APPROVAL",
          requestedCount: contacts.length,
          eligibleCount: contacts.length,
          blockedCount: 0,
          enrolledCount: contacts.length,
          selection: evaluated,
          diagnostics: {
            dailyLimit: sequence.dailyLimit,
            perDomainLimit: sequence.perDomainLimit,
            minIntervalSeconds: sequence.minIntervalSeconds,
            timezone: sequence.sendingTimezone,
            requireOptOut: sequence.requireOptOut
          }
        }
      });
      for (const contact of contacts) {
        await tx.sequenceEnrollment.upsert({
          where: { sequenceId_contactId: { sequenceId: sequence.id, contactId: contact.id } },
          create: {
            sequenceId: sequence.id,
            campaignLaunchId: created.id,
            companyId: contact.companyId,
            contactId: contact.id,
            status: "PENDING_APPROVAL"
          },
          update: {
            campaignLaunchId: created.id,
            status: "PENDING_APPROVAL",
            currentStep: 0,
            nextStepAt: null,
            exitReason: null,
            approvedAt: null,
            completedAt: null
          }
        });
        await tx.activity.create({
          data: {
            companyId: contact.companyId,
            type: "CAMPAIGN_SELECTED",
            summary: `Selected for ${sequence.name}`,
            metadata: { launchId: created.id, sequenceId: sequence.id, contactId: contact.id }
          }
        });
      }
      await tx.sequence.update({ where: { id: sequence.id }, data: { connectionId: connection.id } });
      return created;
    });
    return reply.code(201).send(launch);
  });

  app.post("/campaigns/launches/:id/approve", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ confirmation: z.string() }).parse(request.body);
    const launch = await prisma.campaignLaunch.findUnique({ where: { id }, include: { enrollments: true } });
    if (!launch || launch.status !== "AWAITING_APPROVAL") return reply.code(409).send({ message: "Campaign launch is not awaiting approval." });
    if (body.confirmation !== `APPROVE ${launch.enrolledCount}`) {
      return reply.code(400).send({ message: `Type APPROVE ${launch.enrolledCount} to approve campaign enrollments.` });
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.sequenceEnrollment.updateMany({
        where: { campaignLaunchId: id, status: "PENDING_APPROVAL" },
        data: { status: "ACTIVE", approvedAt: now, approvedBy: "Internal operator", nextStepAt: now }
      }),
      prisma.campaignLaunch.update({ where: { id }, data: { status: "PREPARING", approvedAt: now } })
    ]);
    for (const enrollment of launch.enrollments) await queueSequenceProcessing(enrollment.id, now);
    return reply.code(202).send({ ok: true, queuedEnrollments: launch.enrollments.length });
  });

  app.post("/campaigns/launches/:id/launch", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      confirmation: z.string(),
      startAt: z.coerce.date().optional()
    }).parse(request.body);
    const launch = await prisma.campaignLaunch.findUnique({
      where: { id },
      include: {
        connection: true,
        sequence: true,
        enrollments: {
          include: {
            contact: true,
            messages: {
              where: { direction: "OUTBOUND", status: "PENDING_APPROVAL" },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { approval: true, recipients: true }
            }
          }
        }
      }
    });
    if (!launch || !["PREPARING", "READY_TO_SEND"].includes(launch.status)) {
      return reply.code(409).send({ message: "Campaign is not ready to launch." });
    }
    const messages = launch.enrollments.flatMap((enrollment) => enrollment.messages);
    if (messages.length !== launch.enrolledCount) {
      return reply.code(409).send({
        message: `Campaign drafts are still preparing. ${messages.length} of ${launch.enrolledCount} are ready.`,
        ready: messages.length,
        expected: launch.enrolledCount
      });
    }
    if (body.confirmation !== `LAUNCH ${messages.length}`) {
      return reply.code(400).send({ message: `Type LAUNCH ${messages.length} to schedule these approved emails.` });
    }
    if (launch.connection.status !== "CONNECTED" || launch.connection.provider !== "GMAIL") {
      return reply.code(409).send({ message: "Campaign Gmail mailbox is not connected." });
    }
    const startAt = new Date(Math.max(body.startAt?.getTime() ?? 0, Date.now() + 2 * 60_000));
    const schedule = planCampaignSchedule(
      messages.map((message) => ({
        id: message.id,
        domain: extractDomain(message.recipients.find((recipient) => recipient.type === "TO")?.normalizedAddress || "")
      })),
      startAt,
      {
        timezone: launch.sequence.sendingTimezone,
        dailyLimit: launch.sequence.dailyLimit,
        perDomainLimit: launch.sequence.perDomainLimit,
        minIntervalSeconds: launch.sequence.minIntervalSeconds,
        sendWindowStartMinutes: launch.sequence.sendWindowStartMinutes,
        sendWindowEndMinutes: launch.sequence.sendWindowEndMinutes,
        skipWeekends: launch.sequence.skipWeekends
      }
    );
    for (const item of schedule) {
      const message = messages.find((candidate) => candidate.id === item.id)!;
      const queued = await queueCommunicationSend(message.id, item.dueAt);
      await prisma.$transaction([
        prisma.approvalRequest.update({
          where: { messageId: message.id },
          data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: "Campaign operator", reviewNote: `Campaign launch ${id}` }
        }),
        prisma.message.update({
          where: { id: message.id },
          data: {
            connectionId: launch.connectionId,
            status: "SCHEDULED",
            scheduledAt: item.dueAt,
            bodyText: launch.sequence.requireOptOut ? appendOptOutLine(message.bodyText) : message.bodyText,
            idempotencyKey: `campaign:${id}:message:${message.id}`,
            events: { createMany: { data: [{ type: "APPROVED" }, { type: "SCHEDULED", metadata: { launchId: id } }] } }
          }
        }),
        prisma.scheduledMessage.upsert({
          where: { messageId: message.id },
          create: {
            messageId: message.id,
            dueAt: item.dueAt,
            recipientTimezone: launch.sequence.sendingTimezone,
            queueJobId: queued.queueJobId,
            status: "QUEUED"
          },
          update: {
            dueAt: item.dueAt,
            recipientTimezone: launch.sequence.sendingTimezone,
            queueJobId: queued.queueJobId,
            status: "QUEUED",
            lastError: null,
            cancelledAt: null
          }
        })
      ]);
    }
    await prisma.campaignLaunch.update({
      where: { id },
      data: {
        status: "LAUNCHED",
        approvedMessageCount: messages.length,
        scheduledCount: schedule.length,
        launchedAt: new Date()
      }
    });
    return reply.code(202).send({
      ok: true,
      scheduled: schedule.length,
      firstSendAt: schedule[0]?.dueAt,
      lastSendAt: schedule.at(-1)?.dueAt
    });
  });

  app.post("/campaigns/launches/:id/cancel", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ confirmation: z.literal("CANCEL") }).parse(request.body);
    void body;
    const launch = await prisma.campaignLaunch.findUnique({
      where: { id },
      include: { enrollments: { include: { messages: { include: { schedule: true } } } } }
    });
    if (!launch) return reply.code(404).send({ message: "Campaign launch not found." });
    const pendingMessages = launch.enrollments.flatMap((enrollment) => enrollment.messages)
      .filter((message) => ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "QUEUED"].includes(message.status));
    for (const message of pendingMessages) {
      if (message.schedule?.queueJobId) {
        try {
          await cancelCommunicationSend(message.schedule.queueJobId);
        } catch {
          // The send-time safety checks still run when an already-active job cannot be removed.
        }
      }
    }
    await prisma.$transaction([
      prisma.message.updateMany({
        where: { id: { in: pendingMessages.map((message) => message.id) } },
        data: { status: "CANCELLED", failureReason: "Campaign cancelled by operator." }
      }),
      prisma.scheduledMessage.updateMany({
        where: { messageId: { in: pendingMessages.map((message) => message.id) } },
        data: { status: "CANCELLED", cancelledAt: new Date(), lastError: "Campaign cancelled by operator." }
      }),
      prisma.sequenceEnrollment.updateMany({
        where: { campaignLaunchId: id, status: { in: ["PENDING_APPROVAL", "ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } },
        data: { status: "STOPPED", exitReason: "Campaign cancelled by operator", completedAt: new Date(), nextStepAt: null }
      }),
      prisma.campaignLaunch.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } })
    ]);
    return { ok: true, cancelledMessages: pendingMessages.length };
  });

  app.post("/communications/accounts/:id/reconcile-test", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const account = await prisma.channelConnection.findUnique({ where: { id } });
    if (!account || account.status !== "CONNECTED") return reply.code(409).send({ message: "Connected mailbox required." });
    const job = await queueGmailSync(id);
    await prisma.connectionEvent.create({
      data: { connectionId: id, type: "RECONCILIATION_REQUESTED", outcome: "QUEUED", metadata: { jobId: job.id } }
    });
    return reply.code(202).send(job);
  });
}

async function evaluateCampaignContacts(
  prisma: PrismaClient,
  contacts: Array<{
    id: string;
    companyId: string;
    value: string;
    normalizedValue: string | null;
    trustStatus: string;
    contactabilityState: string;
    doNotContact: boolean;
    company: {
      id: string;
      name: string;
      country: string | null;
      websiteUrl?: string | null;
      email?: string | null;
      sourceUrl?: string | null;
      dataOrigin?: string;
      trustStatus: string;
      quarantinedAt: Date | null;
      leadSource?: { id: string; name: string | null; url: string; dataOrigin: string } | null;
      leadScore: { score: number } | null;
      crmItem: { status: string } | null;
      opportunities: Array<{ recommendedService: string; confidence: number }>;
    };
    communicationPreferences: Array<{ consentStatus: string; channel: string }>;
  }>,
  sequenceId?: string
) {
  const destinations = contacts.map((contact) => normalizeAddress(contact.normalizedValue || contact.value));
  const destinationOwners = new Map<string, Set<string>>();
  const canonicalContact = new Map<string, string>();
  for (const contact of contacts) {
    const destination = normalizeAddress(contact.normalizedValue || contact.value);
    const owners = destinationOwners.get(destination) ?? new Set<string>();
    owners.add(contact.companyId);
    destinationOwners.set(destination, owners);
    const companyDestination = `${contact.companyId}:${destination}`;
    if (!canonicalContact.has(companyDestination)) canonicalContact.set(companyDestination, contact.id);
  }
  const [suppressions, previousRecipients, existingEnrollments] = await Promise.all([
    prisma.suppressionEntry.findMany({
      where: {
        active: true,
        channel: "EMAIL",
        OR: [
          { scope: "WORKSPACE" },
          { normalizedDestination: { in: destinations } },
          { contactId: { in: contacts.map((contact) => contact.id) } },
          { companyId: { in: contacts.map((contact) => contact.companyId) } },
          { domain: { in: destinations.map(extractDomain).filter(Boolean) } }
        ]
      }
    }),
    prisma.messageRecipient.findMany({
      where: {
        normalizedAddress: { in: destinations },
        type: "TO",
        message: {
          direction: "OUTBOUND",
          status: { in: ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "QUEUED", "PROVIDER_SUBMITTED", "SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"] }
        }
      },
      select: { normalizedAddress: true, message: { select: { id: true, status: true } } }
    }),
    sequenceId
      ? prisma.sequenceEnrollment.findMany({
          where: { sequenceId, contactId: { in: contacts.map((contact) => contact.id) } },
          select: { contactId: true, status: true }
        })
      : Promise.resolve([])
  ]);
  return contacts.map((contact) => {
    const destination = normalizeAddress(contact.normalizedValue || contact.value);
    const domain = extractDomain(destination);
    const origin = classifyCampaignCompanyOrigin(contact.company, destination);
    const reasons: string[] = [];
    reasons.push(...campaignAddressIssues(destination));
    if (origin.origin !== "REAL") reasons.push(`Excluded from real revenue mode: ${origin.label}`);
    if ((destinationOwners.get(destination)?.size ?? 0) > 1) reasons.push("The same email address appears on multiple leads");
    if (canonicalContact.get(`${contact.companyId}:${destination}`) !== contact.id) reasons.push("Duplicate normalized email on this lead");
    if (!["VERIFIED", "PROBABLE"].includes(contact.company.trustStatus)) reasons.push(`Lead trust is ${contact.company.trustStatus}`);
    if (!["VERIFIED", "PROBABLE"].includes(contact.trustStatus)) reasons.push(`Email trust is ${contact.trustStatus}`);
    if (contact.company.quarantinedAt) reasons.push("Lead is quarantined");
    if (contact.doNotContact) reasons.push("Contact is marked do not contact");
    if (["BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(contact.contactabilityState)) {
      reasons.push(`Contactability is ${contact.contactabilityState}`);
    }
    const preference = contact.communicationPreferences.find((item) => item.channel === "EMAIL");
    if (preference && ["OPTED_OUT", "REVOKED"].includes(preference.consentStatus)) reasons.push(`Consent is ${preference.consentStatus}`);
    if (suppressions.some((item) =>
      item.scope === "WORKSPACE" ||
      item.normalizedDestination === destination ||
      item.contactId === contact.id ||
      item.companyId === contact.companyId ||
      Boolean(item.domain && item.domain === domain)
    )) reasons.push("Active suppression matches this recipient");
    if (previousRecipients.some((item) => item.normalizedAddress === destination)) reasons.push("Existing outbound message already targets this address");
    if (existingEnrollments.some((item) => item.contactId === contact.id && !["STOPPED", "EXITED_REPLY", "EXITED_BOUNCE", "EXITED_UNSUBSCRIBE", "EXITED_REJECTED"].includes(item.status))) {
      reasons.push("Contact is already enrolled in this sequence");
    }
    return {
      contactId: contact.id,
      companyId: contact.companyId,
      companyName: contact.company.name,
      destination,
      domain,
      origin: origin.origin,
      originLabel: origin.label,
      originReasons: origin.reasons,
      country: contact.company.country,
      leadScore: contact.company.leadScore?.score ?? 0,
      crmStage: contact.company.crmItem?.status ?? "NEW",
      recommendedOffer: contact.company.opportunities[0]?.recommendedService ?? null,
      eligible: reasons.length === 0,
      reasons
    };
  }).sort((left, right) => right.leadScore - left.leadScore);
}

function classifyCampaignCompanyOrigin(
  company: {
    name: string;
    websiteUrl?: string | null;
    email?: string | null;
    sourceUrl?: string | null;
    dataOrigin?: string;
    leadSource?: { name: string | null; url: string; dataOrigin: string } | null;
  },
  destination?: string
) {
  const persisted = company.dataOrigin && company.dataOrigin !== "UNKNOWN" ? company.dataOrigin : company.leadSource?.dataOrigin;
  if (persisted && persisted !== "UNKNOWN") {
    return {
      origin: persisted,
      label: persisted === "REAL" ? "Real business data" : `${titleCase(persisted)} data`,
      reasons: [`Stored origin is ${persisted}`]
    };
  }
  const values = [
    company.name,
    company.websiteUrl,
    company.email,
    company.sourceUrl,
    company.leadSource?.name,
    company.leadSource?.url,
    destination
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const joined = values.join(" ");
  const reasons: string[] = [];
  if (joined.includes("demo.prospectpilot.local") || joined.includes("demo directory")) reasons.push("Demo source detected");
  if (/\bphase\s*(9|10)|acceptance|fixture|stalled fixture/.test(joined)) reasons.push("Acceptance or fixture naming detected");
  if (/\btest\b|testing|localhost|prospectpilot\.local/.test(joined)) reasons.push("Test/local marker detected");
  if (/(^|\.)example($|[\/\s])|\.example\b|@[^@\s]+\.example\b/.test(joined)) reasons.push("Reserved example domain detected");
  if (reasons.length) {
    const origin = reasons.some((reason) => reason.includes("Demo")) ? "DEMO" : reasons.some((reason) => reason.includes("fixture") || reason.includes("Acceptance")) ? "FIXTURE" : "TEST";
    return { origin, label: `${titleCase(origin)} data`, reasons };
  }
  return { origin: "REAL", label: "Real business data", reasons: ["No demo, test or fixture marker detected"] };
}

function summarizeRealRevenueReadiness(items: Array<{ origin: string; eligible: boolean; reasons: string[] }>) {
  const summary = {
    real: 0,
    demo: 0,
    test: 0,
    fixture: 0,
    unknown: 0,
    realEligible: 0,
    realBlocked: 0,
    excludedNoise: 0,
    topBlockReasons: [] as Array<{ reason: string; count: number }>
  };
  const reasonCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.origin.toLowerCase() as "real" | "demo" | "test" | "fixture" | "unknown";
    if (key in summary) summary[key] += 1;
    if (item.origin === "REAL" && item.eligible) summary.realEligible += 1;
    if (item.origin === "REAL" && !item.eligible) {
      summary.realBlocked += 1;
      for (const reason of item.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    if (item.origin !== "REAL") summary.excludedNoise += 1;
  }
  summary.topBlockReasons = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
  return summary;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

async function disconnectMailbox(id: string, prisma: PrismaClient, details: string, type = "DISCONNECTED") {
  await prisma.$transaction([
    prisma.channelConnection.update({
      where: { id },
      data: {
        status: "DISCONNECTED",
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        watchExpirationAt: null,
        lastError: null
      }
    }),
    prisma.connectionEvent.create({ data: { connectionId: id, type, outcome: "PASS", details } })
  ]);
}

function sanitizeProviderError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Gmail provider operation failed.";
  return raw
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/access_token[\"'=:\s]+[^,\"'\s}]+/gi, "access_token=[redacted]")
    .slice(0, 1000);
}

function providerAuthFailure(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /HTTP (400|401|403)|invalid_grant|invalid_token|unauthorized/i.test(value);
}

export function asCampaignJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function campaignStatus(value: string) {
  return value as CampaignLaunchStatus;
}
