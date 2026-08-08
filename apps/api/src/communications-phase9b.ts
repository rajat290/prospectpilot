import {
  BounceCategory,
  InboundReviewStatus,
  MessageEventType,
  PrismaClient,
  SequenceEnrollmentStatus
} from "@prisma/client";
import {
  createAttachmentSignature,
  normalizeAddress,
  readStoredAttachment,
  storeAttachment,
  verifyAttachmentSignature
} from "@prospectpilot/communications";
import { normalizeBusinessName } from "@prospectpilot/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "./env.js";
import { cancelCommunicationSend, queueCommunicationSend, queueSequenceProcessing } from "./queues.js";

const localSigningKey = "prospectpilot-localhost-attachment-signing-key";

export async function registerPhase9BRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post("/messages/:id/attachments", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({
      fileName: z.string().min(1).max(240),
      mimeType: z.string().min(1).max(160)
    }).parse(request.query);
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message || !["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(message.status)) {
      return reply.code(409).send({ message: "Attachments can only be changed before provider submission." });
    }
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ message: "Binary attachment body is required." });
    try {
      const stored = await storeAttachment({
        bytes: request.body,
        fileName: query.fileName,
        mimeType: query.mimeType,
        storageRoot: env.attachmentStorageRoot
      });
      const attachment = await prisma.attachment.create({ data: { messageId: id, ...stored } });
      await prisma.messageEvent.create({
        data: { messageId: id, type: "CREATED", metadata: { attachmentId: attachment.id, action: "ATTACHMENT_ADDED" } }
      });
      return reply.code(stored.scanStatus === "CLEAN" ? 201 : 422).send(attachment);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Attachment rejected." });
    }
  });

  app.delete("/attachments/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { message: true } });
    if (!attachment || !["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(attachment.message.status)) {
      return reply.code(409).send({ message: "Attachment cannot be removed after provider submission." });
    }
    await prisma.attachment.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  app.get("/attachments/:id/url", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment || attachment.scanStatus !== "CLEAN" || !attachment.storageKey) {
      return reply.code(404).send({ message: "Clean attachment is not available." });
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const signature = createAttachmentSignature(id, expiresAt, attachmentSigningKey());
    return { url: `/attachments/${id}/download?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`, expiresAt };
  });

  app.get("/attachments/:id/download", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ expires: z.coerce.number().int(), signature: z.string() }).parse(request.query);
    if (!verifyAttachmentSignature(id, query.expires, query.signature, attachmentSigningKey())) {
      return reply.code(401).send({ message: "Attachment link is invalid or expired." });
    }
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment?.storageKey || attachment.scanStatus !== "CLEAN") return reply.code(404).send({ message: "Attachment unavailable." });
    const bytes = await readStoredAttachment(env.attachmentStorageRoot, attachment.storageKey);
    return reply
      .header("content-type", attachment.mimeType)
      .header("content-disposition", `attachment; filename="${attachment.fileName.replace(/"/g, "_")}"`)
      .header("x-content-type-options", "nosniff")
      .send(bytes);
  });

  app.get("/scheduled-messages", async () => {
    return prisma.scheduledMessage.findMany({
      orderBy: { dueAt: "asc" },
      include: {
        message: {
          include: {
            company: { select: { id: true, name: true, trustStatus: true } },
            recipients: true,
            connection: { select: { provider: true, emailAddress: true, status: true } },
            approval: true
          }
        }
      }
    });
  });

  app.patch("/scheduled-messages/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      dueAt: z.coerce.date(),
      recipientTimezone: z.string().min(1).max(80).default("UTC")
    }).parse(request.body);
    if (body.dueAt <= new Date(Date.now() + 60_000)) return reply.code(400).send({ message: "Schedule at least one minute in the future." });
    const schedule = await prisma.scheduledMessage.findUnique({ where: { id }, include: { message: { include: { approval: true } } } });
    if (!schedule || schedule.message.approval?.status !== "APPROVED") return reply.code(409).send({ message: "Approved scheduled message not found." });
    await cancelCommunicationSend(schedule.queueJobId);
    const queued = await queueCommunicationSend(schedule.messageId, body.dueAt);
    await prisma.$transaction([
      prisma.scheduledMessage.update({
        where: { id },
        data: { dueAt: body.dueAt, recipientTimezone: body.recipientTimezone, queueJobId: queued.queueJobId, status: "QUEUED", cancelledAt: null, lastError: null }
      }),
      prisma.message.update({
        where: { id: schedule.messageId },
        data: { status: "SCHEDULED", scheduledAt: body.dueAt, events: { create: { type: "SCHEDULED", metadata: { action: "RESCHEDULED", timezone: body.recipientTimezone } } } }
      })
    ]);
    return reply.send({ ok: true });
  });

  app.delete("/scheduled-messages/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const schedule = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!schedule) return reply.code(404).send({ message: "Schedule not found." });
    try {
      await cancelCommunicationSend(schedule.queueJobId);
    } catch (error) {
      return reply.code(409).send({ message: error instanceof Error ? error.message : "Schedule cannot be cancelled." });
    }
    await prisma.$transaction([
      prisma.scheduledMessage.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
      prisma.message.update({
        where: { id: schedule.messageId },
        data: { status: "APPROVED", scheduledAt: null, events: { create: { type: "CANCELLED", metadata: { scheduleOnly: true } } } }
      })
    ]);
    return reply.send({ ok: true });
  });

  app.post("/messages/:id/retry", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const message = await prisma.message.findUnique({ where: { id }, include: { approval: true } });
    if (!message || message.status !== "FAILED" || message.approval?.status !== "APPROVED") {
      return reply.code(409).send({ message: "Only approved failed messages can be retried." });
    }
    await prisma.message.update({ where: { id }, data: { status: "QUEUED", failureReason: null, events: { create: { type: "QUEUED", metadata: { action: "RETRY" } } } } });
    return reply.code(202).send((await queueCommunicationSend(id, undefined, `retry-${Date.now()}`)).trackedJob);
  });

  app.get("/inbound-reviews", async () => {
    return prisma.inboundReview.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        connection: { select: { emailAddress: true, provider: true } },
        message: { include: { recipients: true } }
      }
    });
  });

  app.post("/inbound-reviews/:id/resolve", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      action: z.enum(["ATTACH", "CREATE_CONTACT", "CREATE_LEAD", "IGNORE", "SPAM"]),
      companyId: z.string().optional(),
      contactId: z.string().optional(),
      companyName: z.string().min(1).max(240).optional()
    }).parse(request.body);
    const review = await prisma.inboundReview.findUnique({ where: { id }, include: { message: { include: { conversation: true } } } });
    if (!review || review.status !== "PENDING") return reply.code(409).send({ message: "Pending review not found." });

    if (body.action === "IGNORE" || body.action === "SPAM") {
      if (body.action === "SPAM") {
        await prisma.suppressionEntry.create({
          data: { channel: "EMAIL", scope: "DESTINATION", normalizedDestination: normalizeAddress(review.senderAddress), reason: "SPAM_COMPLAINT", details: "Inbound sender marked as spam by operator." }
        });
      }
      await prisma.inboundReview.update({
        where: { id },
        data: { status: body.action === "SPAM" ? "SPAM" : "IGNORED", resolution: body.action, resolvedAt: new Date(), resolvedBy: "Internal operator" }
      });
      return reply.send({ ok: true });
    }

    let companyId = body.companyId;
    if (body.action === "CREATE_LEAD") {
      if (!body.companyName) return reply.code(400).send({ message: "Company name is required." });
      const company = await prisma.company.create({
        data: {
          name: body.companyName,
          normalizedName: normalizeBusinessName(body.companyName),
          identityKey: `email-domain:${review.senderAddress.split("@")[1] || review.senderAddress}`,
          email: review.senderAddress,
          trustStatus: "UNVERIFIED",
          status: "NEW",
          extractionScore: 0
        }
      });
      companyId = company.id;
    }
    if (!companyId) return reply.code(400).send({ message: "Lead is required for this action." });
    let contactId = body.contactId;
    if (!contactId && ["CREATE_CONTACT", "CREATE_LEAD"].includes(body.action)) {
      const contact = await prisma.contact.upsert({
        where: { companyId_type_value: { companyId, type: "EMAIL", value: review.senderAddress } },
        create: {
          companyId,
          type: "EMAIL",
          value: review.senderAddress,
          normalizedValue: normalizeAddress(review.senderAddress),
          label: review.senderName || "Inbound sender",
          confidence: 100,
          trustStatus: "VERIFIED",
          contactabilityState: "REPLIED",
          contactabilityUpdatedAt: new Date()
        },
        update: { contactabilityState: "REPLIED", contactabilityUpdatedAt: new Date() }
      });
      contactId = contact.id;
    }
    await prisma.$transaction([
      prisma.message.update({ where: { id: review.messageId }, data: { companyId, contactId } }),
      prisma.conversation.update({ where: { id: review.message.conversationId }, data: { companyId, status: "NEEDS_REPLY" } }),
      prisma.conversationParticipant.updateMany({
        where: { conversationId: review.message.conversationId, normalizedAddress: normalizeAddress(review.senderAddress) },
        data: { contactId }
      }),
      prisma.inboundReview.update({
        where: { id },
        data: {
          status: body.action === "CREATE_LEAD" ? "NEW_LEAD" : body.action === "CREATE_CONTACT" ? "NEW_CONTACT" : "ATTACHED",
          resolvedCompanyId: companyId,
          resolvedContactId: contactId,
          resolution: body.action,
          resolvedAt: new Date(),
          resolvedBy: "Internal operator"
        }
      }),
      prisma.activity.create({
        data: { companyId, type: "INBOUND_REVIEW_RESOLVED", summary: `Inbound email from ${review.senderAddress} attached by operator`, metadata: { reviewId: id, messageId: review.messageId } }
      }),
      prisma.crmItem.upsert({ where: { companyId }, create: { companyId, status: "REPLIED" }, update: { status: "REPLIED" } })
    ]);
    return reply.send({ ok: true, companyId, contactId });
  });

  app.get("/communication-analytics", async () => {
    const [statuses, events, bounces, contactability, recentFailures] = await Promise.all([
      prisma.message.groupBy({ by: ["status"], _count: true }),
      prisma.messageEvent.groupBy({ by: ["type"], _count: true }),
      prisma.message.groupBy({ by: ["bounceCategory"], where: { bounceCategory: { not: null } }, _count: true }),
      prisma.contact.groupBy({ by: ["contactabilityState"], _count: true }),
      prisma.message.findMany({
        where: { status: { in: ["FAILED", "BOUNCED"] } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { company: { select: { id: true, name: true } }, recipients: true }
      })
    ]);
    return { statuses, events, bounces, contactability, recentFailures };
  });

  app.post("/messages/:id/events", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      type: z.enum(["SENT", "BOUNCED", "FAILED"]),
      bounceCategory: z.nativeEnum(BounceCategory).optional(),
      reason: z.string().max(2000).optional(),
      providerEventId: z.string().max(500).optional()
    }).parse(request.body);
    const message = await prisma.message.findUnique({ where: { id }, include: { contact: true, recipients: true, company: true } });
    if (!message) return reply.code(404).send({ message: "Message not found." });
    await recordDeliveryEvent(prisma, message, body.type, body.bounceCategory, body.reason, body.providerEventId);
    return reply.send({ ok: true });
  });

  app.post("/sequences/:id/activate", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return reply.send(await prisma.sequence.update({ where: { id }, data: { status: "ACTIVE" } }));
  });

  app.post("/sequences/:id/enroll", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ companyId: z.string(), contactId: z.string() }).parse(request.body);
    const [sequence, company, contact] = await Promise.all([
      prisma.sequence.findUnique({ where: { id } }),
      prisma.company.findUnique({ where: { id: body.companyId } }),
      prisma.contact.findUnique({ where: { id: body.contactId } })
    ]);
    if (
      !sequence ||
      !company ||
      !contact ||
      contact.companyId !== company.id ||
      contact.type !== "EMAIL" ||
      !["VERIFIED", "PROBABLE"].includes(contact.trustStatus) ||
      contact.doNotContact ||
      ["BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(contact.contactabilityState)
    ) {
      return reply.code(400).send({ message: "Active sequence, lead, and email contact are required." });
    }
    if (sequence.status !== "ACTIVE") return reply.code(409).send({ message: "Sequence must be active before enrollment." });
    if (company.quarantinedAt || ["REJECTED", "CONFLICTING", "STALE"].includes(company.trustStatus)) {
      return reply.code(409).send({ message: "Lead trust state blocks sequence enrollment." });
    }
    const existing = await prisma.sequenceEnrollment.findFirst({
      where: { sequenceId: id, companyId: company.id, status: { in: ["PENDING_APPROVAL", "AWAITING_MESSAGE_APPROVAL", "ACTIVE", "PAUSED"] } }
    });
    if (existing) return reply.code(409).send({ message: "Lead already has an open enrollment in this sequence." });
    const enrollment = await prisma.sequenceEnrollment.create({
      data: { sequenceId: id, companyId: company.id, contactId: contact.id, status: "PENDING_APPROVAL", currentStep: 0 }
    });
    return reply.code(201).send(enrollment);
  });

  app.post("/sequence-enrollments/:id/approve", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const enrollment = await prisma.sequenceEnrollment.update({
      where: { id },
      data: { status: "ACTIVE", approvedAt: new Date(), approvedBy: "Internal operator", nextStepAt: new Date(), pausedAt: null }
    });
    await queueSequenceProcessing(id);
    return reply.send(enrollment);
  });

  app.post("/sequence-enrollments/:id/:action", async (request, reply) => {
    const { id, action } = z.object({ id: z.string(), action: z.enum(["pause", "resume", "stop"]) }).parse(request.params);
    const data = action === "pause"
      ? { status: "PAUSED" as SequenceEnrollmentStatus, pausedAt: new Date(), nextStepAt: null }
      : action === "resume"
        ? { status: "ACTIVE" as SequenceEnrollmentStatus, pausedAt: null, nextStepAt: new Date() }
        : { status: "STOPPED" as SequenceEnrollmentStatus, exitReason: "Stopped by operator", completedAt: new Date(), nextStepAt: null };
    const enrollment = await prisma.sequenceEnrollment.update({ where: { id }, data });
    if (action === "resume") await queueSequenceProcessing(id);
    return reply.send(enrollment);
  });
}

