export type OpportunityInput = {
  companyName: string;
  industry?: string | null;
  category?: string | null;
  connectorId?: string | null;
  audit: {
    hasHttps: boolean;
    hasMobileViewport: boolean;
    hasContactForm: boolean;
    hasLiveChat: boolean;
    hasAnalytics: boolean;
    hasCookieBanner: boolean;
  };
  technologies: Array<{ name: string; category?: string | null }>;
};

export type GeneratedOpportunity = {
  category: string;
  title: string;
  reasoning: string;
  recommendedService: string;
  confidence: number;
};

type Rule = {
  category: string;
  title: string;
  recommendedService: string;
  confidence: number;
  when: (input: OpportunityInput) => boolean;
  reasoning: (input: OpportunityInput) => string;
};

const rules: Rule[] = [
  {
    category: "Lead Capture",
    title: "Missing contact form or lead capture path",
    recommendedService: "Lead capture funnel with contact form, tracking, and CRM handoff",
    confidence: 88,
    when: (input) => !input.audit.hasContactForm,
    reasoning: (input) =>
      `${input.companyName} does not show a strong contact form signal, so visitors may leave without becoming trackable inquiries.`
  },
  {
    category: "Analytics",
    title: "No analytics or conversion tracking detected",
    recommendedService: "Google Analytics, conversion tracking, and lead source dashboard setup",
    confidence: 82,
    when: (input) => !input.audit.hasAnalytics,
    reasoning: (input) =>
      `${input.companyName} does not expose common analytics tags, making it harder to know which pages and sources generate leads.`
  },
  {
    category: "Trust",
    title: "Website security and trust improvement",
    recommendedService: "HTTPS/security cleanup and trust signal optimization",
    confidence: 78,
    when: (input) => !input.audit.hasHttps,
    reasoning: (input) =>
      `${input.companyName}'s website URL did not pass the HTTPS signal, which can reduce buyer trust and hurt form conversion.`
  },
  {
    category: "Mobile Experience",
    title: "Mobile experience modernization",
    recommendedService: "Responsive website modernization for mobile-first buyers",
    confidence: 80,
    when: (input) => !input.audit.hasMobileViewport,
    reasoning: (input) =>
      `${input.companyName} does not expose a mobile viewport signal, so mobile visitors may get a poor browsing experience.`
  },
  {
    category: "Automation",
    title: "No live chat or instant response path detected",
    recommendedService: "AI chat assistant or WhatsApp inquiry automation",
    confidence: 76,
    when: (input) => !input.audit.hasLiveChat,
    reasoning: (input) =>
      `${input.companyName} does not show a live chat signal, so urgent buyers may not get fast answers outside business hours.`
  },
  {
    category: "Website Modernization",
    title: "WordPress modernization and maintenance opportunity",
    recommendedService: "WordPress speed, security, SEO, and maintenance care plan",
    confidence: 84,
    when: (input) => hasTechnology(input, "WordPress"),
    reasoning: (input) =>
      `${input.companyName} appears to use WordPress, which creates a clear opening for speed, security, plugin cleanup, and ongoing care.`
  },
  {
    category: "Website Modernization",
    title: "Legacy PHP modernization opportunity",
    recommendedService: "PHP website modernization or rebuild into a faster managed stack",
    confidence: 78,
    when: (input) => hasTechnology(input, "PHP"),
    reasoning: (input) =>
      `${input.companyName} has PHP signals, which may indicate a legacy site that could benefit from modernization and maintainability improvements.`
  },
  {
    category: "Automotive Operations",
    title: "Auto recycler inquiry and inventory workflow improvement",
    recommendedService: "Inventory inquiry workflow, quote request form, and CRM follow-up system",
    confidence: 86,
    when: (input) => input.connectorId === "car-part" || textIncludes(input, "automotive recycler"),
    reasoning: (input) =>
      `${input.companyName} is an automotive recycling business, where faster quote handling and structured inventory inquiries can directly improve sales operations.`
  }
];

export function generateRuleBasedOpportunities(input: OpportunityInput): GeneratedOpportunity[] {
  const opportunities = rules
    .filter((rule) => rule.when(input))
    .map((rule) => ({
      category: rule.category,
      title: rule.title,
      reasoning: rule.reasoning(input),
      recommendedService: rule.recommendedService,
      confidence: rule.confidence
    }))
    .sort((a, b) => b.confidence - a.confidence);

  if (opportunities.length > 0) return opportunities.slice(0, 5);

  return [
    {
      category: "Growth",
      title: "Digital growth audit opportunity",
      reasoning: `${input.companyName} has enough online presence to justify a deeper conversion, SEO, and automation review.`,
      recommendedService: "Website growth audit and conversion improvement plan",
      confidence: 60
    }
  ];
}

function hasTechnology(input: OpportunityInput, name: string) {
  return input.technologies.some((technology) => technology.name.toLowerCase() === name.toLowerCase());
}

function textIncludes(input: OpportunityInput, value: string) {
  return `${input.industry ?? ""} ${input.category ?? ""}`.toLowerCase().includes(value.toLowerCase());
}

