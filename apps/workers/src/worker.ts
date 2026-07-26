import { JobType, PrismaClient } from "@prisma/client";
import { Queue, Worker, type Job as BullJob } from "bullmq";
import { config } from "dotenv";
import IORedis from "ioredis";
import { extractCompaniesFromHtml } from "@prospectpilot/crawler";
import { extractContactsFromHtml, searchOfficialWebsite } from "@prospectpilot/enrichment";
import { generateRuleBasedOpportunities } from "@prospectpilot/opportunity";
import { createOutreachDrafts } from "@prospectpilot/outreach";
import { scoreLead } from "@prospectpilot/scoring";
import { JOB_NAMES } from "@prospectpilot/shared";
import { auditWebsite, detectTechnologiesFromHtml } from "./website-audit.js";

config({ path: new URL("../../../.env", import.meta.url) });

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const producerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue("enrichment", { connection: producerConnection });

new Worker(
  "enrichment",
  async (job) => {
    const trackedJobId = await ensureTrackedJob(job);
    await prisma.job.update({
      where: { id: trackedJobId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: job.attemptsMade + 1 }
    });

    try {
      if (job.name === JOB_NAMES.crawlSource) {
        const { leadSourceId, url } = job.data as { leadSourceId: string; url: string };
        await crawlSource(leadSourceId, url);
      } else if (
        job.name === JOB_NAMES.enrichCompany ||
        job.name === JOB_NAMES.extractContacts ||
        job.name === JOB_NAMES.auditWebsite
      ) {
        const { companyId } = job.data as { companyId: string };
        await enrichCompany(companyId);
      } else if (job.name === JOB_NAMES.dailyReport) {
        await generateDailyReport();
      }

      await prisma.job.update({
        where: { id: trackedJobId },
        data: { status: "COMPLETE", completedAt: new Date(), result: { bullJobId: job.id ?? null } }
      });
    } catch (error) {
      await prisma.job.update({
        where: { id: trackedJobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown worker failure"
        }
      });
      throw error;
    }
  },
  { connection, concurrency: 4 }
);

async function crawlSource(leadSourceId: string, url: string) {
  const sourceConfig = await prisma.leadSource.update({
    where: { id: leadSourceId },
    data: { status: "CRAWLING", lastRunAt: new Date(), errorMessage: null }
  });

  try {
    if (new URL(url).hostname === "demo.prospectpilot.local") {
      await prisma.leadSource.update({
        where: { id: leadSourceId },
        data: { status: "COMPLETE", recordCount: await prisma.company.count({ where: { leadSourceId } }) }
      });
      return;
    }
    if (!(await canCrawl(url))) throw new Error("Source path is disallowed by robots.txt");
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    const html = await response.text();
    const result = extractCompaniesFromHtml({ url, html });
    if (result.companies.length === 0) {
      throw new Error(`No companies extracted using ${result.diagnostics.extractionStrategy}`);
    }

    const companies = result.companies.slice(0, sourceConfig.maxRecords);
    const savedIds: string[] = [];
    for (const company of companies) {
      const normalizedName = normalizeCompanyName(company.name);
      const savedCompany = await prisma.company.upsert({
        where: { leadSourceId_normalizedName: { leadSourceId, normalizedName } },
        create: {
          leadSourceId,
          name: company.name,
          normalizedName,
          websiteUrl: company.websiteUrl,
          phone: company.phone,
          email: company.email,
          address: company.address,
          city: company.city,
          region: company.region,
          country: company.country,
          industry: company.industry,
          category: company.category,
          description: company.description,
          sourceUrl: company.sourceUrl,
          connectorId: company.connectorId,
          raw: company.raw,
          extractionScore: company.confidence,
          status: "EXTRACTED"
        },
        update: {
          name: company.name,
          websiteUrl: company.websiteUrl,
          phone: company.phone,
          email: company.email,
          address: company.address,
          city: company.city,
          region: company.region,
          country: company.country,
          industry: company.industry,
          category: company.category,
          description: company.description,
          sourceUrl: company.sourceUrl,
          connectorId: company.connectorId,
          raw: company.raw,
          extractionScore: company.confidence
        }
      });
      savedIds.push(savedCompany.id);
      await saveDirectoryContacts(savedCompany.id, company.email, company.phone, company.sourceUrl);

      if (company.websiteUrl) {
        await prisma.website.upsert({
          where: { companyId: savedCompany.id },
          create: { companyId: savedCompany.id, url: company.websiteUrl, discoveryScore: 80, isVerified: false },
          update: { url: company.websiteUrl, discoveryScore: 80 }
        });
      }
    }

    await prisma.leadSource.update({
      where: { id: leadSourceId },
      data: { status: "ENRICHING", recordCount: companies.length }
    });

    for (let index = 0; index < savedIds.length; index += 5) {
      const batch = savedIds.slice(index, index + 5);
      await Promise.allSettled(batch.map((companyId) => enrichCompany(companyId)));
      if (index + 5 < savedIds.length) await delay(sourceConfig.requestDelayMs);
    }

    await prisma.leadSource.update({
      where: { id: leadSourceId },
      data: { status: "COMPLETE", recordCount: companies.length }
    });
  } catch (error) {
    await prisma.leadSource.update({
      where: { id: leadSourceId },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unknown crawl failure" }
    });
    throw error;
  }
}

