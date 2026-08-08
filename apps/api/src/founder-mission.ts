import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const founderProfileId = "founder_rajat";
const missionTarget = 10_000_000;
const xpLevels = [
  { level: 1, title: "Starter", requiredXp: 0 },
  { level: 2, title: "Builder", requiredXp: 500 },
  { level: 3, title: "Hunter", requiredXp: 1_500 },
  { level: 4, title: "Closer", requiredXp: 3_500 },
  { level: 5, title: "Operator", requiredXp: 7_000 },
  { level: 6, title: "Growth Architect", requiredXp: 12_000 },
  { level: 7, title: "Founder", requiredXp: 20_000 },
  { level: 8, title: "Revenue Commander", requiredXp: 35_000 },
  { level: 9, title: "Freedom Builder", requiredXp: 60_000 },
  { level: 10, title: "Independent Founder", requiredXp: 100_000 }
];

const defaultMilestones = [
  { milestoneKey: "iphone", title: "iPhone", description: "First practical founder reward after consistent execution.", targetAmount: 120_000, sortOrder: 1, icon: "phone", rewardXp: 600, rewardCoins: 120 },
  { milestoneKey: "gold_chain", title: "Gold Chain", description: "Personal achievement fund for a 40-50 gram chain.", targetAmount: 700_000, sortOrder: 2, icon: "chain", rewardXp: 900, rewardCoins: 180 },
  { milestoneKey: "debt_freedom", title: "Debt Freedom", description: "Clear the approximate Rs 8 lakh loan burden.", targetAmount: 800_000, sortOrder: 3, icon: "shield", rewardXp: 1_500, rewardCoins: 300 },
  { milestoneKey: "good_bike", title: "Good Bike", description: "A clean mobility upgrade earned from collected revenue.", targetAmount: 250_000, sortOrder: 4, icon: "bike", rewardXp: 800, rewardCoins: 160 },
  { milestoneKey: "property_asset", title: "Plot / Farm / Asset", description: "Start the first real asset-building allocation.", targetAmount: 2_500_000, sortOrder: 5, icon: "land", rewardXp: 2_000, rewardCoins: 400 },
  { milestoneKey: "independent_balance", title: "Independent Bank Balance", description: "Build a strong liquid reserve that creates breathing room.", targetAmount: 2_000_000, sortOrder: 6, icon: "vault", rewardXp: 1_800, rewardCoins: 360 },
  { milestoneKey: "xuv_fortuner", title: "XUV / Fortuner", description: "Major vehicle mission after debt, reserve, and assets are moving.", targetAmount: 4_000_000, sortOrder: 7, icon: "vehicle", rewardXp: 2_500, rewardCoins: 500 }
] as const;

const achievements = [
  { badgeKey: "first_outreach", name: "First Outreach", description: "First approved/sent outreach exists.", icon: "send", category: "Sales", rarity: "COMMON", criteria: { event: "MESSAGE_SENT", count: 1 }, rewardXp: 100, rewardCoins: 25 },
  { badgeKey: "first_reply", name: "First Reply", description: "A prospect replied to the mailbox.", icon: "reply", category: "Sales", rarity: "COMMON", criteria: { event: "REPLY_RECEIVED", count: 1 }, rewardXp: 150, rewardCoins: 40 },
  { badgeKey: "first_meeting", name: "First Meeting", description: "First meeting-stage lead or meeting intent detected.", icon: "calendar", category: "Sales", rarity: "RARE", criteria: { event: "MEETING_BOOKED", count: 1 }, rewardXp: 250, rewardCoins: 60 },
  { badgeKey: "first_proposal", name: "First Proposal", description: "First proposal-stage opportunity exists.", icon: "proposal", category: "Sales", rarity: "RARE", criteria: { event: "PROPOSAL_SENT", count: 1 }, rewardXp: 350, rewardCoins: 80 },
  { badgeKey: "first_client", name: "First Client", description: "First deal is marked won.", icon: "win", category: "Sales", rarity: "EPIC", criteria: { event: "DEAL_WON", count: 1 }, rewardXp: 700, rewardCoins: 150 },
  { badgeKey: "hundred_verified_leads", name: "100 Verified Leads", description: "Build a trustworthy lead database.", icon: "database", category: "Quality", rarity: "RARE", criteria: { event: "LEAD_VERIFIED", count: 100 }, rewardXp: 500, rewardCoins: 100 },
  { badgeKey: "first_lakh_collected", name: "First Rs 1 Lakh", description: "Collected revenue crosses Rs 1 lakh.", icon: "cash", category: "Financial", rarity: "EPIC", criteria: { collectedRevenue: 100000 }, rewardXp: 1_000, rewardCoins: 220 },
  { badgeKey: "debt_slayer", name: "Debt Slayer", description: "Debt Freedom mission is completed.", icon: "shield", category: "Financial", rarity: "LEGENDARY", criteria: { milestone: "debt_freedom" }, rewardXp: 1_500, rewardCoins: 300 }
] as const;

