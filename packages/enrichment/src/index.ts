import * as cheerio from "cheerio";
import type { ContactExtractionResult, WebsiteDiscoveryResult } from "@prospectpilot/shared";

export type OfficialWebsiteSearchInput = {
  companyName: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type OfficialWebsiteSearchResult = WebsiteDiscoveryResult & {
  status: "DISCOVERED" | "NOT_FOUND" | "PROVIDER_MISSING";
  provider: "serpapi";
  candidatesChecked: number;
};

type SerpApiResponse = {
  error?: string;
  organic_results?: Array<{ link?: string; title?: string; snippet?: string }>;
};

const excludedWebsiteHosts = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "wikipedia.org",
  "yelp.com",
  "yellowpages.com",
  "car-part.com",
  "clutch.co",
  "goodfirms.co",
  "indiamart.com",
  "10times.com",
  "crunchbase.com",
  "zoominfo.com",
  "mapquest.com",
  "bbb.org"
];

export function discoverWebsiteFromCandidates(
  companyName: string,
  candidates: Array<{ url: string; title?: string; snippet?: string }>
): WebsiteDiscoveryResult {
  const normalizedName = normalize(companyName);
  const scored = candidates.map((candidate) => {
    const haystack = normalize(`${candidate.url} ${candidate.title ?? ""} ${candidate.snippet ?? ""}`);
    const urlHost = safeHost(candidate.url);
    const hostMatch = urlHost ? normalizedName.split(" ").some((part) => part.length > 3 && urlHost.includes(part)) : false;
    const nameMatch = haystack.includes(normalizedName);
    const confidence = Math.min(100, (hostMatch ? 45 : 0) + (nameMatch ? 40 : 0) + 10);

    return {
      ...candidate,
      confidence,
      evidence: [
        hostMatch ? "domain resembles company name" : "",
        nameMatch ? "search result mentions company name" : ""
      ].filter(Boolean)
    };
  });

  const best = scored.sort((a, b) => b.confidence - a.confidence)[0];
  return {
    websiteUrl: best?.confidence && best.confidence >= 45 ? best.url : undefined,
    confidence: best?.confidence ?? 0,
    evidence: best?.evidence ?? []
  };
}

