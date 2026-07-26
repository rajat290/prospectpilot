import * as cheerio from "cheerio";
import type { TechnologyDetection, WebsiteAuditResult } from "@prospectpilot/shared";

export function auditWebsite(html: string, url: string, statusCode?: number): WebsiteAuditResult {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();

  return {
    url,
    statusCode,
    title: $("title").first().text().trim() || undefined,
    metaDescription: $("meta[name='description']").attr("content")?.trim(),
    hasHttps: url.startsWith("https://"),
    hasMobileViewport: $("meta[name='viewport']").length > 0,
    hasContactForm: $("form").text().toLowerCase().includes("contact") || $("input[type='email']").length > 0,
    hasLiveChat: /intercom|crisp|tawk|zendesk|livechat|drift|freshchat/.test(lowerHtml),
    hasAnalytics: /gtag|google-analytics|googletagmanager|facebook\.net\/en_us\/fbevents|fbq\(/.test(lowerHtml),
    hasCookieBanner: /cookie consent|cookie banner|accept cookies|cookiebot|onetrust/.test(lowerHtml),
    brokenLinkCount: 0
  };
}

export function detectTechnologiesFromHtml(html: string): TechnologyDetection[] {
  const checks: Array<TechnologyDetection & { pattern: RegExp }> = [
    { name: "WordPress", category: "CMS", confidence: 90, evidence: "wp-content marker", pattern: /wp-content|wp-includes/i },
    { name: "Shopify", category: "Ecommerce", confidence: 90, evidence: "Shopify asset marker", pattern: /cdn\.shopify|Shopify\.theme/i },
    { name: "WooCommerce", category: "Ecommerce", confidence: 85, evidence: "WooCommerce marker", pattern: /woocommerce/i },
    { name: "React", category: "Frontend", confidence: 65, evidence: "React marker", pattern: /react|__REACT_DEVTOOLS_GLOBAL_HOOK__/i },
    { name: "Next.js", category: "Frontend", confidence: 90, evidence: "Next.js data marker", pattern: /__NEXT_DATA__|\/_next\//i },
    { name: "Vue", category: "Frontend", confidence: 70, evidence: "Vue marker", pattern: /vue\.js|__VUE__/i },
    { name: "Angular", category: "Frontend", confidence: 70, evidence: "Angular marker", pattern: /ng-version|angular/i },
    { name: "Laravel", category: "Backend", confidence: 65, evidence: "Laravel marker", pattern: /laravel/i },
    { name: "PHP", category: "Backend", confidence: 50, evidence: "PHP URL/session marker", pattern: /\.php|PHPSESSID/i },
    { name: "Wix", category: "Website Builder", confidence: 90, evidence: "Wix marker", pattern: /wixstatic|wix\.com/i },
    { name: "Webflow", category: "Website Builder", confidence: 90, evidence: "Webflow marker", pattern: /webflow/i },
    { name: "Squarespace", category: "Website Builder", confidence: 90, evidence: "Squarespace marker", pattern: /squarespace/i }
  ];

  return checks
    .filter((check) => check.pattern.test(html))
    .map(({ pattern: _pattern, ...technology }) => technology);
}

