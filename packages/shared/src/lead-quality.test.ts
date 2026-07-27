import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyIdentity,
  calculateLeadQuality,
  detectLeadQualityIssues,
  normalizeContactValue
} from "./index.js";

test("uses the normalized official domain as the strongest identity", () => {
  assert.equal(
    buildCompanyIdentity({ name: "Example Company LLC", websiteUrl: "https://www.example.com/contact" }),
    "domain:example.com"
  );
});

test("normalizes contact values for matching", () => {
  assert.equal(normalizeContactValue("EMAIL", " Sales@Example.COM "), "sales@example.com");
  assert.equal(normalizeContactValue("PHONE", "+1 (212) 555-0100"), "2125550100");
});

test("scores a cross-checked audited lead as verified", () => {
  const quality = calculateLeadQuality({
    name: "Example",
    websiteUrl: "https://example.com",
    city: "New York",
    industry: "Automotive",
    extractionScore: 95,
    websiteConfidence: 95,
    contactConfidences: [90],
    socialCount: 2,
    sourceCount: 2,
    hasSuccessfulAudit: true,
    hasOpportunity: true
  });
  assert.equal(quality.completeness, 100);
  assert.equal(quality.trustStatus, "VERIFIED");
});

test("raises explicit issues instead of silently trusting incomplete data", () => {
  const issues = detectLeadQualityIssues({ name: "Unclear listing", extractionScore: 35 });
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["WEBSITE_MISSING", "CONTACT_MISSING", "LOCATION_MISSING", "LOW_EXTRACTION_CONFIDENCE"]
  );
});