export async function registerFounderMissionRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/founder-mission", async () => buildFounderMission(prisma));

  app.patch("/founder-mission/profile", async (request) => {
    await ensureFoundation(prisma);
    const body = z.object({
      displayName: z.string().min(2).max(80).optional(),
      missionTargetAmount: z.number().int().min(100_000).max(1_000_000_000).optional(),
      disciplineMode: z.enum(["ADVISORY", "STRICT"]).optional(),
      privacyModeEnabled: z.boolean().optional(),
      reducedMotionEnabled: z.boolean().optional(),
      soundEnabled: z.boolean().optional()
    }).parse(request.body ?? {});
    await prisma.founderProfile.update({ where: { id: founderProfileId }, data: body });
    return buildFounderMission(prisma);
  });

  app.post("/founder-mission/allocations", async (request, reply) => {
    const profile = await ensureFoundation(prisma);
    const body = z.object({
      milestoneKey: z.string().optional(),
      category: z.enum(["COLLECTED_REVENUE", "BUSINESS_EXPENSE", "TAX_RESERVE", "DEBT_PAYMENT", "EMERGENCY_RESERVE", "PERSONAL_REWARD_FUND", "ASSET_FUND", "VEHICLE_FUND", "UNALLOCATED_BALANCE", "VERIFIED_INVESTMENT"]),
      amount: z.number().int().positive(),
      note: z.string().max(1000).optional(),
      evidenceUrl: z.string().url().optional(),
      verified: z.boolean().default(true),
      occurredAt: z.coerce.date().optional()
    }).parse(request.body ?? {});
    const milestone = body.milestoneKey ? await prisma.missionMilestone.findUnique({ where: { milestoneKey: body.milestoneKey } }) : null;
    const idempotencyKey = `manual-allocation:${profile.id}:${body.category}:${body.amount}:${body.occurredAt?.toISOString() ?? new Date().toISOString()}:${body.note ?? ""}`;
    await prisma.missionAllocation.upsert({
      where: { idempotencyKey },
      create: {
        profileId: profile.id,
        milestoneId: milestone?.id,
        category: body.category,
        amount: body.amount,
        occurredAt: body.occurredAt ?? new Date(),
        evidenceUrl: body.evidenceUrl,
        note: body.note,
        verified: body.verified,
        source: "MANUAL",
        idempotencyKey
      },
      update: {}
    });
    await recalculateMilestones(prisma, profile.id);
    return reply.code(201).send(await buildFounderMission(prisma));
  });

  app.post("/founder-mission/debt-payments", async (request, reply) => {
    const profile = await ensureFoundation(prisma);
    const body = z.object({
      debtAccountId: z.string().optional(),
      amount: z.number().int().positive(),
      note: z.string().max(1000).optional(),
      evidenceUrl: z.string().url().optional(),
      paidAt: z.coerce.date().optional()
    }).parse(request.body ?? {});
    const idempotencyKey = `manual-debt:${profile.id}:${body.debtAccountId ?? "general"}:${body.amount}:${body.paidAt?.toISOString() ?? new Date().toISOString()}:${body.note ?? ""}`;
    await prisma.debtPayment.upsert({
      where: { idempotencyKey },
      create: { profileId: profile.id, debtAccountId: body.debtAccountId, amount: body.amount, paidAt: body.paidAt ?? new Date(), note: body.note, evidenceUrl: body.evidenceUrl, idempotencyKey },
      update: {}
    });
    await prisma.missionAllocation.upsert({
      where: { idempotencyKey: `allocation:${idempotencyKey}` },
      create: { profileId: profile.id, category: "DEBT_PAYMENT", amount: body.amount, occurredAt: body.paidAt ?? new Date(), source: "DEBT_PAYMENT", verified: true, note: body.note, evidenceUrl: body.evidenceUrl, idempotencyKey: `allocation:${idempotencyKey}` },
      update: {}
    });
    await recalculateMilestones(prisma, profile.id);
    return reply.code(201).send(await buildFounderMission(prisma));
  });

  app.post("/founder-mission/celebrations/:id/viewed", async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return prisma.celebrationEvent.update({ where: { id }, data: { viewedAt: new Date() } });
  });
}

