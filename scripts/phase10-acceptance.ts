import { PrismaClient } from "@prisma/client";

process.env.OPENAI_API_KEY = "";

const prisma = new PrismaClient();
const companyId = "phase10-acceptance-company";
const contactId = "phase10-acceptance-contact";
const conversationId = "phase10-acceptance-conversation";
const messageId = "phase10-acceptance-message";
const stalledCompanyId = "phase10-stalled-company";
const stalledConversationId = "phase10-stalled-conversation";
const stalledMessageId = "phase10-stalled-message";

async function main() {
 try {
  await prisma.company.upsert({
    where: { id: companyId },
    create: {
      id: companyId,
      name: "Phase 10 Acceptance Company",
      normalizedName: "phase 10 acceptance company",
      country: "United States",
      industry: "Automotive services",
      sourceUrl: "https://example.com/phase-10-fixture",
      trustStatus: "VERIFIED",
      overallConfidence: 100,
      dataCompleteness: 100
    },
    update: {}
  });
  await prisma.crmItem.upsert({
    where: { companyId },
    create: { companyId, status: "REPLIED", tags: ["phase-10-acceptance"] },
    update: { status: "REPLIED" }
  });
  await prisma.contact.upsert({
    where: { id: contactId },
    create: {
      id: contactId,
      companyId,
      type: "EMAIL",
      value: "buyer@phase10.example",
      normalizedValue: "buyer@phase10.example",
      trustStatus: "VERIFIED",
      confidence: 100,
      isPrimary: true,
      contactabilityState: "REPLIED"
    },
    update: {}
  });
  await prisma.conversation.upsert({
    where: { id: conversationId },
    create: {
      id: conversationId,
      companyId,
      channel: "EMAIL",
      subject: "Pricing and implementation timeline",
      status: "NEEDS_REPLY",
      latestMessageAt: new Date()
    },
    update: { latestMessageAt: new Date(), status: "NEEDS_REPLY" }
  });
  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_normalizedAddress_role: {
        conversationId,
        normalizedAddress: "buyer@phase10.example",
        role: "SENDER"
      }
    },
    create: {
      conversationId,
      contactId,
      name: "Acceptance Buyer",
      address: "buyer@phase10.example",
      normalizedAddress: "buyer@phase10.example",
      role: "SENDER"
    },
    update: {}
  });
  await prisma.message.upsert({
    where: { id: messageId },
    create: {
      id: messageId,
      conversationId,
      companyId,
      contactId,
      channel: "EMAIL",
      direction: "INBOUND",
      status: "DELIVERED",
      subject: "Re: Pricing and implementation timeline",
      bodyText: "This looks interesting. Can you share pricing and how long implementation takes?",
      receivedAt: new Date()
    },
    update: {
      bodyText: "This looks interesting. Can you share pricing and how long implementation takes?",
      receivedAt: new Date()
    }
  });
  await prisma.conversationSummary.deleteMany({ where: { conversationId } });

  const { analyzeInboundMessage, detectStalledConversations } = await import("../apps/workers/src/intelligence-worker.js");
  await analyzeInboundMessage(messageId, prisma);
  await analyzeInboundMessage(messageId, prisma);

  const stalledAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
  await prisma.company.upsert({
    where: { id: stalledCompanyId },
    create: { id: stalledCompanyId, name: "Phase 10 Stalled Fixture", normalizedName: "phase 10 stalled fixture", trustStatus: "VERIFIED", overallConfidence: 100 },
    update: {}
  });
  await prisma.crmItem.upsert({
    where: { companyId: stalledCompanyId },
    create: { companyId: stalledCompanyId, status: "REPLIED", tags: ["phase-10-acceptance"] },
    update: { status: "REPLIED" }
  });
  await prisma.conversation.upsert({
    where: { id: stalledConversationId },
    create: { id: stalledConversationId, companyId: stalledCompanyId, channel: "EMAIL", subject: "Unanswered acceptance question", status: "NEEDS_REPLY", latestMessageAt: stalledAt },
    update: { status: "NEEDS_REPLY", latestMessageAt: stalledAt }
  });
  await prisma.message.upsert({
    where: { id: stalledMessageId },
    create: { id: stalledMessageId, conversationId: stalledConversationId, companyId: stalledCompanyId, channel: "EMAIL", direction: "INBOUND", status: "DELIVERED", subject: "Re: Unanswered acceptance question", bodyText: "Could you share the next step?", receivedAt: stalledAt, createdAt: stalledAt },
    update: { receivedAt: stalledAt, createdAt: stalledAt }
  });
  const stalledFirstRun = await detectStalledConversations(prisma, { companyIds: [stalledCompanyId] });
  const stalledSecondRun = await detectStalledConversations(prisma, { companyIds: [stalledCompanyId] });

  const result = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: {
      replyIntelligence: true,
      recommendedActions: true,
      conversation: { include: { intelligenceSummary: true, salesTasks: true } },
      aiRuns: true
    }
  });

  const stalled = await prisma.conversation.findUniqueOrThrow({
    where: { id: stalledConversationId },
    include: { recommendedActions: true, salesTasks: true }
  });

  console.log(JSON.stringify({
    fixture: true,
    messageId: result.id,
    intelligence: result.replyIntelligence && {
      category: result.replyIntelligence.category,
      confidence: result.replyIntelligence.confidence,
      sentiment: result.replyIntelligence.sentiment,
      commercialIntent: result.replyIntelligence.commercialIntent,
      questions: result.replyIntelligence.extractedQuestions,
      evidenceMessageIds: result.replyIntelligence.evidenceMessageIds,
      reviewStatus: result.replyIntelligence.reviewStatus
    },
    summary: result.conversation.intelligenceSummary,
    actions: result.recommendedActions.map((item) => ({
      action: item.action,
      priority: item.priority,
      recommendedCrmStage: item.recommendedCrmStage,
      confidence: item.confidence,
      status: item.status
    })),
    taskCount: result.conversation.salesTasks.length,
    auditRuns: result.aiRuns.map((item) => ({
      provider: item.provider,
      model: item.model,
      promptVersion: item.promptVersion,
      status: item.status,
      evidenceMessageIds: item.evidenceMessageIds
    })),
    stalledDetection: {
      firstRun: stalledFirstRun,
      secondRun: stalledSecondRun,
      actionCount: stalled.recommendedActions.length,
      taskCount: stalled.salesTasks.length,
      reason: stalled.recommendedActions[0]?.reason
    }
  }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
