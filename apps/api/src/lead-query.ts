import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const leadQuerySchema = z.object({
  sourceId: z.string().optional(),
  connectorId: z.string().optional(),
  scoreBand: z.enum(["HOT", "QUALIFIED", "REVIEW", "LOW"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  hasContact: z.coerce.boolean().optional(),
  hasWebsite: z.coerce.boolean().optional(),
  status: z.string().optional(),
  pipelineStage: z.string().optional(),
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
  notes: { orderBy: { createdAt: "desc" }, take: 3 }
} satisfies Prisma.CompanyInclude;