async function buildFounderMission(prisma: PrismaClient) {
  const profile = await ensureFoundation(prisma);
  await syncFounderEvents(prisma, profile.id);
  await recalculateMilestones(prisma, profile.id);
  await updateDailyQuests(prisma, profile.id);
  await evaluateAchievements(prisma, profile.id);
  const [
    freshProfile,
    milestones,
    xp,
    wallet,
    quests,
    achievements,
    celebrations,
    allocations,
    debtPayments,
    wonDeals,
    pipeline,
    recentActivities
  ] = await Promise.all([
    prisma.founderProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { streak: true } }),
    prisma.missionMilestone.findMany({ where: { profileId: profile.id }, orderBy: { sortOrder: "asc" } }),
    prisma.xpLedger.findMany({ where: { profileId: profile.id, reversedAt: null }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.rewardWallet.findUnique({ where: { profileId: profile.id } }),
    prisma.dailyQuest.findMany({ where: { profileId: profile.id, questDate: startOfDay(new Date()) }, orderBy: { targetValue: "desc" } }),
    prisma.earnedAchievement.findMany({ where: { profileId: profile.id }, orderBy: { earnedAt: "desc" }, include: { definition: true }, take: 20 }),
    prisma.celebrationEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.missionAllocation.findMany({ where: { profileId: profile.id, reversedAt: null }, orderBy: { occurredAt: "desc" }, take: 30 }),
    prisma.debtPayment.findMany({ where: { profileId: profile.id }, orderBy: { paidAt: "desc" }, take: 10 }),
    prisma.crmItem.count({ where: { status: "WON" } }),
    prisma.company.count({ where: { crmItem: { status: { in: ["REPLIED", "QUALIFIED", "OPPORTUNITY", "MEETING", "PROPOSAL", "NEGOTIATION"] } } } }),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { company: { select: { id: true, name: true } } } })
  ]);
  const totalXp = xp.reduce((sum, item) => sum + item.finalXp, 0);
  const level = calculateLevel(totalXp);
  const money = calculateMoney(freshProfile.missionTargetAmount, milestones, allocations, debtPayments);
  const nextMilestone = milestones.find((item) => item.status !== "VERIFIED") ?? milestones[milestones.length - 1];
  const recentWins = [
    ...celebrations.slice(0, 4).map((item) => ({ id: item.id, title: item.title, message: item.message, createdAt: item.createdAt, type: item.level })),
    ...recentActivities.slice(0, 4).map((item) => ({ id: item.id, title: item.summary, message: item.company?.name ?? item.type, createdAt: item.createdAt, type: "ACTIVITY" }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  return {
    profile: freshProfile,
    mission: {
      targetAmount: freshProfile.missionTargetAmount,
      freedomProgressAmount: money.freedomProgressAmount,
      progressPercent: percent(money.freedomProgressAmount, freshProfile.missionTargetAmount),
      collectedRevenue: money.collectedRevenue,
      pipelineCount: pipeline,
      wonDeals,
      debtRepaid: money.debtRepaid,
      liquidReserve: money.liquidReserve,
      verifiedInvestmentValue: money.verifiedInvestmentValue,
      nextMilestone,
      formula: "Freedom Progress = verified debt repaid + liquid reserve + verified investment value + completed personal/asset/vehicle allocations."
    },
    xp: {
      total: totalXp,
      recent: xp.slice(0, 10),
      level,
      coins: wallet?.balance ?? 0,
      lifetimeCoins: wallet?.lifetime ?? 0
    },
    milestones: milestones.map((item) => ({ ...item, progressPercent: percent(item.allocatedAmount, item.targetAmount) })),
    quests: quests.map((item) => ({ ...item, progressPercent: percent(item.currentValue, item.targetValue) })),
    achievements,
    celebrations,
    recentWins,
    guardrails: [
      "Deal won and collected payment remain separate.",
      "Pipeline value never counts as personal wealth.",
      "Demo/test records and duplicate events do not create repeated XP.",
      "Financial edits are append-only ledger records."
    ]
  };
}

async function ensureFoundation(prisma: PrismaClient) {
  const profile = await prisma.founderProfile.upsert({
    where: { id: founderProfileId },
    create: { id: founderProfileId, displayName: "Rajat Tomar", missionTargetAmount: missionTarget },
    update: {}
  });
  await prisma.rewardWallet.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id },
    update: {}
  });
  await prisma.founderStreak.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id },
    update: {}
  });
  for (const milestone of defaultMilestones) {
    await prisma.missionMilestone.upsert({
      where: { milestoneKey: milestone.milestoneKey },
      create: {
        profileId: profile.id,
        ...milestone,
        status: milestone.sortOrder === 1 ? "AVAILABLE" : "LOCKED"
      },
      update: {
        title: milestone.title,
        description: milestone.description,
        targetAmount: milestone.targetAmount,
        sortOrder: milestone.sortOrder,
        icon: milestone.icon,
        rewardXp: milestone.rewardXp,
        rewardCoins: milestone.rewardCoins
      }
    });
  }
  for (const item of achievements) {
    await prisma.achievementDefinition.upsert({
      where: { badgeKey: item.badgeKey },
      create: item as Prisma.AchievementDefinitionCreateInput,
      update: {
        name: item.name,
        description: item.description,
        icon: item.icon,
        category: item.category,
        rarity: item.rarity,
        criteria: item.criteria,
        rewardXp: item.rewardXp,
        rewardCoins: item.rewardCoins,
        isActive: true
      }
    });
  }
  return profile;
}