async function enrichCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { website: true, contacts: true }
  });
  if (!company) return;

  let websiteUrl = company.website?.url || company.websiteUrl;
  if (!websiteUrl) {
    try {
      const discovery = await searchOfficialWebsite(
        {
          companyName: company.name,
          city: company.city,
          region: company.region,
          country: company.country
        },
        { apiKey: process.env.SEARCH_PROVIDER_API_KEY }
      );
      if (!discovery.websiteUrl) {
        await prisma.company.update({
          where: { id: companyId },
          data: {
            websiteDiscoveryStatus: discovery.status,
            websiteDiscoveryAt: new Date(),
            websiteDiscoveryError: discovery.evidence.join("; ")
          }
        });
        await ensureCrmItem(company.id, "RESEARCH");
        return;
      }

      websiteUrl = new URL(discovery.websiteUrl).origin;
      await prisma.$transaction([
        prisma.company.update({
          where: { id: companyId },
          data: {
            websiteUrl,
            websiteDiscoveryStatus: "DISCOVERED",
            websiteDiscoveryAt: new Date(),
            websiteDiscoveryError: null
          }
        }),
        prisma.website.upsert({
          where: { companyId },
          create: {
            companyId,
            url: websiteUrl,
            discoveryScore: discovery.confidence,
            isVerified: false
          },
          update: {
            url: websiteUrl,
            discoveryScore: discovery.confidence,
            isVerified: false
          }
        }),
        prisma.activity.create({
          data: {
            companyId,
            type: "WEBSITE_DISCOVERED",
            summary: `Official website discovered via ${discovery.provider} at ${discovery.confidence}% confidence`
          }
        })
      ]);
    } catch (error) {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          websiteDiscoveryStatus: "FAILED",
          websiteDiscoveryAt: new Date(),
          websiteDiscoveryError: error instanceof Error ? error.message : "Website discovery failed"
        }
      });
      throw error;
    }
  } else if (company.websiteDiscoveryStatus === "PENDING") {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        websiteDiscoveryStatus: "DISCOVERED",
        websiteDiscoveryAt: new Date(),
        websiteDiscoveryError: null
      }
    });
  }

  if (!websiteUrl) {
    await ensureCrmItem(company.id, "RESEARCH");
    return;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(websiteUrl);
  } catch (error) {
    await prisma.websiteAudit.create({
      data: {
        companyId,
        url: websiteUrl,
        loadStatus: "FAILED",
        summary: error instanceof Error ? error.message : "Website request failed"
      }
    });
    await prisma.activity.create({
      data: { companyId, type: "AUDIT_FAILED", summary: "Website audit failed; retry is available" }
    });
    throw error;
  }

  const html = await response.text();
  const contacts = extractContactsFromHtml(html, response.url || websiteUrl);
  const audit = auditWebsite(html, response.url || websiteUrl, response.status);
  const technologies = detectTechnologiesFromHtml(html);
  const opportunities = generateRuleBasedOpportunities({
    companyName: company.name,
    industry: company.industry,
    category: company.category,
    connectorId: company.connectorId,
    audit,
    technologies
  });

  await prisma.website.upsert({
    where: { companyId },
    create: {
      companyId,
      url: websiteUrl,
      finalUrl: response.url,
      title: audit.title,
      metaDescription: audit.metaDescription,
      discoveryScore: 80,
      isVerified: response.ok
    },
    update: {
      url: websiteUrl,
      finalUrl: response.url,
      title: audit.title,
      metaDescription: audit.metaDescription,
      isVerified: response.ok
    }
  });

  await saveExtractedContacts(companyId, contacts);
  await prisma.websiteAudit.create({
    data: {
      companyId,
      url: audit.url,
      statusCode: audit.statusCode,
      hasHttps: audit.hasHttps,
      hasMobileViewport: audit.hasMobileViewport,
      hasContactForm: audit.hasContactForm,
      hasLiveChat: audit.hasLiveChat,
      hasAnalytics: audit.hasAnalytics,
      hasCookieBanner: audit.hasCookieBanner,
      brokenLinkCount: audit.brokenLinkCount,
      loadStatus: response.ok ? "COMPLETE" : "FAILED",
      summary: response.ok ? "Website audit completed" : `Website returned HTTP ${response.status}`
    }
  });

  for (const technology of technologies) {
    await prisma.technology.upsert({
      where: { companyId_name: { companyId, name: technology.name } },
      create: { companyId, ...technology },
      update: technology
    });
  }

  await prisma.opportunity.deleteMany({ where: { companyId } });
  for (const opportunity of opportunities) {
    await prisma.opportunity.create({ data: { companyId, ...opportunity } });
  }

  const hasContact =
    contacts.emails.length > 0 ||
    contacts.phones.length > 0 ||
    company.contacts.length > 0 ||
    Boolean(company.email || company.phone);
  const leadScore = scoreLead({
    hasWebsite: true,
    hasContact,
    hasIndustry: Boolean(company.industry || company.category),
    hasWebsiteIssues: !audit.hasHttps || !audit.hasContactForm || !audit.hasMobileViewport,
    hasOpportunity: opportunities.length > 0,
    isHighValueIndustry: isHighValueIndustry(company),
    hasDecisionMakerSignal: company.contacts.some((contact) => contact.type === "PERSON"),
    hasDigitalMaturityGap: !audit.hasLiveChat || !audit.hasAnalytics
  });
  await prisma.leadScore.upsert({
    where: { companyId },
    create: { companyId, score: leadScore.score, band: leadScore.band, breakdown: leadScore.breakdown },
    update: { score: leadScore.score, band: leadScore.band, breakdown: leadScore.breakdown }
  });

  const topOpportunity = opportunities[0];
  if (topOpportunity) {
    const drafts = createOutreachDrafts({
      companyName: company.name,
      city: company.city,
      opportunityTitle: topOpportunity.title,
      recommendedService: topOpportunity.recommendedService,
      reasoning: topOpportunity.reasoning
    });
    for (const draft of drafts) {
      await prisma.outreachDraft.upsert({
        where: { companyId_channel: { companyId, channel: draft.channel } },
        create: { companyId, ...draft },
        update: { subject: draft.subject, body: draft.body, personalization: draft.personalization }
      });
    }
  }

  const stage = leadScore.score >= 60 ? "OUTREACH_READY" : "RESEARCH";
  await ensureCrmItem(companyId, stage, leadScore.band);
  await prisma.company.update({
    where: { id: companyId },
    data: { status: leadScore.score >= 60 ? "QUALIFIED" : "AUDITED" }
  });
  await prisma.activity.create({
    data: {
      companyId,
      type: "ENRICHMENT_COMPLETE",
      summary: `Enrichment completed with a ${leadScore.score}/100 lead score`
    }
  });
}

