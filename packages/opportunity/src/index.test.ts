import { strict as assert } from "node:assert";
import { generateRuleBasedOpportunities } from "./index.js";

const opportunities = generateRuleBasedOpportunities({
  companyName: "A & D Truck and Auto Parts",
  industry: "Automotive Recycling",
  category: "Automotive Recycler",
  connectorId: "car-part",
  audit: {
    hasHttps: true,
    hasMobileViewport: false,
    hasContactForm: false,
    hasLiveChat: false,
    hasAnalytics: false,
    hasCookieBanner: false
  },
  technologies: [{ name: "WordPress", category: "CMS" }]
});

assert.equal(opportunities[0]?.category, "Lead Capture");
assert.ok(opportunities.some((opportunity) => opportunity.category === "Automotive Operations"));
assert.ok(opportunities.some((opportunity) => opportunity.recommendedService.includes("WordPress")));

console.log("Opportunity rules test passed.");

