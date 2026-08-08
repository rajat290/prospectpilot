import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  createStructuredResponse,
  stableInputHash,
  suggestedReplySchema,
  validateSuggestedReply
} from "@prospectpilot/intelligence";
import { z } from "zod";
import { env } from "./env.js";
import { queueReplyAnalysis, queueStalledConversationDetection } from "./queues.js";

const replyModes = ["GENERATE_REPLY", "SHORTEN", "CONVERSATIONAL", "ANSWER_QUESTIONS", "HANDLE_OBJECTION", "SUGGEST_MEETING", "ADD_PRICING", "CREATE_FOLLOW_UP"] as const;
const replyCategories = ["INTERESTED", "PRICING_QUESTION", "TECHNICAL_QUESTION", "MEETING_REQUEST", "REFERRAL", "WRONG_CONTACT", "NOT_INTERESTED", "OUT_OF_OFFICE", "UNSUBSCRIBE", "VENDOR_SALES_MESSAGE", "SPAM", "UNKNOWN"] as const;
const promptVersion = "suggested-reply-v1";

type GeneratedReply = { subject: string | null; bodyText: string; confidence: number; warnings: string[]; usedFacts: string[] };

export async function registerIntelligenceRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/intelligence/status", async () => {
    const [analyzed, reviewRequired, pendingActions, openTasks, packages, failedRuns] = await Promise.all([
      prisma.replyIntelligence.count(),
      prisma.replyIntelligence.count({ where: { reviewStatus: "REVIEW_REQUIRED" } }),
      prisma.recommendedAction.count({ where: { status: "PENDING" } }),
      prisma.salesTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.servicePackage.count({ where: { approved: true } }),
      prisma.aiRun.count({ where: { status: "FAILED" } })
    ]);
    return {
      configured: Boolean(env.openAiApiKey),
      model: env.openAiModel,
      automaticAiEnabled: env.automaticIntelligenceAiEnabled,
      deterministicFallback: true,
      reviewThreshold: env.intelligenceReviewThreshold,
      counts: { analyzed, reviewRequired, pendingActions, openTasks, approvedPackages: packages, failedRuns }
    };
  });

  app.post("/messages/:id/analyze", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const message = await prisma.message.findUnique({ where: { id }, select: { id: true, direction: true } });
    if (!message || message.direction !== "INBOUND") return reply.code(404).send({ message: "Inbound message not found." });
    return reply.code(202).send(await queueReplyAnalysis(id));
  });

  app.post("/intelligence/backfill", async (request, reply) => {
    const { limit, dryRun } = z.object({ limit: z.number().int().min(1).max(500).default(200), dryRun: z.boolean().default(true) }).parse(request.body ?? {});
    const messages = await prisma.message.findMany({
      where: { direction: "INBOUND", replyIntelligence: { is: null }, companyId: { not: null } },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: { id: true, subject: true, receivedAt: true, company: { select: { id: true, name: true } } }
    });
    if (dryRun) return reply.send({ candidates: messages.length, limit, messages: messages.slice(0, 20) });
    const queued = [];
    for (const message of messages) queued.push(await queueReplyAnalysis(message.id));
    return reply.code(202).send({ candidates: messages.length, queued: queued.length, jobs: queued });
  });

  app.get("/intelligence/reviews", async () => {
    return prisma.replyIntelligence.findMany({
      where: { reviewStatus: "REVIEW_REQUIRED" },
      orderBy: { createdAt: "asc" },
      include: {
        message: { select: { id: true, subject: true, bodyText: true, receivedAt: true } },
        conversation: { select: { id: true, subject: true } },
        company: { select: { id: true, name: true } }
      }
    });
  });

  app.patch("/reply-intelligence/:id/review", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      decision: z.enum(["APPROVED", "REJECTED"]),
      category: z.enum(replyCategories).optional(),
      confidence: z.number().int().min(0).max(100).optional()
    }).parse(request.body);
    const intelligence = await prisma.replyIntelligence.update({
      where: { id },
      data: { reviewStatus: body.decision, category: body.category, confidence: body.confidence, reviewedAt: new Date(), reviewedBy: "Internal operator" }
    });
    await prisma.aiRun.create({
      data: {
        feature: "REPLY_CLASSIFICATION",
        conversationId: intelligence.conversationId,
        messageId: intelligence.messageId,
        companyId: intelligence.companyId,
        provider: "MANUAL",
        model: "operator-review",
        promptVersion: "manual-review-v1",
        status: "COMPLETE",
        inputHash: stableInputHash(body),
        evidenceMessageIds: intelligence.evidenceMessageIds,
        output: asJson(body),
        warnings: [],
        completedAt: new Date()
      }
    });
    return reply.send(intelligence);
  });

  app.post("/conversations/:id/suggested-replies", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { mode } = z.object({ mode: z.enum(replyModes).default("ANSWER_QUESTIONS") }).parse(request.body ?? {});
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        intelligenceSummary: true,
        intelligence: { orderBy: { createdAt: "desc" }, take: 1 },
        objections: { where: { status: { in: ["DETECTED", "UNRESOLVED", "DEAL_BLOCKER"] } }, orderBy: { createdAt: "desc" }, take: 5 },
        messages: { orderBy: { createdAt: "desc" }, take: 12, select: { id: true, direction: true, subject: true, bodyText: true, receivedAt: true, sentAt: true } },
        participants: true,
        company: {
          include: {
            opportunities: { orderBy: { confidence: "desc" }, take: 3 },
            evidence: { where: { trustStatus: { in: ["VERIFIED", "PROBABLE"] } }, orderBy: { confidence: "desc" }, take: 15 },
            crmItem: true
          }
        }
      }
    });
    if (!conversation?.company) return reply.code(404).send({ message: "Matched lead conversation not found." });
    const packages = await prisma.servicePackage.findMany({ where: { approved: true }, orderBy: { minimumPrice: "asc" } });
    const sourceMessage = conversation.messages.find((item) => item.direction === "INBOUND");
    if (!sourceMessage) return reply.code(409).send({ message: "An inbound message is required before generating a reply." });

    const grounding = {
      company: { name: conversation.company.name, industry: conversation.company.industry, country: conversation.company.country, crmStage: conversation.company.crmItem?.status },
      summary: conversation.intelligenceSummary,
      intelligence: conversation.intelligence[0],
      objections: conversation.objections.map((item) => ({ type: item.type, evidenceQuote: item.evidenceQuote, handling: item.recommendedHandling })),
      opportunities: conversation.company.opportunities.map((item) => ({ service: item.recommendedService, reasoning: item.reasoning, confidence: item.confidence })),
      verifiedEvidence: conversation.company.evidence.map((item) => ({ field: item.field, value: item.value, confidence: item.confidence })),
      approvedPackages: packages.map((item) => ({ name: item.name, description: item.description, currency: item.currency, minimumPrice: item.minimumPrice, maximumPrice: item.maximumPrice, deliveryMinDays: item.deliveryMinDays, deliveryMaxDays: item.deliveryMaxDays, capabilities: item.capabilities, exclusions: item.exclusions })),
      messages: conversation.messages.slice().reverse().map((item) => ({ id: item.id, direction: item.direction, subject: item.subject, body: item.bodyText }))
    };

    const run = await prisma.aiRun.create({
      data: {
        feature: "SUGGESTED_REPLY",
        conversationId: conversation.id,
        messageId: sourceMessage.id,
        companyId: conversation.company.id,
        provider: env.openAiApiKey ? "OPENAI" : "RULE_ENGINE",
        model: env.openAiApiKey ? env.openAiModel : "grounded-template-v1",
        promptVersion,
        status: "RUNNING",
        inputHash: stableInputHash({ mode, grounding }),
        evidenceMessageIds: conversation.messages.map((item) => item.id),
        warnings: []
      }
    });

    let generated: GeneratedReply;
    let source: "OPENAI" | "DETERMINISTIC" = "DETERMINISTIC";
    try {
      if (!env.openAiApiKey) throw new Error("OPENAI_API_KEY is unavailable.");
      const response = await createStructuredResponse<GeneratedReply>({
        apiKey: env.openAiApiKey,
        model: env.openAiModel,
        name: "prospectpilot_suggested_reply",
        schema: suggestedReplySchema as unknown as Record<string, unknown>,
        system: suggestedReplyPrompt(mode),
        user: JSON.stringify(grounding),
        maxOutputTokens: 1800
      });
      generated = response.output;
      source = "OPENAI";
      await prisma.aiRun.update({ where: { id: run.id }, data: { status: "COMPLETE", completedAt: new Date(), output: asJson(generated), inputTokens: response.inputTokens, outputTokens: response.outputTokens } });
    } catch (error) {
      generated = fallbackReply(mode, conversation, packages);
      await prisma.aiRun.update({ where: { id: run.id }, data: { status: env.openAiApiKey ? "FAILED" : "SKIPPED", completedAt: new Date(), error: safeError(error), output: asJson(generated), warnings: ["Grounded deterministic draft generated instead."] } });
    }

    const validation = validateSuggestedReply({ body: generated.bodyText, approvedPackages: packages });
    const warnings = [...new Set([...generated.warnings, ...validation.warnings])];
    const suggested = await prisma.suggestedReply.create({
      data: {
        conversationId: conversation.id,
        sourceMessageId: sourceMessage.id,
        companyId: conversation.company.id,
        aiRunId: run.id,
        mode,
        subject: generated.subject,
        bodyText: generated.bodyText,
        confidence: Math.max(0, Math.min(100, Math.round(generated.confidence))),
        warnings,
        grounding: asJson({ usedFacts: generated.usedFacts, evidenceMessageIds: conversation.messages.map((item) => item.id), hasApprovedPricing: packages.length > 0 }),
        source
      }
    });
    return reply.code(201).send(suggested);
  });

  app.post("/suggested-replies/:id/use", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const suggestion = await prisma.suggestedReply.findUnique({
      where: { id },
      include: { conversation: { include: { participants: true, connection: true } }, company: true }
    });
    if (!suggestion?.company) return reply.code(404).send({ message: "Suggested reply not found." });
    if (suggestion.status !== "DRAFT") return reply.code(409).send({ message: "Suggested reply was already used or reviewed." });
    const recipient = suggestion.conversation.participants.find((item) => item.normalizedAddress !== suggestion.conversation.connection?.emailAddress?.toLowerCase());
    if (!recipient) return reply.code(409).send({ message: "Conversation recipient is unavailable." });
    const draft = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: suggestion.conversationId,
          companyId: suggestion.companyId,
          contactId: recipient.contactId,
          connectionId: suggestion.conversation.connectionId,
          channel: "EMAIL",
          direction: "OUTBOUND",
          status: "PENDING_APPROVAL",
          subject: suggestion.subject || replySubject(suggestion.conversation.subject),
          bodyText: suggestion.bodyText,
          metadata: { suggestedReplyId: suggestion.id, warnings: suggestion.warnings },
          recipients: { create: { contactId: recipient.contactId, type: "TO", address: recipient.address, normalizedAddress: recipient.normalizedAddress } },
          events: { create: [{ type: "CREATED" }, { type: "APPROVAL_REQUESTED" }] },
          approval: { create: { status: "PENDING", reason: "AI-assisted replies always require operator approval.", riskFlags: suggestion.warnings } }
        }
      });
      await tx.suggestedReply.update({ where: { id: suggestion.id }, data: { status: "USED" } });
      await tx.activity.create({ data: { companyId: suggestion.company!.id, type: "AI_REPLY_DRAFTED", summary: "Grounded suggested reply moved to approval queue.", metadata: { suggestedReplyId: suggestion.id, messageId: message.id } } });
      return message;
    });
    return reply.code(201).send(draft);
  });

  app.post("/recommended-actions/:id/approve", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const action = await prisma.recommendedAction.findUnique({ where: { id } });
    if (!action) return reply.code(404).send({ message: "Recommendation not found." });
    if (action.status !== "PENDING") return reply.code(409).send({ message: "Recommendation is no longer pending." });
    const updated = await prisma.$transaction(async (tx) => {
      if (action.companyId && action.recommendedCrmStage) {
        await tx.crmItem.upsert({ where: { companyId: action.companyId }, create: { companyId: action.companyId, status: action.recommendedCrmStage }, update: { status: action.recommendedCrmStage } });
        await tx.activity.create({ data: { companyId: action.companyId, type: "AI_CRM_RECOMMENDATION_APPROVED", summary: `CRM moved to ${action.recommendedCrmStage.toLowerCase()} after operator approval.`, metadata: { actionId: action.id } } });
      }
      return tx.recommendedAction.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: "Internal operator" } });
    });
    return reply.send(updated);
  });

  app.post("/recommended-actions/:id/dismiss", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return reply.send(await prisma.recommendedAction.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } }));
  });

  app.patch("/sales-tasks/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) }).parse(request.body);
    return reply.send(await prisma.salesTask.update({ where: { id }, data: { status, completedAt: status === "COMPLETED" ? new Date() : null } }));
  });

  app.get("/service-packages", async () => prisma.servicePackage.findMany({ orderBy: [{ approved: "desc" }, { minimumPrice: "asc" }] }));

  app.post("/service-packages", async (request, reply) => {
    const body = servicePackageSchema.parse(request.body);
    return reply.code(201).send(await prisma.servicePackage.create({ data: body }));
  });

  app.patch("/service-packages/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.servicePackage.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Service package not found." });
    const patch = servicePackageObject.partial().parse(request.body);
    const body = servicePackageSchema.parse({ ...existing, ...patch });
    return reply.send(await prisma.servicePackage.update({ where: { id }, data: body }));
  });

  app.post("/intelligence/stalled/run", async (_request, reply) => reply.code(202).send(await queueStalledConversationDetection()));

  app.get("/command-brief", async () => buildCommandBrief(prisma));
}