async function syncFounderEvents(prisma: PrismaClient, profileId: string) {
  const [
    verifiedLeads,
    hotLeads,
    sentMessages,
    replies,
    positiveReplies,
    meetings,
    proposals,
    wonDeals,
    paymentAllocations,
    debtPayments
  ] = await Promise.all([
    prisma.company.findMany({ where: { trustStatus: "VERIFIED" }, select: { id: true, name: true } }),
    prisma.leadScore.findMany({ where: { band: "HOT" }, include: { company: { select: { name: true } } } }),
    prisma.message.findMany({ where: { direction: "OUTBOUND", status: { in: ["PROVIDER_SUBMITTED", "SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"] } }, select: { id: true, subject: true } }),
    prisma.message.findMany({ where: { direction: "INBOUND", companyId: { not: null } }, select: { id: true, subject: true } }),
    prisma.replyIntelligence.findMany({ where: { sentiment: "POSITIVE" }, select: { id: true, messageId: true, category: true } }),
    prisma.crmItem.findMany({ where: { status: "MEETING" }, include: { company: { select: { name: true } } } }),
    prisma.crmItem.findMany({ where: { status: "PROPOSAL" }, include: { company: { select: { name: true } } } }),
    prisma.crmItem.findMany({ where: { status: "WON" }, include: { company: { select: { name: true } } } }),
    prisma.missionAllocation.findMany({ where: { profileId, category: "COLLECTED_REVENUE", verified: true, reversedAt: null }, select: { id: true, amount: true } }),
    prisma.debtPayment.findMany({ where: { profileId }, select: { id: true, amount: true } })
  ]);
  for (const lead of verifiedLeads) await awardXp(prisma, profileId, "LEAD_VERIFIED", "Company", lead.id, 5, `Verified lead approved: ${lead.name}`, "MICRO_WIN");
  for (const lead of hotLeads) await awardXp(prisma, profileId, "HIGH_VALUE_LEAD_QUALIFIED", "Company", lead.companyId, 15, `High-value lead qualified: ${lead.company.name}`, "MICRO_WIN");
  for (const message of sentMessages) await awardXp(prisma, profileId, "MESSAGE_SENT", "Message", message.id, 10, `Valid outreach sent${message.subject ? `: ${message.subject}` : ""}`, "MICRO_WIN");
  for (const message of replies) await awardXp(prisma, profileId, "REPLY_RECEIVED", "Message", message.id, 30, `Prospect reply received${message.subject ? `: ${message.subject}` : ""}`, "MICRO_WIN");
  for (const item of positiveReplies) await awardXp(prisma, profileId, "POSITIVE_REPLY", "ReplyIntelligence", item.id, 50, `Positive reply detected: ${item.category.toLowerCase().replaceAll("_", " ")}`, "MICRO_WIN");
  for (const item of meetings) await awardXp(prisma, profileId, "MEETING_BOOKED", "Company", item.companyId, 100, `Discovery call/meeting stage: ${item.company.name}`, "COMMERCIAL_WIN");
  for (const item of proposals) await awardXp(prisma, profileId, "PROPOSAL_SENT", "Company", item.companyId, 150, `Proposal stage reached: ${item.company.name}`, "COMMERCIAL_WIN");
  for (const item of wonDeals) await awardXp(prisma, profileId, "DEAL_WON", "Company", item.companyId, 500, `Deal won: ${item.company.name}`, "COMMERCIAL_WIN");
  for (const item of paymentAllocations) await awardXp(prisma, profileId, "PAYMENT_RECEIVED", "MissionAllocation", item.id, Math.min(2_000, Math.floor(item.amount / 100)), `Payment received: Rs ${item.amount.toLocaleString("en-IN")}`, "COMMERCIAL_WIN");
  for (const item of debtPayments) await awardXp(prisma, profileId, "DEBT_PAYMENT_COMPLETED", "DebtPayment", item.id, 300, `Debt payment recorded: Rs ${item.amount.toLocaleString("en-IN")}`, "MAJOR_MILESTONE");
  await updateStreak(prisma, profileId);
}

