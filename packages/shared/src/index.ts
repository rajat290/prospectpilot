export const JOB_NAMES = {
  crawlSource: "crawl-source",
  discoverWebsite: "discover-website",
  extractContacts: "extract-contacts",
  auditWebsite: "audit-website",
  detectTechnology: "detect-technology",
  enrichCompany: "enrich-company",
  dailyReport: "daily-report",
  sendCommunication: "send-communication",
  syncGmail: "sync-gmail",
  renewGmailWatch: "renew-gmail-watch",
  processSequence: "process-sequence",
  reconcileMailboxes: "reconcile-mailboxes"
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export type SourceStatus = "pending" | "crawling" | "enriching" | "complete" | "failed";

export type SourceConnectorId =
  | "car-part"
  | "clutch"
  | "goodfirms"
  | "indiamart"
  | "udaan"
  | "ara"
  | "10times"
  | "yellowpages"
  | "yelp"
  | "google-business"
  | "generic";

export type ExtractedCompany = {
  name: string;
  websiteUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  industry?: string;
  category?: string;
  description?: string;
  sourceUrl: string;
  confidence: number;
  connectorId?: SourceConnectorId;
  raw?: Record<string, string | number | boolean | null>;
};

export type WebsiteDiscoveryResult = {
  websiteUrl?: string;
  confidence: number;
  evidence: string[];
};

export type ContactExtractionResult = {
  emails: Array<{ value: string; sourceUrl: string; confidence: number }>;
  phones: Array<{ value: string; sourceUrl: string; confidence: number }>;
  people: Array<{ value: string; label?: string; sourceUrl: string; confidence: number }>;
  socials: Array<{ platform: string; url: string }>;
};

export type WebsiteAuditResult = {
  url: string;
  finalUrl?: string;
  statusCode?: number;
  title?: string;
  metaDescription?: string;
  hasHttps: boolean;
  hasMobileViewport: boolean;
  hasContactForm: boolean;
  hasLiveChat: boolean;
  hasAnalytics: boolean;
  hasCookieBanner: boolean;
  brokenLinkCount: number;
};

export type TechnologyDetection = {
  name: string;
  category: string;
  confidence: number;
  evidence: string;
};

export type ApiHealth = {
  ok: true;
  service: "prospectpilot-api";
  timestamp: string;
};

export type LeadQualityInput = {
  name: string;
  websiteUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  industry?: string | null;
  category?: string | null;
  extractionScore?: number | null;
  websiteConfidence?: number | null;
  contactConfidences?: number[];
  socialCount?: number;
  sourceCount?: number;
  hasSuccessfulAudit?: boolean;
  hasOpportunity?: boolean;
};

export type LeadQualityIssue = {
  code: string;
  field?: string;
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
};

export function normalizeBusinessName(name: string) {
  return name.toLowerCase().replace(/\b(incorporated|corporation|company|limited|inc|corp|llc|ltd|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeContactValue(type: "EMAIL" | "PHONE", value: string) {
  if (type === "EMAIL") return value.trim().toLowerCase();
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? digits : digits.replace(/^1(?=\d{10}$)/, "");
}

export function buildCompanyIdentity(input: Pick<LeadQualityInput, "name" | "websiteUrl" | "city" | "region" | "country">) {
  if (input.websiteUrl) {
    try {
      return `domain:${new URL(input.websiteUrl).hostname.replace(/^www\./, "").toLowerCase()}`;
    } catch {
      // Fall through to the location-based identity.
    }
  }
  const location = [input.city, input.region, input.country].filter(Boolean).join("|").toLowerCase();
  return `name:${normalizeBusinessName(input.name)}|${location}`;
}

export function calculateLeadQuality(input: LeadQualityInput) {
  const hasContact = Boolean(input.email || input.phone || input.contactConfidences?.length);
  const completeness =
    15 +
    (input.websiteUrl ? 20 : 0) +
    (hasContact ? 20 : 0) +
    (input.city || input.region || input.country ? 10 : 0) +
    (input.industry || input.category ? 10 : 0) +
    ((input.socialCount ?? 0) > 0 ? 10 : 0) +
    (input.hasSuccessfulAudit ? 5 : 0) +
    (input.hasOpportunity ? 10 : 0);

  const contactConfidence = Math.max(0, ...(input.contactConfidences ?? []));
  const sourceConfidence = Math.min(100, Math.max(0, input.extractionScore ?? 0));
  const websiteConfidence = input.websiteUrl ? Math.max(0, input.websiteConfidence ?? 50) : 0;
  const crossSourceConfidence = Math.min(100, Math.max(0, (input.sourceCount ?? 1) * 25));
  const auditConfidence = input.hasSuccessfulAudit ? 100 : 0;
  const overallConfidence = Math.round(
    sourceConfidence * 0.3 +
    websiteConfidence * 0.25 +
    contactConfidence * 0.2 +
    crossSourceConfidence * 0.15 +
    auditConfidence * 0.1
  );

  const trustStatus =
    overallConfidence >= 85 && (input.sourceCount ?? 1) > 1
      ? "VERIFIED"
      : overallConfidence >= 60
        ? "PROBABLE"
        : "UNVERIFIED";

  return {
    completeness: Math.min(100, completeness),
    overallConfidence: Math.min(100, overallConfidence),
    trustStatus: trustStatus as "VERIFIED" | "PROBABLE" | "UNVERIFIED"
  };
}

export function detectLeadQualityIssues(input: LeadQualityInput): LeadQualityIssue[] {
  const issues: LeadQualityIssue[] = [];
  if (!input.websiteUrl) {
    issues.push({
      code: "WEBSITE_MISSING",
      field: "websiteUrl",
      title: "Official website not confirmed",
      description: "Website discovery or manual verification is required before outreach.",
      severity: "WARNING"
    });
  }
  if (!input.email && !input.phone && !(input.contactConfidences?.length)) {
    issues.push({
      code: "CONTACT_MISSING",
      field: "contacts",
      title: "No public contact found",
      description: "No usable public email or phone is currently attached to this lead.",
      severity: "WARNING"
    });
  }
  if (!input.city && !input.region && !input.country) {
    issues.push({
      code: "LOCATION_MISSING",
      field: "location",
      title: "Location is incomplete",
      description: "Location is needed to disambiguate similarly named businesses.",
      severity: "INFO"
    });
  }
  if ((input.extractionScore ?? 0) < 45) {
    issues.push({
      code: "LOW_EXTRACTION_CONFIDENCE",
      field: "company",
      title: "Weak source extraction",
      description: "The directory record did not contain enough signals for reliable automatic acceptance.",
      severity: "CRITICAL"
    });
  }
  if (input.websiteUrl && !input.hasSuccessfulAudit) {
    issues.push({
      code: "WEBSITE_NOT_AUDITED",
      field: "websiteUrl",
      title: "Website has not passed verification",
      description: "The website could not yet be loaded and checked as the official business site.",
      severity: "WARNING"
    });
  }
  return issues;
}
