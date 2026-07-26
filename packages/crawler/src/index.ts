import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedCompany, SourceConnectorId } from "@prospectpilot/shared";

const businessNameSelectors = [
  "[itemprop='name']",
  "[data-company-name]",
  "[data-business-name]",
  ".company",
  ".company-name",
  ".business-name",
  ".organization-name",
  ".vendor-name",
  ".member-name",
  ".listing-title",
  ".card-title",
  ".title",
  "h2",
  "h3"
];

export type CrawlSourceInput = {
  url: string;
  html: string;
};

export type CrawlSourceOutput = {
  companies: ExtractedCompany[];
  diagnostics: {
    candidateCount: number;
    extractionStrategy: string;
    rejectedCount: number;
    connectorId: SourceConnectorId;
  };
};

export function extractCompaniesFromHtml(input: CrawlSourceInput): CrawlSourceOutput {
  const connector = resolveConnector(input.url);
  if (connector.id === "car-part") {
    return extractCarPartCompanies(input);
  }

  return extractGenericCompanies(input, connector.id);
}

function extractGenericCompanies(input: CrawlSourceInput, connectorId: SourceConnectorId): CrawlSourceOutput {
  const $ = cheerio.load(input.html);
  const candidates = findListingCandidates($);
  const extracted = candidates.map((element) => extractCompanyFromElement($, element, input.url));
  const companies = extracted
    .filter((company): company is ExtractedCompany => Boolean(company && company.confidence >= 35))
    .filter(dedupeByNameAndWebsite());

  return {
    companies,
    diagnostics: {
      candidateCount: candidates.length,
      extractionStrategy: "semantic-listing-candidates",
      rejectedCount: extracted.length - companies.length,
      connectorId
    }
  };
}

function extractCarPartCompanies(input: CrawlSourceInput): CrawlSourceOutput {
  const $ = cheerio.load(input.html);
  const companies: ExtractedCompany[] = [];

  $("li").each((_, element) => {
    const root = $(element);
    const anchor = root.find("a[href]").first();
    const anchorText = anchor.text().replace(/\s+/g, " ").trim();
    const name = cleanName(anchorText.replace(/:$/, ""));
    const websiteUrl = normalizeUrl(anchor.attr("href"), input.url);
    const fullText = root.text().replace(/\s+/g, " ").trim();
    const locationText = fullText.replace(anchorText, "").replace(/^:\s*/, "").trim();
    const location = parseCarPartLocation(locationText);

    if (!name || !websiteUrl) return;

    companies.push({
      name,
      websiteUrl,
      city: location.city,
      region: location.state,
      country: location.country,
      category: "Automotive Recycler",
      industry: "Automotive Recycling",
      description: `${name} is listed as an automotive recycler with inventory on Car-Part.com.`,
      sourceUrl: input.url,
      confidence: Math.min(100, 75 + (location.city ? 10 : 0) + (location.state ? 10 : 0)),
      connectorId: "car-part",
      raw: {
        locationText,
        inventoryNetwork: "Car-Part.com"
      }
    });
  });

  return {
    companies: companies.filter(dedupeByNameAndWebsite()),
    diagnostics: {
      candidateCount: $("li").length,
      extractionStrategy: "car-part-dealer-list",
      rejectedCount: $("li").length - companies.length,
      connectorId: "car-part"
    }
  };
}

function findListingCandidates($: cheerio.CheerioAPI): AnyNode[] {
  const selectors = [
    "[itemtype*='Organization']",
    "[itemtype*='LocalBusiness']",
    ".listing",
    ".company",
    ".business",
    ".vendor",
    ".member",
    ".card",
    "article",
    "li"
  ];

  const seen = new Set<AnyNode>();
  const candidates: AnyNode[] = [];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = $(element).text().replace(/\s+/g, " ").trim();
      if (text.length < 8 || text.length > 2500 || seen.has(element)) return;
      if (!looksLikeBusinessCandidate($, element)) return;
      seen.add(element);
      candidates.push(element);
    });
  }

  return candidates;
}

