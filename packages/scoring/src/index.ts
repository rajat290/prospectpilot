export type ScoreInput = {
  hasWebsite: boolean;
  hasContact: boolean;
  hasIndustry: boolean;
  hasWebsiteIssues: boolean;
  hasOpportunity: boolean;
  isHighValueIndustry: boolean;
  hasDecisionMakerSignal: boolean;
  hasDigitalMaturityGap: boolean;
};

export type ScoreResult = {
  score: number;
  band: "HOT" | "QUALIFIED" | "REVIEW" | "LOW";
  breakdown: Record<string, number>;
};

export function scoreLead(input: ScoreInput): ScoreResult {
  const breakdown = {
    website: input.hasWebsite ? 10 : 0,
    contact: input.hasContact ? 15 : 0,
    industry: input.hasIndustry ? 10 : 0,
    websiteIssues: input.hasWebsiteIssues ? 15 : 0,
    opportunity: input.hasOpportunity ? 20 : 0,
    highValueIndustry: input.isHighValueIndustry ? 10 : 0,
    decisionMaker: input.hasDecisionMakerSignal ? 10 : 0,
    digitalMaturityGap: input.hasDigitalMaturityGap ? 10 : 0
  };

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return {
    score,
    band: score >= 80 ? "HOT" : score >= 60 ? "QUALIFIED" : score >= 40 ? "REVIEW" : "LOW",
    breakdown
  };
}

