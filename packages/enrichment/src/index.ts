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

  return {
    emails: emails.map((value) => ({ value, sourceUrl: pageUrl, confidence: 80 })),
    phones: phones.map((value) => ({ value, sourceUrl: pageUrl, confidence: 70 })),
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