function extractCompanyFromElement(
  $: cheerio.CheerioAPI,
  element: AnyNode,
  sourceUrl: string
): ExtractedCompany | null {
  const root = $(element);
  const name = pickFirstText($, root, businessNameSelectors);
  if (!name || name.length < 2) return null;

  const websiteUrl = pickWebsiteUrl($, root, sourceUrl);
  const email = extractEmail(root.text()) ?? extractMailto($, root);
  const phone = extractPhone(root.text()) ?? extractTel($, root);
  const address = pickFirstText($, root, ["[itemprop='address']", ".address", ".location"]);
  const category = pickFirstText($, root, [".category", ".industry", "[itemprop='category']"]);
  const description = pickFirstText($, root, [".description", ".summary", "[itemprop='description']", "p"]);
  const detailUrl = pickDetailUrl($, root, sourceUrl);

  const confidence =
    35 +
    (websiteUrl ? 20 : 0) +
    (email ? 15 : 0) +
    (phone ? 15 : 0) +
    (address ? 10 : 0) +
    (category ? 5 : 0) +
    (description ? 5 : 0);

  return {
    name: cleanName(name),
    websiteUrl,
    email,
    phone,
    address,
    category,
    description,
    sourceUrl: detailUrl ?? sourceUrl,
    confidence: Math.min(confidence, 100)
  };
}

function pickFirstText(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  selectors: string[]
): string | undefined {
  for (const selector of selectors) {
    const text = root.find(selector).first().text().replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const directHeading = root.children("h1,h2,h3,h4").first().text().replace(/\s+/g, " ").trim();
  return directHeading || undefined;
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string): string | undefined {
  return text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
}

function extractMailto($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): string | undefined {
  return root
    .find("a[href^='mailto:']")
    .map((_, element) => $(element).attr("href")?.replace(/^mailto:/i, "").split("?")[0]?.trim())
    .get()
    .find(Boolean);
}

function extractTel($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): string | undefined {
  return root
    .find("a[href^='tel:']")
    .map((_, element) => $(element).attr("href")?.replace(/^tel:/i, "").trim())
    .get()
    .find(Boolean);
}

function looksLikeBusinessCandidate($: cheerio.CheerioAPI, element: AnyNode): boolean {
  const root = $(element);
  const text = root.text().replace(/\s+/g, " ").trim();
  const hasNameSelector = businessNameSelectors.some((selector) => root.find(selector).first().text().trim().length > 1);
  const hasContactSignal = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d/i.test(text);
  const hasWebsiteSignal = root.find("a[href^='http'], a[href^='mailto:'], a[href^='tel:']").length > 0;
  const hasAddressSignal = root.find("[itemprop='address'], .address, .location").length > 0;

  return hasNameSelector || hasContactSignal || hasWebsiteSignal || hasAddressSignal;
}

function pickWebsiteUrl(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  sourceUrl: string
): string | undefined {
  const sourceHost = safeHost(sourceUrl);
  const links = root
    .find("a[href]")
    .map((_, element) => normalizeUrl($(element).attr("href"), sourceUrl))
    .get()
    .filter((url): url is string => Boolean(url));

  return links.find((url) => {
    const host = safeHost(url);
    if (!host || host === sourceHost) return false;
    return !isSocialOrUtilityUrl(url);
  });
}

function pickDetailUrl(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  sourceUrl: string
): string | undefined {
  const sourceHost = safeHost(sourceUrl);
  return root
    .find("a[href]")
    .map((_, element) => normalizeUrl($(element).attr("href"), sourceUrl))
    .get()
    .find((url) => safeHost(url) === sourceHost);
}

function normalizeUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value || value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("#")) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function isSocialOrUtilityUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|google\.com\/maps/.test(lower);
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\b(view profile|learn more|website)\b/gi, "").trim();
}

function dedupeByNameAndWebsite() {
  const seen = new Set<string>();
  return (company: ExtractedCompany) => {
    const key = `${company.name.toLowerCase()}|${company.websiteUrl ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function resolveConnector(url: string): { id: SourceConnectorId } {
  const host = safeHost(url) ?? "";
  if (host.includes("car-part.com")) return { id: "car-part" };
  if (host.includes("clutch.co")) return { id: "clutch" };
  if (host.includes("goodfirms.co")) return { id: "goodfirms" };
  if (host.includes("indiamart.com")) return { id: "indiamart" };
  if (host.includes("udaan.com")) return { id: "udaan" };
  if (host.includes("a-r-a.org")) return { id: "ara" };
  if (host.includes("10times.com")) return { id: "10times" };
  if (host.includes("yellowpages.com")) return { id: "yellowpages" };
  if (host.includes("yelp.com")) return { id: "yelp" };
  if (host.includes("google.")) return { id: "google-business" };
  return { id: "generic" };
}

function parseCarPartLocation(value: string): { city?: string; state?: string; country?: string } {
  const cleaned = value.replace(/^\s*[:,-]\s*/, "").trim();
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts.slice(0, -1).join(", ") || undefined;
  const state = parts.at(-1);
  return { city, state, country: state === "ON" || state === "QC" ? "Canada" : "USA" };
}
