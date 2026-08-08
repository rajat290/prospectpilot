import cors from "@fastify/cors";
import {
  CompanyStatus,
  JobStatus,
  PipelineStage,
  Prisma,
  PrismaClient,
  ScoreBand,
  SourceStatus,
  VerificationStatus
} from "@prisma/client";
import { calculateLeadQuality } from "@prospectpilot/shared";
import Fastify from "fastify";
import { z } from "zod";
import { env } from "./env.js";
import { buildCompanyWhere, companyInclude, leadQuerySchema } from "./lead-query.js";
import { queueCompanyEnrichment, queueInitialSourcePipeline } from "./queues.js";
import { registerCommunicationRoutes } from "./communications.js";
import { registerPhase9BRoutes } from "./communications-phase9b.js";
import { registerPhase9CRoutes } from "./communications-phase9c.js";
import { registerIntelligenceRoutes } from "./intelligence.js";

const prisma = new PrismaClient();
const app = Fastify({ logger: true, bodyLimit: 11 * 1024 * 1024 });

await app.register(cors, { origin: true });
app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
await prisma.company.updateMany({
  where: {
    websiteUrl: { not: null },
    websiteDiscoveryStatus: "PENDING"
  },
  data: {
    websiteDiscoveryStatus: "DISCOVERED",
    websiteDiscoveryAt: new Date()
  }
});

app.get("/health", async () => {
  const [database, latestJob] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => "connected").catch(() => "unavailable"),
    prisma.job.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, updatedAt: true } })
  ]);
  return {
    ok: database === "connected",
    service: "prospectpilot-api",
    database,
    workerActivity: latestJob,
    timestamp: new Date().toISOString()
  };
});

app.get("/sources", async () => {
  return prisma.leadSource.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { companies: true, jobs: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      runs: { orderBy: { startedAt: "desc" }, take: 10 }
    }
  });
});

app.post("/sources", async (request, reply) => {
  const body = z
    .object({
      url: z.string().url(),
      name: z.string().min(1).optional(),
      maxRecords: z.coerce.number().int().min(1).max(1000).default(100),
      requestDelayMs: z.coerce.number().int().min(250).max(10_000).default(750)
    })
    .parse(request.body);

  const existing = await prisma.leadSource.findUnique({ where: { url: body.url } });
  if (existing) {
    const isRunning = existing.status === "CRAWLING" || existing.status === "ENRICHING";
    const source = await prisma.leadSource.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        maxRecords: body.maxRecords,
        requestDelayMs: body.requestDelayMs,
        errorMessage: null,
        status: isRunning ? existing.status : "PENDING"
      }
    });
    if (!isRunning) await queueInitialSourcePipeline(source.id, source.url);
    return reply.code(isRunning ? 200 : 202).send({ ...source, reused: true, queued: !isRunning });
  }

  const source = await prisma.leadSource.create({
    data: {
      url: body.url,
      name: body.name,
      maxRecords: body.maxRecords,
      requestDelayMs: body.requestDelayMs,
      status: "PENDING"
    }
  });
  await queueInitialSourcePipeline(source.id, source.url);
  return reply.code(201).send(source);
});

app.post("/sources/:id/run", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const source = await prisma.leadSource.findUnique({ where: { id } });
  if (!source) return reply.code(404).send({ message: "Source not found" });
  const job = await queueInitialSourcePipeline(source.id, source.url);
  return reply.code(202).send(job);
});

app.patch("/sources/:id/automation", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      enabled: z.boolean(),
      scheduleCron: z.string().min(1).default("0 8 * * *"),
      scheduleTimezone: z.string().min(1).default("Asia/Kolkata")
    })
    .parse(request.body);

  const source = await prisma.leadSource.update({
    where: { id },
    data: {
      automationEnabled: body.enabled,
      scheduleCron: body.scheduleCron,
      scheduleTimezone: body.scheduleTimezone,
      nextRunAt: body.enabled ? nextDailyRun(body.scheduleCron) : null
    }
  });
  return reply.send(source);
});

app.get("/companies", async (request) => {
  const query = leadQuerySchema.parse(request.query);
  return prisma.company.findMany({
    where: buildCompanyWhere(query),
    take: query.limit,
    orderBy: [{ leadScore: { score: "desc" } }, { createdAt: "desc" }],
    include: companyInclude
  });
});

