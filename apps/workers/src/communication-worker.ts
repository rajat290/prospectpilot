import type { Job as BullJob, Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import {
  assertSendAllowed,
  decryptSecret,
  encryptSecret,
  extractDomain,
  GmailAdapter,
  normalizeAddress,
  readStoredAttachment,
  renderTemplate,
  storeAttachment
} from "@prospectpilot/communications";
import { JOB_NAMES } from "@prospectpilot/shared";

config({ path: new URL("../../../.env", import.meta.url) });

const encryptionKey = process.env.COMMUNICATION_ENCRYPTION_KEY ?? "";
const attachmentStorageRoot = process.env.ATTACHMENT_STORAGE_ROOT ?? fileURLToPath(new URL("../../../.data/attachments", import.meta.url));
const gmail = new GmailAdapter({
  clientId: process.env.GMAIL_CLIENT_ID ?? "",
  clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
  redirectUri: process.env.GMAIL_REDIRECT_URI ?? "http://localhost:4000/communications/oauth/gmail/callback",
  pubsubTopic: process.env.GMAIL_PUBSUB_TOPIC
});

export async function processCommunicationJob(job: BullJob, prisma: PrismaClient, communicationQueue?: Queue) {
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
      result = await sendCommunication((job.data as { messageId: string }).messageId, prisma, communicationQueue);
    } else if (job.name === JOB_NAMES.syncGmail) {
      result = await syncGmailMailbox((job.data as { connectionId: string }).connectionId, prisma);
    } else if (job.name === JOB_NAMES.renewGmailWatch) {
      result = await renewGmailWatch((job.data as { connectionId: string }).connectionId, prisma);
    } else if (job.name === JOB_NAMES.processSequence) {
      result = await processSequenceEnrollment((job.data as { enrollmentId: string }).enrollmentId, prisma);
    } else if (job.name === JOB_NAMES.reconcileMailboxes) {
      result = await reconcileMailboxes(prisma);
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

async function sendCommunication(messageId: string, prisma: PrismaClient, communicationQueue?: Queue) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      company: true,
      contact: true,
      connection: true,
      approval: true,
      recipients: true,
      conversation: true,
      schedule: true,
      attachments: true,
      sequenceEnrollment: true,
      sequenceStep: true
    }
  });
  if (!message || !message.company || !message.connection) throw new Error("Message, lead, or sending account is missing.");
  if (message.connection.provider !== "GMAIL") throw new Error("Only Gmail sending is available in this milestone.");
  const to = message.recipients.filter((item) => item.type === "TO");
  if (!to.length) throw new Error("Message has no primary recipient.");
  if (message.createdAt.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) throw new Error("Draft is stale and must be reviewed again.");
  if (message.sequenceEnrollmentId && !["ACTIVE", "AWAITING_MESSAGE_APPROVAL"].includes(message.sequenceEnrollment?.status || "")) {
    throw new Error("Sequence enrollment is no longer active.");
  }

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
      duplicateSubmitted: ["SUBMITTED", "PROVIDER_SUBMITTED", "SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(message.status),
      approvalStatus: message.approval?.status,
      requireApproval: true
    });
  }

  const token = await getAccessToken(message.connection.id, prisma);
  try {
    const storedAttachments = await Promise.all(message.attachments.map(async (attachment) => {
      if (attachment.scanStatus !== "CLEAN" || !attachment.storageKey) throw new Error(`Attachment ${attachment.fileName} is not cleared for sending.`);
      return {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        contentBase64: (await readStoredAttachment(attachmentStorageRoot, attachment.storageKey)).toString("base64")
      };
    }));
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
      references: message.references,
      attachments: storedAttachments
    });
    const submittedAt = new Date();
    await prisma.$transaction([
      prisma.message.update({
        where: { id: message.id },
        data: {
          status: "PROVIDER_SUBMITTED",
          providerMessageId: result.providerMessageId,
          providerThreadId: result.providerThreadId,
          submittedAt,
          sentAt: submittedAt,
          events: { create: { type: "PROVIDER_SUBMITTED", occurredAt: submittedAt } }
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
    if (message.sequenceEnrollmentId && message.sequenceStep) {
      const nextStep = await prisma.sequenceStep.findFirst({
        where: { sequenceId: message.sequenceStep.sequenceId, position: { gt: message.sequenceStep.position } },
        orderBy: { position: "asc" }
      });
      await prisma.sequenceEnrollment.update({
        where: { id: message.sequenceEnrollmentId },
        data: nextStep
          ? {
              status: "ACTIVE",
              currentStep: message.sequenceStep.position,
              nextStepAt: new Date(submittedAt.getTime() + nextStep.delayHours * 60 * 60 * 1000)
            }
          : {
              status: "COMPLETED",
              currentStep: message.sequenceStep.position,
              nextStepAt: null,
              completedAt: submittedAt,
              exitReason: "All sequence steps submitted"
            }
      });
      if (nextStep && communicationQueue) {
        await communicationQueue.add(
          JOB_NAMES.processSequence,
          { enrollmentId: message.sequenceEnrollmentId },
          {
            delay: nextStep.delayHours * 60 * 60 * 1000,
            jobId: `sequence-${message.sequenceEnrollmentId}-${nextStep.position}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: 200,
            removeOnFail: 250
          }
        );
      }
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
    syncedMessages += await saveGmailThread(connection, thread, prisma, token);
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
  prisma: PrismaClient,
  accessToken: string
) {
  let savedCount = 0;
  for (const payload of thread.messages ?? []) {
    const parsed = parseGmailMessage(payload);
    const existing = await prisma.message.findUnique({
      where: { connectionId_providerMessageId: { connectionId: connection.id, providerMessageId: payload.id } }
    });
    if (existing) continue;
    const inbound = normalizeAddress(parsed.from.address) !== normalizeAddress(connection.emailAddress);
    const bounceNotice = inbound && isBounceNotice(parsed);
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
        status: bounceNotice ? "BOUNCED" : inbound ? "REPLIED" : "SENT",
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
          create: bounceNotice
            ? [{ type: "SYNCED" }, { type: "BOUNCED", occurredAt: parsed.occurredAt, metadata: { detectedFromNdr: true } }]
            : inbound
              ? [{ type: "SYNCED" }, { type: "REPLIED", occurredAt: parsed.occurredAt }]
              : [{ type: "SYNCED" }, { type: "SENT", occurredAt: parsed.occurredAt }]
        }
      }
    });
    for (const attachment of parsed.attachments) {
      try {
        const providerAttachment = await gmail.getAttachment(accessToken, payload.id, attachment.attachmentId);
        const stored = await storeAttachment({
          bytes: Buffer.from(providerAttachment.data, "base64url"),
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          storageRoot: attachmentStorageRoot
        });
        await prisma.attachment.create({
          data: { messageId: message.id, providerId: attachment.attachmentId, contentId: attachment.contentId, isInline: attachment.isInline, ...stored }
        });
      } catch (error) {
        await prisma.attachment.create({
          data: {
            messageId: message.id,
            providerId: attachment.attachmentId,
            fileName: attachment.fileName,
            originalName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.size,
            scanStatus: "FAILED",
            scanDetails: error instanceof Error ? error.message : "Provider attachment could not be stored."
          }
        });
      }
    }
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
    if (inbound && !companyId && !bounceNotice) {
      const candidates = await findInboundCandidates(parsed.from.address, parsed.from.name, prisma);
      await prisma.inboundReview.create({
        data: {
          messageId: message.id,
          connectionId: connection.id,
          senderAddress: normalizeAddress(parsed.from.address),
          senderName: parsed.from.name,
          subject: parsed.subject,
          providerThreadId: payload.threadId,
          possibleMatches: candidates,
          matchConfidence: candidates[0]?.confidence ?? 0,
          matchReason: candidates[0]?.reason ?? "No exact contact or provider-thread match."
        }
      });
    }
    if (bounceNotice && companyId) {
      const outbound = await prisma.message.findFirst({
        where: { conversationId: conversation.id, direction: "OUTBOUND", id: { not: message.id } },
        orderBy: { createdAt: "desc" },
        include: { recipients: true }
      });
      if (outbound) await applyDetectedBounce(outbound, parsed.text, prisma);
    } else if (inbound && companyId) {
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
          where: { companyId, status: { in: ["ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } },
          data: { status: "EXITED_REPLY", exitReason: "Inbound reply received", completedAt: new Date(), nextStepAt: null }
        }),
        prisma.message.updateMany({
          where: {
            companyId,
            direction: "OUTBOUND",
            status: { in: ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "QUEUED"] },
            sequenceEnrollmentId: { not: null }
          },
          data: { status: "CANCELLED", failureReason: "Sequence stopped after inbound reply." }
        }),
        prisma.scheduledMessage.updateMany({
          where: { message: { companyId, sequenceEnrollmentId: { not: null } }, status: { in: ["PENDING", "QUEUED"] } },
          data: { status: "CANCELLED", cancelledAt: new Date(), lastError: "Sequence stopped after inbound reply." }
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

async function reconcileMailboxes(prisma: PrismaClient) {
  const connections = await prisma.channelConnection.findMany({ where: { provider: "GMAIL", status: "CONNECTED" } });
  const results: Array<{ connectionId: string; ok: boolean; error?: string }> = [];
  for (const connection of connections) {
    try {
      await syncGmailMailbox(connection.id, prisma);
      results.push({ connectionId: connection.id, ok: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Mailbox reconciliation failed";
      await prisma.channelConnection.update({ where: { id: connection.id }, data: { lastError: reason, status: reason.includes("401") ? "ERROR" : connection.status } });
      results.push({ connectionId: connection.id, ok: false, error: reason });
    }
  }
  return { checked: connections.length, results };
}

async function processSequenceEnrollment(enrollmentId: string, prisma: PrismaClient) {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: { include: { steps: { orderBy: { position: "asc" } } } },
      company: { include: { crmItem: true, opportunities: { orderBy: { confidence: "desc" }, take: 1 } } },
      contact: true
    }
  });
  if (!enrollment || enrollment.status !== "ACTIVE" || !enrollment.contact) return { skipped: "Enrollment is not active." };
  if (enrollment.nextStepAt && enrollment.nextStepAt > new Date(Date.now() + 30_000)) return { skipped: "Step is not due yet." };
  if (enrollment.company.quarantinedAt || ["REJECTED", "CONFLICTING", "STALE"].includes(enrollment.company.trustStatus)) {
    await stopEnrollment(enrollment.id, "Lead trust state changed", prisma);
    return { stopped: "Lead trust state changed." };
  }
  if (["REPLIED", "BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(enrollment.contact.contactabilityState)) {
    await stopEnrollment(enrollment.id, `Contact became ${enrollment.contact.contactabilityState}`, prisma);
    return { stopped: "Contactability exit condition." };
  }
  if (["MEETING", "PROPOSAL", "WON", "LOST", "RETAINER"].includes(enrollment.company.crmItem?.status || "")) {
    await stopEnrollment(enrollment.id, `CRM moved to ${enrollment.company.crmItem?.status}`, prisma);
    return { stopped: "Commercial exit condition." };
  }
  const suppressed = await prisma.suppressionEntry.findFirst({
    where: {
      active: true,
      channel: "EMAIL",
      OR: [
        { normalizedDestination: normalizeAddress(enrollment.contact.value) },
        { contactId: enrollment.contact.id },
        { companyId: enrollment.company.id },
        { domain: extractDomain(enrollment.contact.value) },
        { scope: "WORKSPACE" }
      ]
    }
  });
  if (suppressed) {
    await stopEnrollment(enrollment.id, `Suppressed: ${suppressed.reason}`, prisma, "EXITED_UNSUBSCRIBE");
    return { stopped: "Suppression exit condition." };
  }
  const step = enrollment.sequence.steps.find((item) => item.position > enrollment.currentStep);
  if (!step) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", completedAt: new Date(), nextStepAt: null, exitReason: "All steps completed" }
    });
    return { completed: true };
  }
  const existing = await prisma.message.findFirst({ where: { sequenceEnrollmentId: enrollment.id, sequenceStepId: step.id } });
  if (existing) return { skipped: "Step message already exists.", messageId: existing.id };
  const connection = await prisma.channelConnection.findFirst({
    where: { status: "CONNECTED", channel: "EMAIL", provider: { in: ["GMAIL", "INTERNAL"] } },
    orderBy: { provider: "asc" }
  });
  if (!connection) throw new Error("No connected email mailbox is available for this sequence.");
  const conversation = await prisma.conversation.findFirst({
    where: { companyId: enrollment.company.id, channel: "EMAIL", participants: { some: { normalizedAddress: normalizeAddress(enrollment.contact.value) } } },
    orderBy: { latestMessageAt: "desc" }
  }) || await prisma.conversation.create({
    data: {
      companyId: enrollment.company.id,
      connectionId: connection.id,
      channel: "EMAIL",
      subject: renderSequenceText(step.subject || enrollment.sequence.name, enrollment),
      status: "OPEN",
      participants: {
        create: {
          contactId: enrollment.contact.id,
          address: enrollment.contact.value,
          normalizedAddress: normalizeAddress(enrollment.contact.value),
          role: "RECIPIENT"
        }
      }
    }
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      companyId: enrollment.company.id,
      contactId: enrollment.contact.id,
      connectionId: connection.id,
      sequenceEnrollmentId: enrollment.id,
      sequenceStepId: step.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      subject: renderSequenceText(step.subject || enrollment.sequence.name, enrollment),
      bodyText: renderSequenceText(step.body, enrollment),
      recipients: {
        create: {
          contactId: enrollment.contact.id,
          type: "TO",
          address: enrollment.contact.value,
          normalizedAddress: normalizeAddress(enrollment.contact.value)
        }
      },
      events: { create: [{ type: "CREATED" }, { type: "APPROVAL_REQUESTED" }] },
      approval: {
        create: {
          status: "PENDING",
          reason: `Sequence step ${step.position} requires operator approval.`,
          riskFlags: [`SEQUENCE_STEP_${step.position}`, `LEAD_${enrollment.company.trustStatus}`]
        }
      }
    }
  });
  await prisma.$transaction([
    prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "AWAITING_MESSAGE_APPROVAL", nextStepAt: null, conversationId: conversation.id }
    }),
    prisma.activity.create({
      data: {
        companyId: enrollment.company.id,
        type: "SEQUENCE_STEP_DRAFTED",
        summary: `${enrollment.sequence.name} step ${step.position} is ready for approval`,
        metadata: { enrollmentId: enrollment.id, messageId: message.id, stepId: step.id }
      }
    })
  ]);
  return { messageId: message.id, step: step.position, awaitingApproval: true };
}

function renderSequenceText(value: string, enrollment: {
  company: { name: string; opportunities: Array<{ recommendedService: string }> };
  contact: { label: string | null } | null;
}) {
  return renderTemplate(value, {
    companyName: enrollment.company.name,
    firstName: enrollment.contact?.label?.split(/\s+/)[0] || "there",
    recommendedOffer: enrollment.company.opportunities[0]?.recommendedService || "a focused workflow improvement",
    senderName: "Vikas"
  });
}

async function stopEnrollment(
  id: string,
  reason: string,
  prisma: PrismaClient,
  status: "STOPPED" | "EXITED_UNSUBSCRIBE" = "STOPPED"
) {
  await prisma.sequenceEnrollment.update({
    where: { id },
    data: { status, exitReason: reason, completedAt: new Date(), nextStepAt: null }
  });
}

async function findInboundCandidates(senderAddress: string, senderName: string | undefined, prisma: PrismaClient) {
  const domain = extractDomain(senderAddress);
  const nameToken = senderName?.split(/\s+/).find((part) => part.length >= 4);
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        ...(domain ? [{ websiteUrl: { contains: domain, mode: "insensitive" as const } }, { email: { endsWith: `@${domain}`, mode: "insensitive" as const } }] : []),
        ...(nameToken ? [{ name: { contains: nameToken, mode: "insensitive" as const } }] : [])
      ]
    },
    take: 8,
    include: { contacts: { where: { type: "EMAIL" }, take: 3 }, leadScore: true }
  });
  return companies.map((company) => {
    const domainMatch = Boolean(domain && (
      company.websiteUrl?.toLowerCase().includes(domain) ||
      company.email?.toLowerCase().endsWith(`@${domain}`) ||
      company.contacts.some((contact) => contact.value.toLowerCase().endsWith(`@${domain}`))
    ));
    return {
      companyId: company.id,
      companyName: company.name,
      confidence: domainMatch ? 55 : 30,
      reason: domainMatch ? "Company domain resembles the sender domain; manual confirmation required." : "Company name weakly resembles the sender name.",
      revenueScore: company.leadScore?.score ?? null
    };
  }).sort((a, b) => b.confidence - a.confidence);
}

function isBounceNotice(parsed: { from: { address: string }; subject: string; text: string }) {
  const sender = normalizeAddress(parsed.from.address);
  const haystack = `${parsed.subject}\n${parsed.text}`.toLowerCase();
  return sender.includes("mailer-daemon") ||
    sender.startsWith("postmaster@") ||
    /delivery status notification|undeliverable|mail delivery failed|address not found/.test(haystack);
}

async function applyDetectedBounce(
  message: { id: string; companyId: string | null; contactId: string | null; recipients: Array<{ normalizedAddress: string }> },
  reason: string,
  prisma: PrismaClient
) {
  await prisma.message.update({
    where: { id: message.id },
    data: { status: "BOUNCED", bounceCategory: "HARD", failureReason: reason.slice(0, 2000), events: { create: { type: "BOUNCED", metadata: { detectedFromNdr: true } } } }
  });
  if (!message.companyId) return;
  if (message.contactId) {
    await prisma.contact.update({
      where: { id: message.contactId },
      data: { bounceCount: { increment: 1 }, contactabilityState: "INVALID", contactabilityUpdatedAt: new Date(), doNotContact: true }
    });
  }
  const destination = message.recipients[0]?.normalizedAddress;
  if (destination && !(await prisma.suppressionEntry.findFirst({ where: { channel: "EMAIL", normalizedDestination: destination, active: true } }))) {
    await prisma.suppressionEntry.create({
      data: { channel: "EMAIL", scope: "DESTINATION", normalizedDestination: destination, companyId: message.companyId, contactId: message.contactId, reason: "HARD_BOUNCED", details: "Detected from Gmail delivery-status notification." }
    });
  }
  await prisma.$transaction([
    prisma.sequenceEnrollment.updateMany({
      where: { companyId: message.companyId, status: { in: ["ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } },
      data: { status: "EXITED_BOUNCE", exitReason: "Gmail delivery-status notification", completedAt: new Date(), nextStepAt: null }
    }),
    prisma.activity.create({
      data: { companyId: message.companyId, type: "EMAIL_HARD_BOUNCE", summary: "Gmail bounce suppressed future outreach", metadata: { messageId: message.id } }
    })
  ]);
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
    attachments: findAttachments(message.payload),
    occurredAt: new Date(Number(message.internalDate || Date.now()))
  };
}

function findAttachments(part: GmailPart): Array<{ attachmentId: string; fileName: string; mimeType: string; size: number; contentId?: string; isInline: boolean }> {
  const headers = new Map((part.headers ?? []).map((item) => [item.name.toLowerCase(), item.value]));
  const current = part.filename && part.body?.attachmentId
    ? [{
        attachmentId: part.body.attachmentId,
        fileName: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        contentId: headers.get("content-id"),
        isInline: (headers.get("content-disposition") || "").toLowerCase().startsWith("inline")
      }]
    : [];
  return [...current, ...(part.parts ?? []).flatMap(findAttachments)];
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
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
