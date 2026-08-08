import { Prisma, type PrismaClient } from "@prisma/client";
import {
  classifyReply,
  createStructuredResponse,
  detectMeetingIntent,
  detectObjections,
  incrementalSummary,
  recommendNextAction,
  replyIntelligenceSchema,
  stableInputHash,
  type DetectedObjection,
  type NextAction,
  type ReplyAnalysis
} from "@prospectpilot/intelligence";

const PROMPT_VERSION = "reply-intelligence-v1";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6";
const AUTOMATIC_AI_ENABLED = process.env.INTELLIGENCE_AI_ENABLED === "true";
const REVIEW_THRESHOLD = Number(process.env.INTELLIGENCE_REVIEW_THRESHOLD || 70);

type AiIntelligenceOutput = Omit<ReplyAnalysis, "evidenceMessageIds" | "deterministic"> & {
  summary: string;
  currentState: string;
  pendingItems: string[];
  objections: DetectedObjection[];
  nextAction: NextAction & { deadlineHours: number | null; recommendedCrmStage: NextAction["recommendedCrmStage"] | null };
};

export async function analyzeInboundMessage(messageId: string, prisma: PrismaClient) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      recipients: true,
      conversation: {
        include: {
          intelligenceSummary: true,
          messages: { orderBy: { createdAt: "asc" }, select: { id: true, direction: true, bodyText: true, subject: true, createdAt: true } }
        }
      },
      company: {
        include: {
          crmItem: true,
          opportunities: { orderBy: { confidence: "desc" }, take: 3 },
          evidence: { where: { trustStatus: { in: ["VERIFIED", "PROBABLE"] } }, orderBy: { confidence: "desc" }, take: 12 },
          contacts: { where: { isPrimary: true }, take: 3 }
        }
      },
      contact: true
    }
  });
  if (!message || message.direction !== "INBOUND") throw new Error("Inbound message not found for intelligence analysis.");

  const deterministic = classifyReply({ messageId: message.id, subject: message.subject, body: message.bodyText });
  const previousSummary = message.conversation.intelligenceSummary;
  const previousIndex = previousSummary?.throughMessageId
    ? message.conversation.messages.findIndex((item) => item.id === previousSummary.throughMessageId)
    : -1;
  const latestMessages = message.conversation.messages.slice(Math.max(0, previousIndex + 1)).slice(-8);
  const summaryThroughMessageId = latestMessages.at(-1)?.id ?? previousSummary?.throughMessageId ?? message.id;
  const fallbackSummary = incrementalSummary({
    previousSummary: previousSummary?.summary,
    latestMessages: latestMessages
      .filter((item) => item.direction === "INBOUND" || item.direction === "OUTBOUND")
      .map((item) => ({ direction: item.direction as "INBOUND" | "OUTBOUND", body: item.bodyText })),
    analysis: deterministic
  });
  const deterministicObjections = detectObjections(message.bodyText);
  const deterministicAction = recommendNextAction(deterministic);
  const promptInput = {
    previousSummary: previousSummary?.summary || null,
    latestMessages: latestMessages.map((item) => ({ id: item.id, direction: item.direction, subject: item.subject, body: item.bodyText })),
    company: message.company ? {
      name: message.company.name,
      industry: message.company.industry,
      country: message.company.country,
      crmStage: message.company.crmItem?.status,
      opportunities: message.company.opportunities.map((item) => ({ service: item.recommendedService, reasoning: item.reasoning, confidence: item.confidence })),
      verifiedEvidence: message.company.evidence.map((item) => ({ field: item.field, value: item.value, confidence: item.confidence }))
    } : null,
    deterministicSignals: {
      category: deterministic.category,
      confidence: deterministic.confidence,
      questions: deterministic.extractedQuestions,
      objections: deterministicObjections
    }
  };

  let analysis = deterministic;
  let summary = fallbackSummary;
  let objections = deterministicObjections;
  let action = deterministicAction;
  let source: "DETERMINISTIC" | "HYBRID" = "DETERMINISTIC";
  let auditRunId: string;

  if (!deterministic.deterministic && AUTOMATIC_AI_ENABLED && process.env.OPENAI_API_KEY) {
    const run = await prisma.aiRun.create({
      data: {
        feature: "REPLY_CLASSIFICATION",
        conversationId: message.conversationId,
        messageId: message.id,
        companyId: message.companyId,
        provider: "OPENAI",
        model: DEFAULT_MODEL,
        promptVersion: PROMPT_VERSION,
        status: "RUNNING",
        inputHash: stableInputHash(promptInput),
        evidenceMessageIds: latestMessages.map((item) => item.id),
        warnings: []
      }
    });
    auditRunId = run.id;
    try {
      const response = await createStructuredResponse<AiIntelligenceOutput>({
        apiKey: process.env.OPENAI_API_KEY,
        model: DEFAULT_MODEL,
        name: "prospectpilot_reply_intelligence",
        schema: replyIntelligenceSchema as unknown as Record<string, unknown>,
        system: intelligenceSystemPrompt(),
        user: JSON.stringify(promptInput),
        maxOutputTokens: 2200
      });
      const output = response.output;
      analysis = {
        category: output.category,
        confidence: clamp(output.confidence),
        sentiment: output.sentiment,
        commercialIntent: output.commercialIntent,
        urgency: output.urgency,
        requiresReply: output.requiresReply,
        extractedQuestions: output.extractedQuestions.slice(0, 8),
        evidenceMessageIds: [message.id],
        deterministic: false
      };
      summary = { summary: output.summary, currentState: output.currentState, pendingItems: output.pendingItems.slice(0, 8) };
      objections = mergeObjections(deterministicObjections, output.objections);
      action = {
        ...output.nextAction,
        deadlineHours: output.nextAction.deadlineHours ?? undefined,
        recommendedCrmStage: output.nextAction.recommendedCrmStage ?? undefined,
        confidence: clamp(output.nextAction.confidence)
      };
      source = "HYBRID";
      await prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
          output: asJson(output),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens
        }
      });
    } catch (error) {
      await prisma.aiRun.update({
        where: { id: run.id },
        data: { status: "FAILED", completedAt: new Date(), error: safeError(error), warnings: ["Deterministic fallback persisted."] }
      });
      const fallbackRun = await createRulesAudit(message, promptInput, { analysis, summary, objections, action }, prisma, "OpenAI analysis failed; deterministic fallback used.");
      auditRunId = fallbackRun.id;
    }
  } else {
    const reason = deterministic.deterministic
      ? "Deterministic safety rule resolved the message before LLM use."
      : !AUTOMATIC_AI_ENABLED
        ? "Automatic model analysis is disabled; deterministic fallback used."
        : "OPENAI_API_KEY unavailable; deterministic fallback used.";
    const run = await createRulesAudit(message, promptInput, { analysis, summary, objections, action }, prisma, reason);
    auditRunId = run.id;
  }

  if (deterministic.deterministic) {
    analysis = deterministic;
    action = deterministicAction;
    source = "DETERMINISTIC";
  }

  const reviewStatus = analysis.confidence >= REVIEW_THRESHOLD ? "READY" : "REVIEW_REQUIRED";
  const deadlineAt = action.deadlineHours == null ? null : new Date(Date.now() + action.deadlineHours * 60 * 60 * 1000);
  const recommended = await prisma.$transaction(async (tx) => {
    const intelligence = await tx.replyIntelligence.upsert({
      where: { messageId: message.id },
      create: {
        messageId: message.id,
        conversationId: message.conversationId,
        companyId: message.companyId,
        category: analysis.category,
        confidence: analysis.confidence,
        sentiment: analysis.sentiment,
        commercialIntent: analysis.commercialIntent,
        urgency: analysis.urgency,
        requiresReply: analysis.requiresReply,
        extractedQuestions: analysis.extractedQuestions,
        evidenceMessageIds: analysis.evidenceMessageIds,
        source,
        reviewStatus
      },
      update: {
        category: analysis.category,
        confidence: analysis.confidence,
        sentiment: analysis.sentiment,
        commercialIntent: analysis.commercialIntent,
        urgency: analysis.urgency,
        requiresReply: analysis.requiresReply,
        extractedQuestions: analysis.extractedQuestions,
        evidenceMessageIds: analysis.evidenceMessageIds,
        source,
        reviewStatus
      }
    });
    await tx.conversationSummary.upsert({
      where: { conversationId: message.conversationId },
      create: {
        conversationId: message.conversationId,
        summary: summary.summary,
        currentState: summary.currentState,
        pendingItems: summary.pendingItems,
        throughMessageId: summaryThroughMessageId,
        messageCount: message.conversation.messages.length,
        source
      },
      update: {
        summary: summary.summary,
        currentState: summary.currentState,
        pendingItems: summary.pendingItems,
        throughMessageId: summaryThroughMessageId,
        messageCount: message.conversation.messages.length,
        version: { increment: 1 },
        source
      }
    });
    const recommendation = await tx.recommendedAction.upsert({
      where: { messageId_action: { messageId: message.id, action: action.action } },
      create: {
        conversationId: message.conversationId,
        messageId: message.id,
        companyId: message.companyId,
        action: action.action,
        priority: action.priority,
        reason: action.reason,
        deadlineAt,
        confidence: action.confidence,
        requiresApproval: action.requiresApproval,
        recommendedCrmStage: action.recommendedCrmStage,
        source,
        evidenceMessageIds: [message.id]
      },
      update: {
        priority: action.priority,
        reason: action.reason,
        deadlineAt,
        confidence: action.confidence,
        requiresApproval: action.requiresApproval,
        recommendedCrmStage: action.recommendedCrmStage,
        source,
        evidenceMessageIds: [message.id],
        status: "PENDING"
      }
    });
    await tx.conversation.update({
      where: { id: message.conversationId },
      data: {
        aiClassification: analysis.category,
        classificationConfidence: analysis.confidence,
        summary: summary.summary,
        nextAction: action.reason
      }
    });
    return { intelligence, recommendation };
  });

  for (const objection of objections) {
    await prisma.conversationObjection.upsert({
      where: { messageId_type: { messageId: message.id, type: objection.type } },
      create: { conversationId: message.conversationId, messageId: message.id, companyId: message.companyId, ...objection },
      update: { evidenceQuote: objection.evidenceQuote, recommendedHandling: objection.recommendedHandling, confidence: objection.confidence }
    });
  }
  const meeting = detectMeetingIntent(message.bodyText);
  if (meeting) {
    await prisma.meetingIntent.upsert({
      where: { messageId: message.id },
      create: { messageId: message.id, conversationId: message.conversationId, companyId: message.companyId, ...meeting },
      update: meeting
    });
  }
  await ensureActionTask({ message, analysis, action, actionId: recommended.recommendation.id, deadlineAt }, prisma);
  if (analysis.category === "UNSUBSCRIBE") await applyImmediateUnsubscribe(message, prisma);
  return { intelligenceId: recommended.intelligence.id, actionId: recommended.recommendation.id, aiRunId: auditRunId, source };
}