async function awardXp(prisma: PrismaClient, profileId: string, eventType: string, sourceEntityType: string, sourceEntityId: string, baseXp: number, reason: string, celebrationLevel: "MICRO_WIN" | "COMMERCIAL_WIN" | "MAJOR_MILESTONE") {
  const idempotencyKey = `${eventType}:${sourceEntityType}:${sourceEntityId}`;
  const existing = await prisma.xpLedger.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const finalXp = Math.max(0, Math.round(baseXp));
  const [entry] = await prisma.$transaction([
    prisma.xpLedger.create({ data: { profileId, eventType, sourceEntityType, sourceEntityId, baseXp, finalXp, reason, idempotencyKey } }),
    prisma.rewardTransaction.upsert({
      where: { idempotencyKey: `coins:${idempotencyKey}` },
      create: { profileId, amount: Math.max(1, Math.floor(finalXp / 10)), reason, sourceEntityType, sourceEntityId, idempotencyKey: `coins:${idempotencyKey}` },
      update: {}
    }),
    prisma.rewardWallet.update({ where: { profileId }, data: { balance: { increment: Math.max(1, Math.floor(finalXp / 10)) }, lifetime: { increment: Math.max(1, Math.floor(finalXp / 10)) } } }),
    prisma.celebrationEvent.upsert({
      where: { idempotencyKey: `celebration:${idempotencyKey}` },
      create: { profileId, level: celebrationLevel, title: eventTitle(eventType), message: reason, sourceEntityType, sourceEntityId, idempotencyKey: `celebration:${idempotencyKey}` },
      update: {}
    })
  ]);
  return entry;
}