async function buildCommandBrief(prisma: PrismaClient) {
  const now = new Date();
  const [needsReply, highIntent, pricing, meetings, negative, tasks, atRisk, pipeline] = await Promise.all([
    prisma.conversation.count({ where: { status: "NEEDS_REPLY" } }),
    prisma.replyIntelligence.count({ where: { commercialIntent: "HIGH", requiresReply: true } }),
    prisma.replyIntelligence.count({ where: { category: "PRICING_QUESTION", requiresReply: true } }),
    prisma.meetingIntent.count({ where: { message: { conversation: { status: "NEEDS_REPLY" } } } }),
    prisma.replyIntelligence.count({ where: { sentiment: "NEGATIVE", createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.salesTask.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: [{ priority: "asc" }, { dueAt: "asc" }], take: 10, include: { company: { select: { id: true, name: true, opportunities: { take: 1, orderBy: { confidence: "desc" } } } }, conversation: { select: { id: true, subject: true } }, action: true } }),
    prisma.recommendedAction.findMany({ where: { status: "PENDING", deadlineAt: { lte: now } }, orderBy: [{ priority: "asc" }, { deadlineAt: "asc" }], take: 10, include: { company: { select: { id: true, name: true } } } }),
    prisma.company.findMany({ where: { crmItem: { status: { in: ["REPLIED", "QUALIFIED", "OPPORTUNITY", "MEETING", "PROPOSAL", "NEGOTIATION"] } } }, select: { opportunities: { take: 1, orderBy: { confidence: "desc" } } } })
  ]);
  return {
    generatedAt: now,
    greeting: "Good morning, Rajat.",
    counts: { needsReply, highIntent, pricingQuestions: pricing, meetingIntents: meetings, negative },
    priorities: tasks.map((task) => ({ id: task.id, title: task.title, reason: task.description, priority: task.priority, dueAt: task.dueAt, company: task.company, conversationId: task.conversationId, action: task.action?.action })),
    atRisk: atRisk.map((item) => ({ id: item.id, company: item.company, action: item.action, reason: item.reason, deadlineAt: item.deadlineAt })),
    estimatedPipeline: estimatePipeline(pipeline)
  };
}

const servicePackageObject = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(5).max(2000),
  currency: z.string().length(3).default("USD"),
  minimumPrice: z.number().int().nonnegative().nullable().optional(),
  maximumPrice: z.number().int().nonnegative().nullable().optional(),
  deliveryMinDays: z.number().int().positive().nullable().optional(),
  deliveryMaxDays: z.number().int().positive().nullable().optional(),
  capabilities: z.array(z.string().min(2)).default([]),
  exclusions: z.array(z.string().min(2)).default([]),
  approved: z.boolean().default(false)
});