export async function detectStalledConversations(prisma: PrismaClient, options?: { companyIds?: string[] }) {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: { companyId: options?.companyIds?.length ? { in: options.companyIds } : { not: null }, OR: [{ status: "NEEDS_REPLY", latestMessageAt: { lte: cutoff } }, { company: { crmItem: { status: { in: ["MEETING", "PROPOSAL", "OPPORTUNITY", "NEGOTIATION"] } } }, latestMessageAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
    include: { company: { include: { crmItem: true, opportunities: { take: 1, orderBy: { confidence: "desc" } } } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    take: 200
  });
  let created = 0;
  for (const conversation of conversations) {
    const latest = conversation.messages[0];
    if (!latest || !conversation.company) continue;
    const ageHours = Math.max(1, Math.round((Date.now() - (conversation.latestMessageAt ?? latest.createdAt).getTime()) / 3_600_000));
    const stage = conversation.company.crmItem?.status;
    const action = latest.direction === "INBOUND"
      ? { type: "REPLY_NOW" as const, title: `Reply to ${conversation.company.name}`, reason: `Prospect has waited ${ageHours} hours for a reply.`, priority: ageHours >= 12 ? "CRITICAL" as const : "HIGH" as const }
      : stage === "MEETING"
        ? { type: "GENERATE_PROPOSAL" as const, title: `Prepare next step for ${conversation.company.name}`, reason: "Meeting-stage conversation has no recent proposal action.", priority: "HIGH" as const }
        : { type: "FOLLOW_UP" as const, title: `Follow up with ${conversation.company.name}`, reason: `${stage || "Warm"} conversation has been inactive for ${ageHours} hours.`, priority: ageHours >= 168 ? "HIGH" as const : "MEDIUM" as const };
    const recommendation = await prisma.recommendedAction.upsert({
      where: { messageId_action: { messageId: latest.id, action: action.type } },
      create: { conversationId: conversation.id, messageId: latest.id, companyId: conversation.company.id, action: action.type, priority: action.priority, reason: action.reason, deadlineAt: new Date(), confidence: 90, requiresApproval: true, source: "DETERMINISTIC", evidenceMessageIds: [latest.id] },
      update: { priority: action.priority, reason: action.reason, deadlineAt: new Date(), status: "PENDING" }
    });
    await prisma.salesTask.upsert({
      where: { sourceMessageId_title: { sourceMessageId: latest.id, title: action.title } },
      create: { companyId: conversation.company.id, conversationId: conversation.id, sourceMessageId: latest.id, actionId: recommendation.id, title: action.title, description: action.reason, priority: action.priority, dueAt: new Date(), source: "STALLED_CONVERSATION" },
      update: { priority: action.priority, dueAt: new Date(), description: action.reason, status: "OPEN" }
    });
    created += 1;
  }
  return { checked: conversations.length, actioned: created };
}

async function createRulesAudit(
  message: { id: string; conversationId: string; companyId: string | null },
  input: unknown,
  output: unknown,
  prisma: PrismaClient,
  warning: string
) {
  return prisma.aiRun.create({
    data: {
      feature: "REPLY_CLASSIFICATION",
      conversationId: message.conversationId,
      messageId: message.id,
      companyId: message.companyId,
      provider: "RULE_ENGINE",
      model: "deterministic-v1",
      promptVersion: PROMPT_VERSION,
      status: "COMPLETE",
      inputHash: stableInputHash(input),
      evidenceMessageIds: [message.id],
      output: asJson(output),
      warnings: [warning],
      completedAt: new Date()
    }
  });
}

async function ensureActionTask(
  input: {
    message: { id: string; companyId: string | null; conversationId: string };
    analysis: ReplyAnalysis;
    action: NextAction;
    actionId: string;
    deadlineAt: Date | null;
  },
  prisma: PrismaClient
) {
  if (!input.analysis.requiresReply && input.action.action !== "ESCALATE_MANUAL_REVIEW") return;
  const title = input.analysis.confidence < REVIEW_THRESHOLD
    ? "Review low-confidence reply intelligence"
    : input.action.action === "OFFER_MEETING_SLOTS"
      ? "Reply with meeting options"
      : input.action.action === "SEND_PRICING_REPLY"
        ? "Prepare pricing response"
        : "Reply to prospect";
  await prisma.salesTask.upsert({
    where: { sourceMessageId_title: { sourceMessageId: input.message.id, title } },
    create: {
      companyId: input.message.companyId,
      conversationId: input.message.conversationId,
      sourceMessageId: input.message.id,
      actionId: input.actionId,
      title,
      description: input.action.reason,
      priority: input.action.priority,
      dueAt: input.deadlineAt,
      source: "REPLY_INTELLIGENCE"
    },
    update: { description: input.action.reason, priority: input.action.priority, dueAt: input.deadlineAt, status: "OPEN" }
  });
}

async function applyImmediateUnsubscribe(
  message: { id: string; companyId: string | null; contactId: string | null; conversationId: string; recipients: Array<{ type: string; normalizedAddress: string }> },
  prisma: PrismaClient
) {
  const address = message.recipients.find((item) => item.type === "FROM")?.normalizedAddress;
  const existing = address ? await prisma.suppressionEntry.findFirst({ where: { channel: "EMAIL", normalizedDestination: address, active: true } }) : null;
  await prisma.$transaction([
    ...(address && !existing ? [prisma.suppressionEntry.create({ data: { channel: "EMAIL", scope: "DESTINATION", normalizedDestination: address, companyId: message.companyId, contactId: message.contactId, reason: "UNSUBSCRIBED", details: `Detected from inbound message ${message.id}` } })] : []),
    ...(message.contactId ? [prisma.contact.update({ where: { id: message.contactId }, data: { doNotContact: true, contactabilityState: "UNSUBSCRIBED", contactabilityUpdatedAt: new Date() } })] : []),
    ...(message.companyId ? [
      prisma.sequenceEnrollment.updateMany({ where: { companyId: message.companyId, status: { in: ["PENDING_APPROVAL", "ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } }, data: { status: "EXITED_UNSUBSCRIBE", exitReason: "Deterministic unsubscribe detected", completedAt: new Date(), nextStepAt: null } }),
      prisma.message.updateMany({ where: { companyId: message.companyId, direction: "OUTBOUND", status: { in: ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "QUEUED"] } }, data: { status: "CANCELLED", failureReason: "Prospect unsubscribed." } }),
      prisma.activity.create({ data: { companyId: message.companyId, type: "UNSUBSCRIBE_DETECTED", summary: "Inbound opt-out immediately suppressed future email.", metadata: { messageId: message.id } } })
    ] : [])
  ]);
}

function mergeObjections(base: DetectedObjection[], generated: DetectedObjection[]) {
  return [...base, ...generated].filter((item, index, all) => all.findIndex((candidate) => candidate.type === item.type) === index).slice(0, 5);
}

function intelligenceSystemPrompt() {
  return [
    "You are ProspectPilot's sales conversation analyst.",
    "Use only the supplied messages, verified company evidence, opportunities, and prior summary.",
    "Classify commercial intent, extract explicit questions and objections, update the prior summary incrementally, and recommend one next action.",
    "Do not invent prices, delivery dates, capabilities, integrations, clients, case studies, or prospect facts.",
    "Evidence quotes must be short exact excerpts from the latest inbound message.",
    "If evidence is ambiguous, lower confidence and choose ESCALATE_MANUAL_REVIEW.",
    "Never override explicit unsubscribe, wrong-contact, spam, or out-of-office signals."
  ].join("\n");
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : "Intelligence provider failed.";
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]").slice(0, 1000);
}