app.get("/companies/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      ...companyInclude,
      audits: { orderBy: { createdAt: "desc" }, take: 10 },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
      notes: { orderBy: { createdAt: "desc" } },
      evidence: { orderBy: [{ trustStatus: "asc" }, { confidence: "desc" }, { observedAt: "desc" }] },
      qualityIssues: { orderBy: [{ status: "asc" }, { detectedAt: "desc" }] },
      conversations: {
        orderBy: { latestMessageAt: "desc" },
        include: {
          participants: true,
          intelligenceSummary: true,
          intelligence: { orderBy: { createdAt: "desc" }, take: 5 },
          recommendedActions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5 },
          objections: { where: { status: { in: ["DETECTED", "UNRESOLVED", "DEAL_BLOCKER"] } }, orderBy: { createdAt: "desc" }, take: 5 },
          meetingIntents: { orderBy: { createdAt: "desc" }, take: 3 },
          suggestedReplies: { orderBy: { createdAt: "desc" }, take: 5 },
          salesTasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { dueAt: "asc" }, take: 5 },
          messages: {
            orderBy: { createdAt: "asc" },
            include: { recipients: true, attachments: true, events: { orderBy: { occurredAt: "asc" } }, approval: true, schedule: true }
          }
        }
      }
    }
  });
  return company ?? reply.code(404).send({ message: "Company not found" });
});

app.patch("/companies/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      websiteUrl: z.string().url().nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      region: z.string().nullable().optional(),
      industry: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      status: z.nativeEnum(CompanyStatus).optional()
    })
    .parse(request.body);
  const company = await prisma.company.update({ where: { id }, data: body });
  await addActivity(id, "LEAD_UPDATED", "Lead details updated");
  return reply.send(company);
});

app.post("/companies/:id/enrich", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return reply.code(404).send({ message: "Company not found" });
  const job = await queueCompanyEnrichment(id);
  return reply.code(202).send(job);
});

app.patch("/companies/:id/verification", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      trustStatus: z.nativeEnum(VerificationStatus),
      reason: z.string().max(1000).optional()
    })
    .parse(request.body);
  const company = await prisma.company.update({
    where: { id },
    data: {
      trustStatus: body.trustStatus,
      lastVerifiedAt: body.trustStatus === "VERIFIED" ? new Date() : undefined,
      quarantinedAt: body.trustStatus === "REJECTED" ? new Date() : body.trustStatus === "VERIFIED" ? null : undefined,
      quarantineReason: body.trustStatus === "REJECTED" ? body.reason || "Manually rejected" : body.trustStatus === "VERIFIED" ? null : undefined
    }
  });
  await addActivity(id, "VERIFICATION_UPDATED", `Lead marked ${body.trustStatus.toLowerCase()}${body.reason ? `: ${body.reason}` : ""}`);
  return reply.send(company);
});

app.patch("/evidence/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ trustStatus: z.enum(["VERIFIED", "REJECTED"]) }).parse(request.body);
  const evidence = await prisma.evidenceRecord.update({
    where: { id },
    data: { trustStatus: body.trustStatus, lastCheckedAt: new Date() }
  });
  await addActivity(
    evidence.companyId,
    "EVIDENCE_REVIEWED",
    `${evidence.field} evidence marked ${body.trustStatus.toLowerCase()}`
  );
  await refreshLeadTrust(evidence.companyId);
  return reply.send(evidence);
});

app.patch("/quality-issues/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["RESOLVED", "IGNORED"]) }).parse(request.body);
  const issue = await prisma.dataQualityIssue.update({
    where: { id },
    data: { status: body.status, resolvedAt: new Date() }
  });
  await addActivity(issue.companyId, "QUALITY_ISSUE_UPDATED", `${issue.title} marked ${body.status.toLowerCase()}`);
  await refreshLeadTrust(issue.companyId);
  return reply.send(issue);
});

app.get("/providers/status", async () => ({
  search: {
    provider: env.searchProvider,
    configured: Boolean(env.searchProviderApiKey),
    documentationUrl: "https://serpapi.com/search-api"
  }
}));

app.post("/companies/discover-websites", async (request, reply) => {
  const body = z
    .object({
      sourceId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(250).default(25)
    })
    .parse(request.body ?? {});
  if (!env.searchProviderApiKey) {
    return reply.code(409).send({
      message: "Website discovery is connected but SEARCH_PROVIDER_API_KEY is not configured in the root .env file."
    });
  }

  const companies = await prisma.company.findMany({
    where: {
      leadSourceId: body.sourceId,
      OR: [{ websiteUrl: null }, { websiteUrl: "" }],
      websiteDiscoveryStatus: { in: ["PENDING", "NOT_FOUND", "PROVIDER_MISSING", "FAILED"] }
    },
    orderBy: [{ extractionScore: "desc" }, { createdAt: "desc" }],
    take: body.limit,
    select: { id: true }
  });
  for (const company of companies) {
    await queueCompanyEnrichment(company.id, "DISCOVER_WEBSITE");
  }
  return reply.code(202).send({ queued: companies.length });
});

