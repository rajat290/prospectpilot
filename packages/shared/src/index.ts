export const JOB_NAMES = {
  crawlSource: "crawl-source",
  discoverWebsite: "discover-website",
  extractContacts: "extract-contacts",
  auditWebsite: "audit-website",
  detectTechnology: "detect-technology",
  enrichCompany: "enrich-company",
  dailyReport: "daily-report"
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