async function recalculateMilestones(prisma: PrismaClient, profileId: string) {
  const [milestones, allocations, debtPaid] = await Promise.all([
    prisma.missionMilestone.findMany({ where: { profileId }, orderBy: { sortOrder: "asc" } }),
    prisma.missionAllocation.findMany({ where: { profileId, reversedAt: null, verified: true } }),
    prisma.debtPayment.aggregate({ where: { profileId }, _sum: { amount: true } })
  ]);
  for (const milestone of milestones) {
    const categoryAmount = allocationForMilestone(milestone.milestoneKey, allocations, debtPaid._sum.amount ?? 0);
    const completed = categoryAmount >= milestone.targetAmount;
    const previous = milestones.find((item) => item.sortOrder === milestone.sortOrder - 1);
    const locked = previous && !["COMPLETED", "VERIFIED"].includes(previous.status);
    const status = milestone.verifiedAt ? "VERIFIED" : completed ? "COMPLETED" : locked ? "LOCKED" : categoryAmount > 0 ? "IN_PROGRESS" : "AVAILABLE";
    await prisma.missionMilestone.update({
      where: { id: milestone.id },
      data: {
        allocatedAmount: categoryAmount,
        status,
        completedAt: completed ? milestone.completedAt ?? new Date() : null
      }
    });
    if (completed) await awardXp(prisma, profileId, "MISSION_COMPLETED", "MissionMilestone", milestone.id, milestone.rewardXp, `${milestone.title} mission reached target progress.`, milestone.milestoneKey === "debt_freedom" ? "MAJOR_MILESTONE" : "COMMERCIAL_WIN");
  }
}

async function updateDailyQuests(prisma: PrismaClient, profileId: string) {
  const today = startOfDay(new Date());
  const expiresAt = new Date(today);
  expiresAt.setDate(expiresAt.getDate() + 1);
  const [needsReply, highIntent, proposals, outreachReady, qualified] = await Promise.all([
    prisma.conversation.count({ where: { status: "NEEDS_REPLY" } }),
    prisma.replyIntelligence.count({ where: { commercialIntent: "HIGH", requiresReply: true } }),
    prisma.crmItem.count({ where: { status: "PROPOSAL" } }),
    prisma.company.count({ where: { outreachDrafts: { some: {} } } }),
    prisma.crmItem.count({ where: { status: { in: ["QUALIFIED", "OUTREACH_READY"] } } })
  ]);
  const quests = [
    { metricType: "NEEDS_REPLY", title: "Clear high-value replies", description: "Reply to active prospects before they cool down.", targetValue: Math.max(1, Math.min(5, needsReply)), currentValue: needsReply > 0 ? 0 : 1, xpReward: 120, coinReward: 25, sourceRule: "Urgent prospect replies first" },
    { metricType: "HIGH_INTENT_REVIEW", title: "Review high-intent conversations", description: "Inspect the best conversations and approve the next action.", targetValue: Math.max(1, Math.min(3, highIntent)), currentValue: highIntent > 0 ? 0 : 1, xpReward: 160, coinReward: 35, sourceRule: "Commercial intent queue" },
    { metricType: "PROPOSAL_FOLLOWUP", title: "Protect proposal momentum", description: "Follow up on open proposals or move them forward.", targetValue: Math.max(1, Math.min(2, proposals)), currentValue: proposals > 0 ? 0 : 1, xpReward: 180, coinReward: 40, sourceRule: "Open proposal pressure" },
    { metricType: "OUTREACH_BATCH", title: "Prepare quality outreach", description: "Use contact-ready leads for a controlled reviewed batch.", targetValue: Math.max(5, Math.min(10, outreachReady)), currentValue: Math.min(outreachReady, 3), xpReward: 100, coinReward: 20, sourceRule: "High-quality outreach" },
    { metricType: "QUALIFY_LEADS", title: "Qualify verified opportunities", description: "Move researched leads toward outreach or CRM.", targetValue: Math.max(3, Math.min(8, qualified)), currentValue: Math.min(qualified, 2), xpReward: 90, coinReward: 18, sourceRule: "Lead qualification" }
  ].slice(0, 4);
  for (const quest of quests) {
    const completed = quest.currentValue >= quest.targetValue;
    const record = await prisma.dailyQuest.upsert({
      where: { profileId_questDate_metricType: { profileId, questDate: today, metricType: quest.metricType } },
      create: { profileId, questDate: today, expiresAt, status: completed ? "COMPLETED" : "ACTIVE", completedAt: completed ? new Date() : null, ...quest },
      update: { targetValue: quest.targetValue, currentValue: quest.currentValue, status: completed ? "COMPLETED" : "ACTIVE", completedAt: completed ? new Date() : null, title: quest.title, description: quest.description }
    });
    if (completed) await awardXp(prisma, profileId, "DAILY_QUEST_COMPLETED", "DailyQuest", record.id, quest.xpReward, `Daily quest completed: ${quest.title}`, "MICRO_WIN");
  }
}