app.patch("/companies/:id/crm", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      status: z.nativeEnum(PipelineStage).optional(),
      priority: z.nativeEnum(ScoreBand).nullable().optional(),
      nextReminderAt: z.coerce.date().nullable().optional(),
      tags: z.array(z.string().min(1)).optional()
    })
    .parse(request.body);
  const crmItem = await prisma.crmItem.upsert({
    where: { companyId: id },
    create: { companyId: id, ...body },
    update: body
  });
  if (["MEETING", "PROPOSAL", "WON", "LOST", "RETAINER"].includes(crmItem.status)) {
    const reason = `Campaign stopped because CRM moved to ${crmItem.status}.`;
    await prisma.$transaction([
      prisma.sequenceEnrollment.updateMany({
        where: { companyId: id, status: { in: ["PENDING_APPROVAL", "ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"] } },
        data: { status: "STOPPED", exitReason: reason, completedAt: new Date(), nextStepAt: null }
      }),
      prisma.message.updateMany({
        where: {
          companyId: id,
          sequenceEnrollmentId: { not: null },
          status: { in: ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "QUEUED"] }
        },
        data: { status: "CANCELLED", failureReason: reason }
      }),
      prisma.scheduledMessage.updateMany({
        where: {
          message: { companyId: id, sequenceEnrollmentId: { not: null } },
          status: { in: ["PENDING", "QUEUED"] }
        },
        data: { status: "CANCELLED", cancelledAt: new Date(), lastError: reason }
      })
    ]);
  }
  await addActivity(id, "CRM_UPDATED", `Pipeline moved to ${crmItem.status.replaceAll("_", " ").toLowerCase()}`);
  return reply.send(crmItem);
});

app.post("/companies/:id/notes", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const { body } = z.object({ body: z.string().min(1).max(5000) }).parse(request.body);
  const note = await prisma.note.create({ data: { companyId: id, body } });
  await addActivity(id, "NOTE_ADDED", "A note was added");
  return reply.code(201).send(note);
});

app.get("/pipeline", async () => {
  const companies = await prisma.company.findMany({
    where: { crmItem: { isNot: null } },
    orderBy: [{ leadScore: { score: "desc" } }, { updatedAt: "desc" }],
    include: {
      crmItem: true,
      leadScore: true,
      contacts: true,
      opportunities: { orderBy: { confidence: "desc" }, take: 1 }
    }
  });
  return companies;
});

app.get("/jobs", async (request) => {
  const query = z
    .object({
      status: z.nativeEnum(JobStatus).optional(),
      limit: z.coerce.number().min(1).max(200).default(50)
    })
    .parse(request.query);
  return prisma.job.findMany({
    where: { status: query.status },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    include: { leadSource: { select: { name: true, url: true } } }
  });
});

app.post("/jobs/:id/retry", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const failedJob = await prisma.job.findUnique({ where: { id } });
  if (!failedJob) return reply.code(404).send({ message: "Job not found" });
  const payload = failedJob.payload as { leadSourceId?: string; url?: string; companyId?: string };
  if (failedJob.type === "CRAWL_SOURCE" && payload.leadSourceId && payload.url) {
    return reply.code(202).send(await queueInitialSourcePipeline(payload.leadSourceId, payload.url));
  }
  if (payload.companyId) return reply.code(202).send(await queueCompanyEnrichment(payload.companyId));
  return reply.code(400).send({ message: "This job cannot be retried" });
});

app.get("/reports/daily", async () => {
  const stored = await prisma.dailyReport.findMany({ orderBy: { reportDate: "desc" }, take: 14 });
  if (stored.length > 0) return stored;
  return [await generateDailyReport()];
});

app.post("/reports/daily/generate", async (_request, reply) => {
  return reply.code(201).send(await generateDailyReport());
});

app.get("/dashboard", async () => {
  const today = startOfDay(new Date());
  const [sources, companies, contacts, audited, hotLeads, outreachReady, remindersDue, missingWebsites, jobs, opportunityGroups] =
    await Promise.all([
      prisma.leadSource.count(),
      prisma.company.count(),
      prisma.contact.count(),
      prisma.company.count({ where: { audits: { some: { loadStatus: "COMPLETE" } } } }),
      prisma.leadScore.count({ where: { band: "HOT" } }),
      prisma.company.count({ where: { outreachDrafts: { some: {} } } }),
      prisma.crmItem.count({ where: { nextReminderAt: { lte: new Date() } } }),
      prisma.company.count({ where: { OR: [{ websiteUrl: null }, { websiteUrl: "" }] } }),
      prisma.job.groupBy({ by: ["status"], _count: true }),
      prisma.opportunity.groupBy({
        by: ["category"],
        where: { createdAt: { gte: today } },
        _count: true,
        orderBy: { _count: { category: "desc" } },
        take: 5
      })
    ]);
  return {
    sources,
    companies,
    contacts,
    audited,
    hotLeads,
    outreachReady,
    remindersDue,
    missingWebsites,
    jobs,
    opportunityGroups
  };
});