async function ensureTrackedJob(job: BullJob) {
  const existingId = (job.data as { trackedJobId?: string }).trackedJobId;
  if (existingId) return existingId;
  const type = job.name === JOB_NAMES.crawlSource ? "CRAWL_SOURCE" : job.name === JOB_NAMES.dailyReport ? "DAILY_REPORT" : "EXTRACT_CONTACTS";
  const tracked = await prisma.job.create({
    data: {
      leadSourceId: (job.data as { leadSourceId?: string }).leadSourceId,
      type: type as JobType,
      status: "QUEUED",
      payload: job.data
    }
  });
  return tracked.id;
}

async function saveDirectoryContacts(companyId: string, email?: string, phone?: string, sourceUrl?: string) {
  if (email) {
    await prisma.contact.upsert({
      where: { companyId_type_value: { companyId, type: "EMAIL", value: email } },
      create: { companyId, type: "EMAIL", value: email, sourceUrl, confidence: 75 },
      update: { sourceUrl, confidence: 75 }
    });
  }
  if (phone) {
    await prisma.contact.upsert({
      where: { companyId_type_value: { companyId, type: "PHONE", value: phone } },
      create: { companyId, type: "PHONE", value: phone, sourceUrl, confidence: 70 },
      update: { sourceUrl, confidence: 70 }
    });
  }
}

