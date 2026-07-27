import { EvidenceSource, PrismaClient, VerificationStatus } from "@prisma/client";
import {
  buildCompanyIdentity,
  calculateLeadQuality,
  detectLeadQualityIssues,
  normalizeContactValue
} from "@prospectpilot/shared";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    include: {
      website: true,
      contacts: true,
      socials: true,
      audits: { orderBy: { createdAt: "desc" }, take: 1 },
      opportunities: { take: 1 },
      sourceObservations: true
    }
  });

  for (const company of companies) {
    if (company.leadSourceId) {
      await prisma.companySourceObservation.upsert({
        where: { companyId_leadSourceId: { companyId: company.id, leadSourceId: company.leadSourceId } },
        create: {
          companyId: company.id,
          leadSourceId: company.leadSourceId,
          sourceUrl: company.sourceUrl,
          confidence: company.extractionScore,
          raw: company.raw ?? undefined,
          firstSeenAt: company.createdAt,
          lastSeenAt: company.updatedAt
        },
        update: { sourceUrl: company.sourceUrl, confidence: company.extractionScore, lastSeenAt: company.updatedAt }
      });
    }

    const directoryFields = [
      ["name", company.name],
      ["websiteUrl", company.websiteUrl],
      ["email", company.email],
      ["phone", company.phone],
      ["address", company.address],
      ["city", company.city],
      ["region", company.region],
      ["country", company.country],
      ["industry", company.industry],
      ["category", company.category],
      ["description", company.description]
    ] as const;
    for (const [field, value] of directoryFields) {
      if (!value) continue;
      await upsertEvidence({
        companyId: company.id,
        field,
        value,
        sourceUrl: company.sourceUrl,
        sourceType: "DIRECTORY",
        confidence: company.extractionScore,
        trustStatus: company.extractionScore >= 75 ? "PROBABLE" : "UNVERIFIED",
        extractionMethod: "historical-connector-backfill"
      });
    }

    if (company.website) {
      const websiteVerified = company.website.isVerified;
      await prisma.website.update({
        where: { id: company.website.id },
        data: {
          sourceUrl: company.website.finalUrl || company.website.url,
          trustStatus: websiteVerified ? "VERIFIED" : company.website.discoveryScore >= 75 ? "PROBABLE" : "UNVERIFIED",
          lastVerifiedAt: websiteVerified ? company.website.updatedAt : null
        }
      });
      await upsertEvidence({
        companyId: company.id,
        field: "websiteUrl",
        value: company.website.finalUrl || company.website.url,
        sourceUrl: company.website.finalUrl || company.website.url,
        sourceType: "OFFICIAL_WEBSITE",
        confidence: websiteVerified ? 100 : company.website.discoveryScore,
        trustStatus: websiteVerified ? "VERIFIED" : "PROBABLE",
        extractionMethod: "historical-http-verification"
      });
    }

    for (const contact of company.contacts) {
      const normalizedValue =
        contact.type === "EMAIL" || contact.type === "PHONE"
          ? normalizeContactValue(contact.type, contact.value)
          : contact.value.toLowerCase().trim();
      const trustStatus = contact.confidence >= 80 ? "PROBABLE" : "UNVERIFIED";
      await prisma.contact.update({
        where: { id: contact.id },
        data: { normalizedValue, trustStatus, isPrimary: false }
      });
      await upsertEvidence({
        companyId: company.id,
        entityType: "CONTACT",
        entityId: contact.id,
        field: contact.type.toLowerCase(),
        value: contact.value,
        sourceUrl: contact.sourceUrl,
        sourceType: contact.sourceUrl === company.sourceUrl ? "DIRECTORY" : "OFFICIAL_WEBSITE",
        confidence: contact.confidence,
        trustStatus,
        extractionMethod: "historical-contact-backfill"
      });
    }
    const bestEmail = company.contacts.filter((contact) => contact.type === "EMAIL").sort((a, b) => b.confidence - a.confidence)[0];
    const bestPhone = company.contacts.filter((contact) => contact.type === "PHONE").sort((a, b) => b.confidence - a.confidence)[0];
    for (const contact of [bestEmail, bestPhone].filter(Boolean)) {
      await prisma.contact.update({ where: { id: contact!.id }, data: { isPrimary: true } });
    }

    for (const social of company.socials) {
      await prisma.social.update({
        where: { id: social.id },
        data: {
          sourceUrl: company.website?.finalUrl || company.website?.url || company.websiteUrl,
          confidence: 85,
          trustStatus: "PROBABLE"
        }
      });
      await upsertEvidence({
        companyId: company.id,
        entityType: "SOCIAL",
        entityId: social.id,
        field: `social.${social.platform.toLowerCase()}`,
        value: social.url,
        sourceUrl: company.website?.finalUrl || company.website?.url || company.websiteUrl,
        sourceType: "OFFICIAL_WEBSITE",
        confidence: 85,
        trustStatus: "PROBABLE",
        extractionMethod: "historical-social-backfill"
      });
    }

    const sourceCount = Math.max(1, company.sourceObservations.length || (company.leadSourceId ? 1 : 0));
    const qualityInput = {
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
      sourceCount,
      hasSuccessfulAudit: company.audits[0]?.loadStatus === "COMPLETE",
      hasOpportunity: company.opportunities.length > 0
    };
    const quality = calculateLeadQuality(qualityInput);
    const issues = detectLeadQualityIssues(qualityInput);

    await prisma.dataQualityIssue.deleteMany({ where: { companyId: company.id, status: "OPEN" } });
    if (issues.length) {
      await prisma.dataQualityIssue.createMany({ data: issues.map((issue) => ({ companyId: company.id, ...issue })) });
    }
    const critical = issues.find((issue) => issue.severity === "CRITICAL");
    await prisma.company.update({
      where: { id: company.id },
      data: {
        identityKey: buildCompanyIdentity(company),
        overallConfidence: quality.overallConfidence,
        dataCompleteness: quality.completeness,
        trustStatus: quality.trustStatus,
        lastVerifiedAt: company.website?.isVerified ? company.website.updatedAt : null,
        quarantinedAt: critical ? company.quarantinedAt ?? new Date() : null,
        quarantineReason: critical?.description ?? null
      }
    });
  }

  const sources = await prisma.leadSource.findMany({ include: { companies: true, runs: true } });
  for (const source of sources) {
    const acceptedCount = source.companies.length;
    const qualityScore = acceptedCount ? Math.round(source.companies.reduce((sum, item) => sum + item.extractionScore, 0) / acceptedCount) : 0;
    await prisma.leadSource.update({
      where: { id: source.id },
      data: {
        connectorHealthScore: qualityScore,
        lastSuccessfulRunAt: source.status === "COMPLETE" ? source.lastRunAt : source.lastSuccessfulRunAt
      }
    });
    if (!source.runs.length) {
      await prisma.connectorRun.create({
        data: {
          leadSourceId: source.id,
          status: source.status === "FAILED" ? "FAILED" : "COMPLETE",
          strategy: "historical-backfill",
          candidateCount: acceptedCount,
          acceptedCount,
          qualityScore,
          errorMessage: source.errorMessage,
          startedAt: source.createdAt,
          completedAt: source.lastRunAt || source.updatedAt
        }
      });
    }
  }

  const evidenceCount = await prisma.evidenceRecord.count();
  const issueCount = await prisma.dataQualityIssue.count({ where: { status: "OPEN" } });
  console.log(`Lead Spine backfill complete: ${companies.length} companies, ${evidenceCount} evidence records, ${issueCount} open issues.`);
}

async function upsertEvidence(input: {
  companyId: string;
  entityType?: string;
  entityId?: string;
  field: string;
  value: string;
  sourceUrl?: string | null;
  sourceType: EvidenceSource;
  confidence: number;
  trustStatus: VerificationStatus;
  extractionMethod: string;
}) {
  const existing = await prisma.evidenceRecord.findFirst({
    where: {
      companyId: input.companyId,
      field: input.field,
      value: input.value,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl
    }
  });
  if (existing) {
    await prisma.evidenceRecord.update({
      where: { id: existing.id },
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        confidence: input.confidence,
        trustStatus: input.trustStatus,
        extractionMethod: input.extractionMethod,
        lastCheckedAt: new Date()
      }
    });
    return;
  }
  await prisma.evidenceRecord.create({ data: input });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