app.get("/alerts", async () => {
  const [criticalIssues, degradedSources, failedJobs, reminders] = await Promise.all([
    prisma.dataQualityIssue.findMany({
      where: { status: "OPEN", severity: "CRITICAL" },
      orderBy: { detectedAt: "desc" },
      take: 20,
      include: { company: { select: { id: true, name: true } } }
    }),
    prisma.leadSource.findMany({
      where: { OR: [{ connectorHealthScore: { lt: 60 } }, { status: "FAILED" }] },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, url: true, status: true, connectorHealthScore: true, errorMessage: true }
    }),
    prisma.job.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, type: true, errorMessage: true, updatedAt: true }
    }),
    prisma.crmItem.findMany({
      where: { nextReminderAt: { lte: new Date() } },
      orderBy: { nextReminderAt: "asc" },
      take: 20,
      include: { company: { select: { id: true, name: true } } }
    })
  ]);
  return { criticalIssues, degradedSources, failedJobs, reminders };
});

app.get("/quality/summary", async () => {
  const [trust, openIssues, quarantined, average] = await Promise.all([
    prisma.company.groupBy({ by: ["trustStatus"], _count: true }),
    prisma.dataQualityIssue.groupBy({ by: ["severity"], where: { status: "OPEN" }, _count: true }),
    prisma.company.count({ where: { quarantinedAt: { not: null } } }),
    prisma.company.aggregate({ _avg: { overallConfidence: true, dataCompleteness: true } })
  ]);
  return { trust, openIssues, quarantined, average };
});

app.get("/companies/export.csv", async (request, reply) => {
  const query = leadQuerySchema.parse(request.query);
  const companies = await prisma.company.findMany({
    where: buildCompanyWhere(query),
    take: query.limit,
    orderBy: [{ leadScore: { score: "desc" } }, { createdAt: "desc" }],
    include: companyInclude
  });
  const csv = toCsv(companies.map(companyToExportRow));
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="prospectpilot-leads-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(csv);
});

await registerCommunicationRoutes(app, prisma);
await registerPhase9BRoutes(app, prisma);
await registerPhase9CRoutes(app, prisma);
await registerIntelligenceRoutes(app, prisma);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ message: "Invalid request", issues: error.flatten() });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return reply.code(409).send({ message: "This source already exists. Refresh the page and use Run now." });
  }
  return reply.code(500).send({ message: error.message || "Unexpected server error" });
});

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

function companyToExportRow(company: Awaited<ReturnType<typeof getExportCompany>>[number]) {
  const draft = (channel: string) => company.outreachDrafts.find((item) => item.channel === channel);
  const latestAudit = company.audits[0];
  const opportunity = company.opportunities[0];
  return {
    company: company.name,
    website: company.websiteUrl || company.website?.url || "",
    email: company.contacts.find((contact) => contact.type === "EMAIL")?.value || company.email || "",
    phone: company.contacts.find((contact) => contact.type === "PHONE")?.value || company.phone || "",
    city: company.city || "",
    state: company.region || "",
    country: company.country || "",
    industry: company.industry || "",
    connector: company.connectorId || "",
    source: company.leadSource?.url || company.sourceUrl || "",
    score: company.leadScore?.score ?? "",
    priority: company.crmItem?.priority || company.leadScore?.band || "",
    pipeline_stage: company.crmItem?.status || "NEW",
    technologies: company.technologies.map((technology) => technology.name).join("; "),
    has_https: latestAudit?.hasHttps ?? "",
    has_contact_form: latestAudit?.hasContactForm ?? "",
    has_live_chat: latestAudit?.hasLiveChat ?? "",
    has_analytics: latestAudit?.hasAnalytics ?? "",
    opportunity: opportunity?.title || "",
    recommended_service: opportunity?.recommendedService || "",
    outreach_angle: draft("EMAIL")?.personalization || "",
    cold_email_subject: draft("EMAIL")?.subject || "",
    cold_email: draft("EMAIL")?.body || "",
    linkedin_message: draft("LINKEDIN")?.body || "",
    whatsapp_message: draft("WHATSAPP")?.body || "",
    follow_up: draft("FOLLOW_UP")?.body || ""
  };
}

