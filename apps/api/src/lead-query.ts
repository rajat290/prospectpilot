import type { Prisma } from "@prisma/client";
import { z } from "zod";

const queryBoolean = z.preprocess(
  (value) => value === "true" ? true : value === "false" ? false : value,
  z.boolean()
);

export const leadQuerySchema = z.object({
  sourceId: z.string().optional(),
  connectorId: z.string().optional(),
  scoreBand: z.enum(["HOT", "QUALIFIED", "REVIEW", "LOW"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  hasContact: queryBoolean.optional(),
  hasWebsite: queryBoolean.optional(),
  status: z.string().optional(),
  pipelineStage: z.string().optional(),
  trustStatus: z.enum(["VERIFIED", "PROBABLE", "UNVERIFIED", "CONFLICTING", "STALE", "REJECTED"]).optional(),
  hasIssues: queryBoolean.optional(),
  quarantined: queryBoolean.optional(),
  opportunity: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100)
});

export type LeadQuery = z.infer<typeof leadQuerySchema>;

export function buildCompanyWhere(query: LeadQuery): Prisma.CompanyWhereInput {
  return {
    leadSourceId: query.sourceId,
    connectorId: query.connectorId,
    status: query.status as never,
    trustStatus: query.trustStatus,
    quarantinedAt: query.quarantined === undefined ? undefined : query.quarantined ? { not: null } : null,
    websiteUrl: query.hasWebsite === undefined ? undefined : query.hasWebsite ? { not: null } : null,
    OR: query.q
      ? [
          { name: { contains: query.q, mode: "insensitive" } },
          { city: { contains: query.q, mode: "insensitive" } },
          { region: { contains: query.q, mode: "insensitive" } },
          { industry: { contains: query.q, mode: "insensitive" } },
          { category: { contains: query.q, mode: "insensitive" } }
        ]
      : undefined,
    contacts: query.hasContact === undefined ? undefined : query.hasContact ? { some: {} } : { none: {} },
    qualityIssues: query.hasIssues === undefined ? undefined : query.hasIssues ? { some: { status: "OPEN" } } : { none: { status: "OPEN" } },
    crmItem: query.pipelineStage ? { is: { status: query.pipelineStage as never } } : undefined,
    opportunities: query.opportunity
      ? { some: { category: { contains: query.opportunity, mode: "insensitive" } } }
      : undefined,
    leadScore:
      query.scoreBand || query.minScore !== undefined
        ? {
            is: {
              band: query.scoreBand,
              score: query.minScore !== undefined ? { gte: query.minScore } : undefined
            }
          }
        : undefined
  };
}

export const companyInclude = {
  leadSource: true,
  website: true,
  contacts: true,
  socials: true,
  technologies: true,
  audits: { orderBy: { createdAt: "desc" }, take: 1 },
  leadScore: true,
  opportunities: { orderBy: { confidence: "desc" } },
  outreachDrafts: true,
  crmItem: true,
  qualityIssues: { where: { status: "OPEN" }, orderBy: [{ severity: "desc" }, { detectedAt: "desc" }] },
  sourceObservations: {
    orderBy: { lastSeenAt: "desc" },
    include: { leadSource: { select: { id: true, name: true, url: true, connectorHealthScore: true } } }
  },
  notes: { orderBy: { createdAt: "desc" }, take: 3 }
} satisfies Prisma.CompanyInclude;