async function evaluateAchievements(prisma: PrismaClient, profileId: string) {
  const [definitions, xpCounts, collected, milestones] = await Promise.all([
    prisma.achievementDefinition.findMany({ where: { isActive: true } }),
    prisma.xpLedger.groupBy({ by: ["eventType"], where: { profileId, reversedAt: null }, _count: true }),
    prisma.missionAllocation.aggregate({ where: { profileId, category: "COLLECTED_REVENUE", verified: true, reversedAt: null }, _sum: { amount: true } }),
    prisma.missionMilestone.findMany({ where: { profileId } })
  ]);
  const eventCounts = Object.fromEntries(xpCounts.map((item) => [item.eventType, item._count]));
  for (const definition of definitions) {
    const criteria = definition.criteria as Record<string, unknown>;
    const event = typeof criteria.event === "string" ? criteria.event : null;
    const eventTarget = typeof criteria.count === "number" ? criteria.count : 1;
    const collectedTarget = typeof criteria.collectedRevenue === "number" ? criteria.collectedRevenue : null;
    const milestoneKey = typeof criteria.milestone === "string" ? criteria.milestone : null;
    const earned =
      (event ? (eventCounts[event] ?? 0) >= eventTarget : false) ||
      (collectedTarget != null ? (collected._sum.amount ?? 0) >= collectedTarget : false) ||
      (milestoneKey ? milestones.some((item) => item.milestoneKey === milestoneKey && ["COMPLETED", "VERIFIED"].includes(item.status)) : false);
    if (!earned) continue;
    const created = await prisma.earnedAchievement.upsert({
      where: { profileId_definitionId: { profileId, definitionId: definition.id } },
      create: { profileId, definitionId: definition.id, progress: 100, evidence: asJson({ criteria }) },
      update: {}
    });
    await awardXp(prisma, profileId, "ACHIEVEMENT_UNLOCKED", "EarnedAchievement", created.id, definition.rewardXp, `Achievement unlocked: ${definition.name}`, definition.rarity === "LEGENDARY" ? "MAJOR_MILESTONE" : "COMMERCIAL_WIN");
  }
}