async function getExportCompany() {
  return prisma.company.findMany({ include: companyInclude });
}

async function addActivity(companyId: string, type: string, summary: string) {
  return prisma.activity.create({ data: { companyId, type, summary } });
}

async function refreshLeadTrust(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      website: true,
      contacts: true,
      socials: true,
      audits: { orderBy: { createdAt: "desc" }, take: 1 },
      opportunities: { take: 1 },
      sourceObservations: true,
      qualityIssues: { where: { status: "OPEN" } },
      evidence: { where: { trustStatus: "VERIFIED" } }
    }
  });
  if (!company) return;
  const quality = calculateLeadQuality({
    name: company.name,
    websiteUrl: company.websiteUrl || company.website?.url,
    email: company.email,
    phone: company.phone,
    city: company.city,
    region: company.region,
    country: company.country,
    industry: company.industry,
    category: company.category,
    extractionScore: company.extractionScore,
    websiteConfidence: company.website?.discoveryScore,
    contactConfidences: company.contacts.map((contact) => contact.confidence),
    socialCount: company.socials.length,
    sourceCount: Math.max(1, company.sourceObservations.length),
    hasSuccessfulAudit: company.audits[0]?.loadStatus === "COMPLETE",
    hasOpportunity: company.opportunities.length > 0
  });
  const criticalIssue = company.qualityIssues.find((issue) => issue.severity === "CRITICAL");
  const trustStatus = criticalIssue
    ? criticalIssue.code.includes("CONFLICT")
      ? "CONFLICTING"
      : "UNVERIFIED"
    : company.evidence.length >= 2
      ? "VERIFIED"
      : quality.trustStatus;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      overallConfidence: quality.overallConfidence,
      dataCompleteness: quality.completeness,
      trustStatus,
      lastVerifiedAt: trustStatus === "VERIFIED" ? new Date() : company.lastVerifiedAt,
      quarantinedAt: criticalIssue ? company.quarantinedAt ?? new Date() : null,
      quarantineReason: criticalIssue?.description ?? null
    }
  });
}

async function generateDailyReport() {
  const reportDate = startOfDay(new Date());
  const [leadsFound, qualifiedLeads, hotLeads, emailsFound, phonesFound, failedJobs, topOpportunity, bestLead] =
    await Promise.all([
      prisma.company.count({ where: { createdAt: { gte: reportDate } } }),
      prisma.leadScore.count({ where: { createdAt: { gte: reportDate }, band: { in: ["HOT", "QUALIFIED"] } } }),
      prisma.leadScore.count({ where: { createdAt: { gte: reportDate }, band: "HOT" } }),
      prisma.contact.count({ where: { createdAt: { gte: reportDate }, type: "EMAIL" } }),
      prisma.contact.count({ where: { createdAt: { gte: reportDate }, type: "PHONE" } }),
      prisma.job.count({ where: { updatedAt: { gte: reportDate }, status: "FAILED" } }),
      prisma.opportunity.groupBy({
        by: ["category"],
        where: { createdAt: { gte: reportDate } },
        _count: true,
        orderBy: { _count: { category: "desc" } },
        take: 1
      }),
      prisma.company.findFirst({
        where: { leadScore: { isNot: null } },
        orderBy: { leadScore: { score: "desc" } },
        include: { leadScore: true }
      })
    ]);

  return prisma.dailyReport.upsert({
    where: { reportDate },
    create: {
      reportDate,
      leadsFound,
      qualifiedLeads,
      hotLeads,
      emailsFound,
      phonesFound,
      failedJobs,
      topOpportunity: topOpportunity[0]?.category,
      bestLeadName: bestLead?.name,
      bestLeadScore: bestLead?.leadScore?.score
    },
    update: {
      leadsFound,
      qualifiedLeads,
      hotLeads,
      emailsFound,
      phonesFound,
      failedJobs,
      topOpportunity: topOpportunity[0]?.category,
      bestLeadName: bestLead?.name,
      bestLeadScore: bestLead?.leadScore?.score
    }
  });
}

function nextDailyRun(cron: string) {
  const [minuteText, hourText] = cron.trim().split(/\s+/);
  const minute = Number(minuteText);
  const hour = Number(hourText);
  const next = new Date();
  next.setHours(Number.isFinite(hour) ? hour : 8, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function toCsv(rows: Array<Record<string, string | number | boolean>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? "")).join(","))].join("\n");
}

function escapeCsvCell(value: string | number | boolean) {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