export async function searchOfficialWebsite(
  input: OfficialWebsiteSearchInput,
  options: {
    apiKey?: string;
    fetcher?: typeof fetch;
  }
): Promise<OfficialWebsiteSearchResult> {
  if (!options.apiKey) {
    return {
      status: "PROVIDER_MISSING",
      provider: "serpapi",
      candidatesChecked: 0,
      confidence: 0,
      evidence: ["SEARCH_PROVIDER_API_KEY is not configured"]
    };
  }

  const location = [input.city, input.region, input.country].filter(Boolean).join(", ");
  const query = [`"${input.companyName}"`, input.city, input.region, "official website"].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: options.apiKey,
    output: "json",
    num: "10",
    safe: "active"
  });
  if (location) params.set("location", location);

  const response = await (options.fetcher ?? fetch)(`https://serpapi.com/search.json?${params}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`SerpAPI returned HTTP ${response.status}`);
  const payload = (await response.json()) as SerpApiResponse;
  if (payload.error) throw new Error(`SerpAPI: ${payload.error}`);

  const candidates = filterOfficialWebsiteCandidates(payload.organic_results ?? []);
  const discovery = discoverWebsiteFromCandidates(input.companyName, candidates);
  return {
    ...discovery,
    status: discovery.websiteUrl ? "DISCOVERED" : "NOT_FOUND",
    provider: "serpapi",
    candidatesChecked: candidates.length
  };
}

export function filterOfficialWebsiteCandidates(
  results: Array<{ link?: string; title?: string; snippet?: string }>
) {
  return results
    .filter((result): result is { link: string; title?: string; snippet?: string } => Boolean(result.link))
    .filter((result) => {
      const host = safeHost(result.link);
      return Boolean(host && !excludedWebsiteHosts.some((excluded) => host === excluded || host.endsWith(`.${excluded}`)));
    })
    .map((result) => ({ url: result.link, title: result.title, snippet: result.snippet }));
}

export function extractContactsFromHtml(html: string, pageUrl: string): ContactExtractionResult {
  const $ = cheerio.load(html);
  const text = $.text();
  const emails = unique([
    ...Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0]),
    ...$("a[href^='mailto:']")
      .map((_, element) => $(element).attr("href")?.replace(/^mailto:/i, "").split("?")[0] ?? "")
      .get()
  ]);

  const textPhones = Array.from(
    text.matchAll(/(?:\+?\d{1,3}[\s.-])?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{2,4}(?:[\s.-]\d{2,4}){1,2}/g)
  )
    .map((match) => match[0].trim())
    .filter((value) => isPlausiblePhone(value));
  const linkedPhones = $("a[href^='tel:']")
    .map((_, element) => $(element).attr("href")?.replace(/^tel:/i, "").split("?")[0] ?? "")
    .get()
    .filter((value) => isPlausiblePhone(value, true));
  const phones = unique([...textPhones, ...linkedPhones]);

  const socials = $("a[href^='http']")
    .map((_, element) => $(element).attr("href") ?? "")
    .get()
    .map((url) => ({ platform: detectSocialPlatform(url), url }))
    .filter((social) => social.platform !== "other")
    .filter((social, index, list) => list.findIndex((item) => item.url === social.url) === index);
  const people = extractPeople($, pageUrl);

  return {
    emails: emails.map((value) => ({ value, sourceUrl: pageUrl, confidence: 80 })),
    phones: phones.map((value) => ({ value, sourceUrl: pageUrl, confidence: 70 })),
    people,
    socials
  };
}

export function isPlausiblePhone(value: string, allowPlainDigits = false) {
  const clean = value.trim();
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (/(?:\d{1,3}\.){3}\d{1,3}/.test(clean)) return false;
  if (/-\d\.\d/.test(clean)) return false;
  if (/^1[6-9]\d{11,}$/.test(digits)) return false;
  if (!allowPlainDigits && !/[+\s().-]/.test(clean)) return false;

  const groups = clean.split(/\D+/).filter(Boolean);
  if (!allowPlainDigits && groups.length < 3) return false;
  if (groups.some((group) => group.length > 4)) return false;
  return true;
}

function detectSocialPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter";
  if (lower.includes("facebook.com")) return "facebook";
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("youtube.com")) return "youtube";
  if (lower.includes("github.com")) return "github";
  if (lower.includes("google.com/maps") || lower.includes("g.page")) return "google_business";
  return "other";
}

function extractPeople($: cheerio.CheerioAPI, pageUrl: string) {
  const people: Array<{ value: string; label?: string; sourceUrl: string; confidence: number }> = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      walkJsonLd(JSON.parse(raw), (record) => {
        const type = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        if (!type.some((value) => String(value).toLowerCase() === "person")) return;
        const name = typeof record.name === "string" ? cleanPersonName(record.name) : undefined;
        if (!name) return;
        const role = typeof record.jobTitle === "string" ? record.jobTitle.trim() : undefined;
        people.push({ value: name, label: role, sourceUrl: pageUrl, confidence: role ? 90 : 82 });
      });
    } catch {
      // Invalid third-party JSON-LD is ignored instead of weakening the full extraction.
    }
  });

  $("[itemtype*='Person'], [data-person-name], .team-member, .staff-member, .leadership-member").each((_, element) => {
    const root = $(element);
    const name = cleanPersonName(
      root.attr("data-person-name") ||
      root.find("[itemprop='name'], .name, h2, h3, h4").first().text()
    );
    if (!name) return;
    const role = root.find("[itemprop='jobTitle'], .role, .title, .position").first().text().replace(/\s+/g, " ").trim() || undefined;
    people.push({ value: name, label: role, sourceUrl: pageUrl, confidence: role ? 75 : 60 });
  });

  return people.filter(
    (person, index, list) =>
      list.findIndex((candidate) => candidate.value.toLowerCase() === person.value.toLowerCase()) === index
  );
}

function walkJsonLd(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJsonLd(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walkJsonLd(item, visit));
}

function cleanPersonName(value: string | undefined) {
  const name = value?.replace(/\s+/g, " ").trim();
  if (!name || name.length < 3 || name.length > 80) return undefined;
  if (!/^[\p{L}][\p{L}\s.'-]+$/u.test(name)) return undefined;
  const parts = name.split(/\s+/);
  if (parts.length < 2 || parts.length > 6) return undefined;
  return name;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