async function saveExtractedContacts(companyId: string, contacts: ReturnType<typeof extractContactsFromHtml>) {
  for (const email of contacts.emails) {
    await prisma.contact.upsert({
      where: { companyId_type_value: { companyId, type: "EMAIL", value: email.value } },
      create: { companyId, type: "EMAIL", ...email },
      update: { sourceUrl: email.sourceUrl, confidence: email.confidence }
    });
  }
  for (const phone of contacts.phones) {
    await prisma.contact.upsert({
      where: { companyId_type_value: { companyId, type: "PHONE", value: phone.value } },
      create: { companyId, type: "PHONE", ...phone },
      update: { sourceUrl: phone.sourceUrl, confidence: phone.confidence }
    });
  }
  for (const social of contacts.socials) {
    const platform = mapSocialPlatform(social.platform);
    await prisma.social.upsert({
      where: { companyId_platform_url: { companyId, platform, url: social.url } },
      create: { companyId, platform, url: social.url },
      update: {}
    });
  }
}

async function ensureCrmItem(
  companyId: string,
  status: "RESEARCH" | "OUTREACH_READY",
  priority?: "HOT" | "QUALIFIED" | "REVIEW" | "LOW"
) {
  await prisma.crmItem.upsert({
    where: { companyId },
    create: { companyId, status, priority },
    update: { priority }
  });
}

async function queueDueSources() {
  const due = await prisma.leadSource.findMany({
    where: { automationEnabled: true, nextRunAt: { lte: new Date() } }
  });
  for (const source of due) {
    const tracked = await prisma.job.create({
      data: {
        leadSourceId: source.id,
        type: "CRAWL_SOURCE",
        status: "QUEUED",
        payload: { leadSourceId: source.id, url: source.url, scheduled: true }
      }
    });
    await queue.add(
      JOB_NAMES.crawlSource,
      { leadSourceId: source.id, url: source.url, trackedJobId: tracked.id },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 100, removeOnFail: 250 }
    );
    const nextRunAt = new Date(source.nextRunAt ?? new Date());
    nextRunAt.setDate(nextRunAt.getDate() + 1);
    await prisma.leadSource.update({ where: { id: source.id }, data: { nextRunAt } });
  }
}

async function queueDailyReport() {
  const now = new Date();
  if (now.getHours() < 8) return;
  const reportDate = startOfDay(now);
  const existing = await prisma.dailyReport.findUnique({ where: { reportDate } });
  if (existing) return;
  const tracked = await prisma.job.create({
    data: { type: "DAILY_REPORT", status: "QUEUED", payload: { reportDate: reportDate.toISOString() } }
  });
  await queue.add(JOB_NAMES.dailyReport, { trackedJobId: tracked.id }, { removeOnComplete: 30, removeOnFail: 50 });
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
  await prisma.dailyReport.upsert({
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

async function fetchWithTimeout(url: string) {
  return fetch(url, {
    headers: { "user-agent": "ProspectPilotAI/0.2 (+internal research tool)" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });
}

async function canCrawl(url: string) {
  const target = new URL(url);
  const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": "ProspectPilotAI/0.2 (+internal research tool)" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return true;
    const lines = (await response.text()).split(/\r?\n/);
    let applies = false;
    const disallowed: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.split("#")[0]?.trim() ?? "";
      const [field, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (field?.trim().toLowerCase() === "user-agent") applies = value === "*" || value.toLowerCase() === "prospectpilotai";
      if (applies && field?.trim().toLowerCase() === "disallow" && value) disallowed.push(value);
    }
    return !disallowed.some((path) => target.pathname.startsWith(path));
  } catch {
    return true;
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeCompanyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isHighValueIndustry(company: { industry: string | null; category: string | null; description: string | null }) {
  const text = `${company.industry ?? ""} ${company.category ?? ""} ${company.description ?? ""}`.toLowerCase();
  return ["clinic", "dentist", "real estate", "manufacturer", "school", "automotive", "legal", "financial"].some((term) =>
    text.includes(term)
  );
}

function mapSocialPlatform(platform: string) {
  const map = {
    linkedin: "LINKEDIN",
    twitter: "TWITTER",
    facebook: "FACEBOOK",
    instagram: "INSTAGRAM",
    youtube: "YOUTUBE",
    github: "GITHUB",
    google_business: "GOOGLE_BUSINESS"
  } as const;
  return map[platform.toLowerCase() as keyof typeof map] ?? "OTHER";
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

setInterval(() => {
  void queueDueSources().catch(console.error);
  void queueDailyReport().catch(console.error);
}, 60_000);
void queueDueSources().catch(console.error);
void queueDailyReport().catch(console.error);

console.log("ProspectPilot worker is listening for ingestion, enrichment, and automation jobs.");