const servicePackageSchema = servicePackageObject.refine((value) => value.minimumPrice == null || value.maximumPrice == null || value.minimumPrice <= value.maximumPrice, "Minimum price must not exceed maximum price.")
  .refine((value) => value.deliveryMinDays == null || value.deliveryMaxDays == null || value.deliveryMinDays <= value.deliveryMaxDays, "Minimum delivery must not exceed maximum delivery.");

function fallbackReply(mode: typeof replyModes[number], conversation: any, packages: any[]): GeneratedReply {
  const latest = conversation.intelligence[0];
  const questions = latest?.extractedQuestions || [];
  const opportunity = conversation.company.opportunities[0];
  const service = opportunity?.recommendedService || "the workflow improvement we discussed";
  const approved = packages[0];
  const pricing = approved?.minimumPrice != null && approved?.maximumPrice != null
    ? `${approved.currency} ${approved.minimumPrice.toLocaleString()}-${approved.maximumPrice.toLocaleString()}`
    : "[APPROVED PRICE RANGE]";
  const delivery = approved?.deliveryMinDays != null && approved?.deliveryMaxDays != null
    ? `${approved.deliveryMinDays}-${approved.deliveryMaxDays} days`
    : "[APPROVED DELIVERY RANGE]";
  const answer = latest?.category === "PRICING_QUESTION" || mode === "ADD_PRICING"
    ? `For an initial ${service}, the approved working range is ${pricing}, with an expected delivery window of ${delivery}. I would confirm the final scope and price after a short requirements review.`
    : latest?.category === "MEETING_REQUEST" || mode === "SUGGEST_MEETING"
      ? "I would be glad to discuss this. Please share your timezone and preferred slot, or I can send two available options."
      : `Thanks for the reply. Based on the current evidence, ${service} looks like the most relevant starting point. I will confirm any technical assumptions before committing to the implementation.`;
  return {
    subject: replySubject(conversation.subject),
    bodyText: `Hi,\n\n${answer}${questions.length ? `\n\nI noted your question: ${questions[0]}` : ""}\n\nBest,\nRajat Tomar`,
    confidence: approved ? 82 : 68,
    warnings: approved ? [] : ["No approved pricing or delivery package exists; placeholders were inserted."],
    usedFacts: [service, ...questions.slice(0, 3)]
  };
}

function suggestedReplyPrompt(mode: typeof replyModes[number]) {
  return [
    "You are ProspectPilot's grounded sales reply copilot.",
    `Requested editing mode: ${mode}.`,
    "Answer every explicit prospect question that can be answered from supplied evidence.",
    "Use only verified evidence, opportunity data, conversation facts, and approved service packages.",
    "Never invent capabilities, integrations, clients, case studies, results, delivery dates, discounts, or prices.",
    "If a required fact is unavailable, insert a clear square-bracket placeholder and add a warning.",
    "Any price or delivery statement must stay inside an approved package boundary.",
    "Keep the reply concise, specific, human, and ready for operator approval."
  ].join("\n");
}

function estimatePipeline(companies: Array<{ opportunities: Array<{ confidence: number }> }>) {
  const qualified = companies.filter((item) => item.opportunities.length > 0);
  return { currency: "USD", minimum: qualified.length * 2000, maximum: qualified.length * 6000, basis: "Configured default planning range; not a quoted value." };
}

function replySubject(subject?: string | null) {
  if (!subject) return "Re: Your inquiry";
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : "Suggested reply provider failed.";
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]").slice(0, 1000);
}