async function updateStreak(prisma: PrismaClient, profileId: string) {
  const latest = await prisma.xpLedger.findFirst({ where: { profileId, eventType: { in: ["MESSAGE_SENT", "REPLY_RECEIVED", "MEETING_BOOKED", "PROPOSAL_SENT", "DEAL_WON", "PAYMENT_RECEIVED", "DEBT_PAYMENT_COMPLETED"] } }, orderBy: { createdAt: "desc" } });
  if (!latest) return;
  const streak = await prisma.founderStreak.findUnique({ where: { profileId } });
  const today = startOfDay(new Date());
  const latestDay = startOfDay(latest.createdAt);
  if (latestDay.getTime() !== today.getTime()) return;
  const lastDay = streak?.lastQualifyingAt ? startOfDay(streak.lastQualifyingAt) : null;
  if (lastDay?.getTime() === today.getTime()) return;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const nextCurrent = lastDay?.getTime() === yesterday.getTime() ? (streak?.currentDays ?? 0) + 1 : 1;
  await prisma.founderStreak.update({ where: { profileId }, data: { currentDays: nextCurrent, longestDays: Math.max(streak?.longestDays ?? 0, nextCurrent), lastQualifyingAt: latest.createdAt } });
}

function calculateMoney(targetAmount: number, milestones: Array<{ milestoneKey: string; allocatedAmount: number; status: string }>, allocations: Array<{ category: string; amount: number; verified: boolean }>, debtPayments: Array<{ amount: number }>) {
  const sum = (category: string) => allocations.filter((item) => item.category === category && item.verified).reduce((total, item) => total + item.amount, 0);
  const debtRepaid = debtPayments.reduce((total, item) => total + item.amount, 0);
  const liquidReserve = sum("EMERGENCY_RESERVE") + sum("UNALLOCATED_BALANCE");
  const verifiedInvestmentValue = sum("VERIFIED_INVESTMENT");
  const personalAssetAllocation = allocations
    .filter((item) => ["PERSONAL_REWARD_FUND", "ASSET_FUND", "VEHICLE_FUND"].includes(item.category) && item.verified)
    .reduce((total, item) => total + item.amount, 0);
  const freedomProgressAmount = Math.min(targetAmount, debtRepaid + liquidReserve + verifiedInvestmentValue + personalAssetAllocation);
  return {
    collectedRevenue: sum("COLLECTED_REVENUE"),
    debtRepaid,
    liquidReserve,
    verifiedInvestmentValue,
    freedomProgressAmount,
    milestoneAllocation: milestones.reduce((total, item) => total + item.allocatedAmount, 0)
  };
}

function allocationForMilestone(milestoneKey: string, allocations: Array<{ category: string; amount: number; verified: boolean }>, debtPaid: number) {
  if (milestoneKey === "debt_freedom") return debtPaid;
  if (milestoneKey === "independent_balance") return sumCategories(allocations, ["EMERGENCY_RESERVE", "UNALLOCATED_BALANCE"]);
  if (milestoneKey === "property_asset") return sumCategories(allocations, ["ASSET_FUND", "VERIFIED_INVESTMENT"]);
  if (milestoneKey === "xuv_fortuner") return sumCategories(allocations, ["VEHICLE_FUND"]);
  return sumCategories(allocations, ["PERSONAL_REWARD_FUND"]);
}

function sumCategories(allocations: Array<{ category: string; amount: number; verified: boolean }>, categories: string[]) {
  return allocations.filter((item) => item.verified && categories.includes(item.category)).reduce((total, item) => total + item.amount, 0);
}

function calculateLevel(totalXp: number) {
  const current = xpLevels.slice().reverse().find((item) => totalXp >= item.requiredXp) ?? xpLevels[0]!;
  const next = xpLevels.find((item) => item.requiredXp > totalXp) ?? null;
  return {
    ...current,
    next,
    progressPercent: next ? percent(totalXp - current.requiredXp, next.requiredXp - current.requiredXp) : 100,
    xpIntoLevel: totalXp - current.requiredXp,
    xpToNext: next ? next.requiredXp - totalXp : 0
  };
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function eventTitle(eventType: string) {
  return eventType.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function percent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