async function recordDeliveryEvent(
  prisma: PrismaClient,
  message: {
    id: string;
    companyId: string | null;
    contactId: string | null;
    channel: "EMAIL" | "WHATSAPP" | "LINKEDIN" | "INSTAGRAM" | "SMS" | "CALL";
    recipients: Array<{ normalizedAddress: string }>;
  },
  type: "SENT" | "BOUNCED" | "FAILED",
  bounceCategory?: BounceCategory,
  reason?: string,
  providerEventId?: string
) {
  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: type,
      bounceCategory: type === "BOUNCED" ? bounceCategory ?? "UNKNOWN" : undefined,
      failureReason: reason,
      events: { create: { type: type as MessageEventType, providerEventId, metadata: reason ? { reason, bounceCategory } : { bounceCategory } } }
    }
  });
  if (type !== "BOUNCED" || !message.companyId) return;
  const hard = ["HARD", "DOMAIN_FAILURE", "REJECTED"].includes(bounceCategory ?? "UNKNOWN");
  if (message.contactId) {
    await prisma.contact.update({
      where: { id: message.contactId },
      data: {
        bounceCount: { increment: 1 },
        contactabilityState: hard ? "INVALID" : "BOUNCED",
        contactabilityUpdatedAt: new Date(),
        doNotContact: hard
      }
    });
  }
  if (hard) {
    const destination = message.recipients[0]?.normalizedAddress;
    const duplicate = destination ? await prisma.suppressionEntry.findFirst({ where: { channel: message.channel, normalizedDestination: destination, active: true } }) : null;
    if (destination && !duplicate) {
      await prisma.suppressionEntry.create({
        data: { channel: message.channel, scope: "DESTINATION", normalizedDestination: destination, companyId: message.companyId, contactId: message.contactId, reason: "HARD_BOUNCED", details: reason || bounceCategory }
      });
    }
    await prisma.$transaction([
      prisma.scheduledMessage.updateMany({
        where: { message: { companyId: message.companyId }, status: { in: ["PENDING", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), lastError: "Cancelled after hard bounce." }
      }),
      prisma.message.updateMany({
        where: { companyId: message.companyId, status: { in: ["SCHEDULED", "QUEUED", "APPROVED"] }, id: { not: message.id } },
        data: { status: "CANCELLED", failureReason: "Cancelled after hard bounce." }
      }),
      prisma.sequenceEnrollment.updateMany({
        where: { companyId: message.companyId, status: { in: ["ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } },
        data: { status: "EXITED_BOUNCE", exitReason: reason || "Hard bounce", completedAt: new Date(), nextStepAt: null }
      }),
      prisma.activity.create({
        data: { companyId: message.companyId, type: "EMAIL_HARD_BOUNCE", summary: "Hard bounce suppressed future outreach", metadata: { messageId: message.id, bounceCategory, reason } }
      })
    ]);
  }
}

function attachmentSigningKey() {
  const key = env.attachmentSigningKey || env.communicationEncryptionKey;
  if (key) return key;
  if (env.webUrl.startsWith("http://localhost")) return localSigningKey;
  throw new Error("ATTACHMENT_SIGNING_KEY is not configured.");
}
