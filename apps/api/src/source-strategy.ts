import { PrismaClient } from "@prisma/client";
import { extractContactsFromHtml } from "@prospectpilot/enrichment";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "./env.js";

type SourceCost = "FREE" | "FREE_LIMITED" | "PAID" | "MIXED";
type SourceEase = "EASY" | "MEDIUM" | "HARD";
type SourcePriority = "STRIKE_NOW" | "NEXT" | "ENRICHMENT" | "LATER";

type SerpResult = {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
};

type SerpResponse = {
  error?: string;
  organic_results?: SerpResult[];
};

const sourceStrategies = [
  {
    id: "google-manual-business-search",
    name: "Google search + business websites",
    category: "Local business discovery",
    priority: "STRIKE_NOW",
    cost: "FREE",
    ease: "MEDIUM",
    reliabilityScore: 88,
    leadQualityScore: 90,
    dealPotentialScore: 92,
    speedScore: 82,
    bestMarkets: ["United States", "Canada", "United Kingdom", "UAE", "Australia"],
    bestIndustries: ["HVAC", "Roofing", "Dental", "Med spa", "Auto repair", "Legal intake", "Real estate", "Commercial cleaning"],
    bestOffers: ["Quote workflow automation", "Booking workflow", "CRM routing", "Missed-lead follow-up", "Website conversion fix"],
    acquisitionMethod: "Manual/search-assisted discovery, then official website/contact page verification.",
    searchPatterns: [
      '"request a quote" "roofing" "Texas"',
      '"HVAC contractor" "request estimate" "Ontario"',
      '"med spa" "book appointment" "Dubai"',
      '"commercial cleaning" "contact us" "New York"',
      '"auto repair" "schedule service" "Canada"'
    ],
    expectedFields: ["Company", "Website", "Email", "Phone", "City", "Country", "Pain evidence", "Source URL"],
    risk: "Manual work required; search results can include low-fit companies if filters are loose.",
    nextAction: "Build the first 40 verified US/Canada local-service leads from this lane."
  },
  {
    id: "trade-show-exhibitors",
    name: "Trade show exhibitor lists",
    category: "B2B buying/growth signal",
    priority: "STRIKE_NOW",
    cost: "FREE_LIMITED",
    ease: "MEDIUM",
    reliabilityScore: 86,
    leadQualityScore: 91,
    dealPotentialScore: 94,
    speedScore: 78,
    bestMarkets: ["UAE", "Qatar", "Saudi Arabia", "United States", "Germany", "United Kingdom", "France"],
    bestIndustries: ["Hospitality", "Construction", "Manufacturing", "Medical", "Dental", "Food distribution", "Automotive", "Logistics"],
    bestOffers: ["Exhibitor lead capture", "B2B catalog portal", "Distributor CRM", "Quote routing", "Post-event follow-up automation"],
    acquisitionMethod: "Collect exhibitor names from event pages, verify website/contact from official company sites.",
    searchPatterns: [
      'site:10times.com exhibitors "Dubai" "construction"',
      '"exhibitor list" "Qatar" "hospitality"',
      '"exhibitors" "Saudi" "food" "website"',
      '"trade show exhibitors" "Germany" "manufacturing"'
    ],
    expectedFields: ["Company", "Event", "Booth", "Website", "Country", "Industry", "Contact", "Event URL"],
    risk: "Some event sites hide full data or require accounts; verify on official websites before outreach.",
    nextAction: "Build 25 exhibitor leads from UAE/Qatar/US events with strong B2B offer angles."
  },
  {
    id: "industry-associations",
    name: "Industry association directories",
    category: "Verified niche directories",
    priority: "STRIKE_NOW",
    cost: "FREE_LIMITED",
    ease: "MEDIUM",
    reliabilityScore: 85,
    leadQualityScore: 87,
    dealPotentialScore: 88,
    speedScore: 76,
    bestMarkets: ["United States", "Canada", "United Kingdom", "Australia", "Europe"],
    bestIndustries: ["Contractors", "Auto recyclers", "Dental", "Legal", "Property management", "Logistics", "Manufacturing"],
    bestOffers: ["Member portal", "Quote workflow", "Booking/intake", "Internal dashboard", "CRM automation"],
    acquisitionMethod: "Use public member directories; enrich with company websites and contact pages.",
    searchPatterns: [
      '"member directory" "roofing association" "United States"',
      '"auto recyclers association" directory',
      '"property management association" "member directory"',
      '"dental association" "find a clinic"'
    ],
    expectedFields: ["Company", "Member profile", "Website", "Phone", "Address", "Category", "Association URL"],
    risk: "Contact email coverage varies; some directories are phone/address heavy.",
    nextAction: "Use for 20 high-trust prospects when local search needs cross-checking."
  },
  {
    id: "chambers-of-commerce",
    name: "Chamber of commerce directories",
    category: "Local SMB directories",
    priority: "NEXT",
    cost: "FREE",
    ease: "EASY",
    reliabilityScore: 78,
    leadQualityScore: 76,
    dealPotentialScore: 78,
    speedScore: 84,
    bestMarkets: ["United States", "Canada", "United Kingdom", "Australia"],
    bestIndustries: ["Local services", "Professional services", "Retail", "Health", "Construction", "Real estate"],
    bestOffers: ["Website refresh", "Booking/lead intake", "CRM setup", "Follow-up automation"],
    acquisitionMethod: "Search chamber member pages, then verify each lead from official website.",
    searchPatterns: [
      '"chamber of commerce" "member directory" "HVAC"',
      '"business directory" "chamber" "dental" "Canada"',
      '"local chamber" "roofing" "member"'
    ],
    expectedFields: ["Company", "Website", "Phone", "Address", "Category", "Member URL"],
    risk: "High volume but uneven buying intent; qualification is mandatory.",
    nextAction: "Use after Google/trade show sources to fill local-service campaigns."
  },
  {
    id: "yellow-pages",
    name: "Yellow Pages and local business directories",
    category: "Local directory volume",
    priority: "NEXT",
    cost: "FREE",
    ease: "EASY",
    reliabilityScore: 70,
    leadQualityScore: 66,
    dealPotentialScore: 68,
    speedScore: 86,
    bestMarkets: ["United States", "Canada"],
    bestIndustries: ["Home services", "Auto repair", "Dental", "Legal", "Restaurants", "Cleaning"],
    bestOffers: ["Website conversion fix", "Booking workflow", "Lead tracking", "Review follow-up"],
    acquisitionMethod: "Directory search by category/location; enrich through official website.",
    searchPatterns: ["yellow pages HVAC Dallas", "yellow pages dental clinic Toronto", "yellow pages auto repair Phoenix"],
    expectedFields: ["Company", "Phone", "Address", "Website", "Category", "Directory URL"],
    risk: "Many records have weak email coverage; use as discovery only, not final trust source.",
    nextAction: "Use for fallback volume only when official website verification succeeds."
  },
  {
    id: "yelp",
    name: "Yelp public pages / Yelp API",
    category: "Local business reputation signal",
    priority: "NEXT",
    cost: "MIXED",
    ease: "MEDIUM",
    reliabilityScore: 80,
    leadQualityScore: 78,
    dealPotentialScore: 76,
    speedScore: 72,
    bestMarkets: ["United States", "Canada", "United Kingdom"],
    bestIndustries: ["Restaurants", "Med spa", "Dental", "Salons", "Home services", "Auto repair"],
    bestOffers: ["Booking workflow", "Review response automation", "Website conversion", "Missed-call follow-up"],
    acquisitionMethod: "Use official API where allowed, or manual public research; verify website/contact separately.",
    searchPatterns: ["Yelp med spa Austin", "Yelp auto repair Seattle", "Yelp dental clinic Vancouver"],
    expectedFields: ["Company", "Rating", "Reviews", "Phone", "Website", "Location", "Yelp URL"],
    risk: "API trial/subscription terms apply; do not build public production dependency without compliance review.",
    nextAction: "Use as reputation/enrichment signal for 10-15 local-service leads."
  },
  {
    id: "google-places-api",
    name: "Google Places API",
    category: "Programmatic local search",
    priority: "ENRICHMENT",
    cost: "PAID",
    ease: "MEDIUM",
    reliabilityScore: 90,
    leadQualityScore: 84,
    dealPotentialScore: 86,
    speedScore: 90,
    bestMarkets: ["Global"],
    bestIndustries: ["Local services", "Medical", "Hospitality", "Real estate", "Automotive", "Professional services"],
    bestOffers: ["Booking workflow", "Quote workflow", "CRM routing", "Review automation"],
    acquisitionMethod: "Official API by category/location, then place details and website enrichment.",
    searchPatterns: ["Text Search: HVAC contractor in Dallas", "Nearby Search: dentist in Toronto", "Text Search: med spa Dubai"],
    expectedFields: ["Name", "Address", "Phone", "Website", "Rating", "Place ID", "Location"],
    risk: "Requires billing and field-mask cost control; not truly free for scale.",
    nextAction: "Integrate after manual Google search proves segment response."
  },
  {
    id: "apollo",
    name: "Apollo.io",
    category: "B2B contact enrichment",
    priority: "ENRICHMENT",
    cost: "FREE_LIMITED",
    ease: "EASY",
    reliabilityScore: 88,
    leadQualityScore: 92,
    dealPotentialScore: 90,
    speedScore: 88,
    bestMarkets: ["United States", "Canada", "Europe", "Middle East", "Global B2B"],
    bestIndustries: ["B2B services", "SaaS", "Manufacturing", "Agencies", "Logistics", "Professional services"],
    bestOffers: ["Custom software", "CRM automation", "AI workflow", "Integration", "Dashboard"],
    acquisitionMethod: "Use free/trial credits for best-fit accounts; enrich decision makers after source qualification.",
    searchPatterns: ["Company search by industry/country/headcount", "Find operations manager", "Find founder/owner"],
    expectedFields: ["Company", "Domain", "Decision maker", "Email", "Phone", "Role", "LinkedIn"],
    risk: "Free credits are limited; do not waste on weak accounts.",
    nextAction: "Use Apollo only on the top 5-15 highest-fit leads per campaign."
  },
  {
    id: "wappalyzer",
    name: "Wappalyzer",
    category: "Technographic signal",
    priority: "ENRICHMENT",
    cost: "FREE_LIMITED",
    ease: "EASY",
    reliabilityScore: 82,
    leadQualityScore: 84,
    dealPotentialScore: 82,
    speedScore: 82,
    bestMarkets: ["Global"],
    bestIndustries: ["Ecommerce", "SaaS", "Local services with websites", "Agencies", "B2B suppliers"],
    bestOffers: ["Tech cleanup", "Migration", "Conversion optimization", "Automation", "Analytics/CRM integration"],
    acquisitionMethod: "Run limited free lookups on selected websites; paid API/list later if ROI is proven.",
    searchPatterns: ["Lookup selected websites", "Find WordPress/Shopify/old analytics", "Detect missing chat/booking signals"],
    expectedFields: ["Website", "Technologies", "Company/contact data if available", "Country", "Traffic signals"],
    risk: "Bulk lead lists/API require paid plan; free usage is limited.",
    nextAction: "Use to strengthen personalization on shortlisted leads."
  },
  {
    id: "builtwith",
    name: "BuiltWith",
    category: "Technographic/ecommerce leads",
    priority: "ENRICHMENT",
    cost: "MIXED",
    ease: "MEDIUM",
    reliabilityScore: 84,
    leadQualityScore: 86,
    dealPotentialScore: 85,
    speedScore: 78,
    bestMarkets: ["Global"],
    bestIndustries: ["Ecommerce", "SaaS", "B2B", "Retail", "Agencies"],
    bestOffers: ["Shopify optimization", "Migration", "Analytics cleanup", "CRM integration", "Performance fixes"],
    acquisitionMethod: "Use technology lookup and lead lists for high-intent tech signals.",
    searchPatterns: ["Shopify stores in US", "WordPress sites with old stack", "Ecommerce tech adoption signals"],
    expectedFields: ["Website", "Technology stack", "Company", "Industry", "Spend/revenue signals where available"],
    risk: "Best lead-list/API features are paid; use for validated niches.",
    nextAction: "Use after first revenue campaign to find tech-specific offers."
  },
  {
    id: "upwork-job-intent",
    name: "Upwork and freelance job posts",
    category: "Direct buying intent",
    priority: "STRIKE_NOW",
    cost: "FREE",
    ease: "MEDIUM",
    reliabilityScore: 78,
    leadQualityScore: 88,
    dealPotentialScore: 89,
    speedScore: 92,
    bestMarkets: ["United States", "Canada", "United Kingdom", "Australia", "Global"],
    bestIndustries: ["Any business already posting software work"],
    bestOffers: ["Proposal response", "MVP", "Automation", "Website", "Dashboard", "CRM setup"],
    acquisitionMethod: "Monitor public job intent and respond inside platform rules; use ProspectPilot for research and follow-up tracking.",
    searchPatterns: ["web development jobs", "automation jobs", "CRM setup jobs", "dashboard jobs", "AI chatbot jobs"],
    expectedFields: ["Job title", "Budget", "Client country", "Pain", "Timeline", "Platform URL"],
    risk: "Platform rules matter; do not scrape/contact off-platform in a way that violates terms.",
    nextAction: "Use daily for fastest possible first deal signals."
  },
  {
    id: "linkedin-intent-posts",
    name: "LinkedIn intent posts",
    category: "Warm social intent",
    priority: "STRIKE_NOW",
    cost: "FREE_LIMITED",
    ease: "MEDIUM",
    reliabilityScore: 76,
    leadQualityScore: 86,
    dealPotentialScore: 88,
    speedScore: 84,
    bestMarkets: ["Global"],
    bestIndustries: ["Founders", "Agencies", "B2B services", "Startups", "Local businesses"],
    bestOffers: ["Advice-first audit", "MVP", "Workflow automation", "AI integration"],
    acquisitionMethod: "Manually monitor posts asking for developers/tools; draft helpful replies and DMs.",
    searchPatterns: ['"looking for developer"', '"need a website"', '"recommend a CRM"', '"need automation"', '"AI agent"'],
    expectedFields: ["Person", "Company", "Post URL", "Need", "Role", "Profile URL"],
    risk: "Unauthorized automation can cause account restrictions; use assisted/manual workflow.",
    nextAction: "Add as daily intent-monitoring checklist before sending cold emails."
  },
  {
    id: "reddit-founder-communities",
    name: "Reddit/founder communities",
    category: "Pain discovery",
    priority: "NEXT",
    cost: "FREE",
    ease: "MEDIUM",
    reliabilityScore: 64,
    leadQualityScore: 72,
    dealPotentialScore: 70,
    speedScore: 78,
    bestMarkets: ["Global"],
    bestIndustries: ["Founders", "SaaS", "Small business", "Ecommerce"],
    bestOffers: ["Advice-first consultation", "Automation", "MVP", "Workflow teardown"],
    acquisitionMethod: "Monitor pain posts, respond helpfully, save leads only when public/contact-safe.",
    searchPatterns: ["small business software pain", "how do I automate", "CRM recommendations", "website conversion problem"],
    expectedFields: ["Post URL", "Pain", "Industry", "User/contact if appropriate", "Suggested offer"],
    risk: "Lower identity reliability; treat as conversation/intent source, not bulk lead database.",
    nextAction: "Use for offer research and warm conversations, not primary cold email volume."
  },
  {
    id: "clutch-goodfirms",
    name: "Clutch and GoodFirms",
    category: "B2B directory/research",
    priority: "LATER",
    cost: "FREE",
    ease: "EASY",
    reliabilityScore: 78,
    leadQualityScore: 70,
    dealPotentialScore: 64,
    speedScore: 76,
    bestMarkets: ["United States", "Canada", "United Kingdom", "Europe", "India"],
    bestIndustries: ["Software buyers", "Agencies", "Service firms"],
    bestOffers: ["Partnership", "Overflow development", "White-label delivery", "Process automation"],
    acquisitionMethod: "Use listings for competitor/partner research and selected buyer discovery.",
    searchPatterns: ["software companies US", "web development agencies Canada", "digital agencies UAE"],
    expectedFields: ["Company", "Website", "Services", "Reviews", "Location", "Directory profile"],
    risk: "Many records are competitors, not buyers; outreach angle must be partnership/overflow or carefully selected.",
    nextAction: "Do not use as first mass source; use for partner/agency channel later."
  },
  {
    id: "indiamart-tradeindia",
    name: "IndiaMART / TradeIndia",
    category: "India B2B suppliers",
    priority: "LATER",
    cost: "FREE",
    ease: "MEDIUM",
    reliabilityScore: 68,
    leadQualityScore: 64,
    dealPotentialScore: 62,
    speedScore: 82,
    bestMarkets: ["India"],
    bestIndustries: ["Manufacturing", "Exporters", "Wholesalers", "Industrial suppliers", "Distributors"],
    bestOffers: ["Catalog website", "Distributor CRM", "Quote automation", "Inventory dashboard", "WhatsApp inquiry workflow"],
    acquisitionMethod: "Use marketplace listings for discovery, then verify official website and decision-maker route.",
    searchPatterns: ["IndiaMART manufacturer CRM need", "TradeIndia exporter website contact", "industrial supplier catalog"],
    expectedFields: ["Company", "Products", "Phone", "Website", "City", "Marketplace profile"],
    risk: "Huge volume but mixed budgets; foreign-paying markets should stay higher priority.",
    nextAction: "Use for India campaigns only after US/Canada/Middle East engine is working."
  },
  {
    id: "europages-global-b2b",
    name: "Europages and global B2B supplier directories",
    category: "Europe/global suppliers",
    priority: "NEXT",
    cost: "FREE_LIMITED",
    ease: "MEDIUM",
    reliabilityScore: 74,
    leadQualityScore: 76,
    dealPotentialScore: 78,
    speedScore: 72,
    bestMarkets: ["Germany", "France", "Italy", "Spain", "Switzerland", "Baltic nations", "Europe"],
    bestIndustries: ["Manufacturing", "Industrial suppliers", "Exporters", "B2B distributors"],
    bestOffers: ["B2B portal", "Quote workflow", "Distributor CRM", "Catalog automation", "Lead routing"],
    acquisitionMethod: "Directory discovery followed by official website/contact verification.",
    searchPatterns: ["Europages industrial supplier Germany", "European manufacturer quote request", "B2B distributor France contact"],
    expectedFields: ["Company", "Website", "Country", "Products", "Phone", "Email", "Directory URL"],
    risk: "Language differences and email coverage vary; localization may be needed.",
    nextAction: "Use after first US/Canada campaign, especially for high-ticket B2B."
  }
] as const;

export async function registerSourceStrategyRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/source-strategy", async () => {
    const ranked = rankedSources();
    return {
      mission: "Aggressive but disciplined real lead collection for the 10000000 journey.",
      rule: "Never optimize for lead count alone. Optimize for real company, reachable contact, visible pain, deal potential and responsible outreach.",
      immediateMix: [
        { lane: "Google/manual local business search", count: 40 },
        { lane: "Trade show exhibitors", count: 25 },
        { lane: "Industry associations/chambers", count: 20 },
        { lane: "Yelp/Yellow Pages verified businesses", count: 10 },
        { lane: "Apollo-enriched decision-maker leads", count: 5 }
      ],
      sourceCount: ranked.length,
      strikeNow: ranked.filter((source) => source.priority === "STRIKE_NOW"),
      enrichment: ranked.filter((source) => source.priority === "ENRICHMENT"),
      later: ranked.filter((source) => source.priority === "LATER"),
      sources: ranked,
      scoringWeights: {
        reliability: 25,
        leadQuality: 30,
        dealPotential: 30,
        speed: 15
      }
    };
  });

  app.get("/source-strategy/missions", async () => {
    return prisma.sourceCollectionMission.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        tasks: { orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: { candidates: { orderBy: { createdAt: "desc" }, take: 8 } } },
        candidates: { orderBy: { createdAt: "desc" }, take: 30 }
      }
    });
  });

  app.post("/source-strategy/missions/first-100", async (request, reply) => {
    const body = z.object({
      market: z.string().min(1).default("US + Canada local service businesses"),
      offer: z.string().min(1).default("Quote, booking, CRM routing and follow-up workflow automation")
    }).parse(request.body ?? {});
    const existing = await prisma.sourceCollectionMission.findFirst({
      where: { status: "ACTIVE", name: "First 100 Real Revenue Leads" },
      include: { tasks: true, candidates: { orderBy: { createdAt: "desc" }, take: 30 } }
    });
    if (existing) return reply.code(200).send({ ...existing, reused: true });
    const mix = [
      { id: "google-manual-business-search", count: 40 },
      { id: "trade-show-exhibitors", count: 25 },
      { id: "industry-associations", count: 12 },
      { id: "chambers-of-commerce", count: 8 },
      { id: "yelp", count: 5 },
      { id: "yellow-pages", count: 5 },
      { id: "apollo", count: 5 }
    ];
    const strategies = rankedSources();
    const mission = await prisma.sourceCollectionMission.create({
      data: {
        name: "First 100 Real Revenue Leads",
        targetCount: 100,
        market: body.market,
        offer: body.offer,
        notes: "Created from Source Strategy engine. This mission converts the source map into lane-wise collection tasks.",
        tasks: {
          create: mix.map((item) => {
            const strategy = strategies.find((source) => source.id === item.id);
            if (!strategy) throw new Error(`Missing strategy ${item.id}`);
            return {
              sourceStrategyId: strategy.id,
              lane: strategy.name,
              priority: strategy.priority,
              targetCount: item.count,
              searchPatterns: [...strategy.searchPatterns],
              instructions: [
                strategy.acquisitionMethod,
                `Best markets: ${strategy.bestMarkets.join(", ")}`,
                `Best industries: ${strategy.bestIndustries.join(", ")}`,
                `Best offers: ${strategy.bestOffers.join(", ")}`,
                `Required fields: ${strategy.expectedFields.join(", ")}`,
                `Risk: ${strategy.risk}`
              ].join("\n"),
              nextAction: strategy.nextAction
            };
          })
        }
      },
      include: { tasks: true, candidates: true }
    });
    return reply.code(201).send(mission);
  });

  app.patch("/source-strategy/tasks/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]) }).parse(request.body);
    return prisma.sourceCollectionTask.update({ where: { id }, data: { status: body.status } });
  });

  app.post("/source-strategy/tasks/:id/discover", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      query: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(10).default(5)
    }).parse(request.body ?? {});
    const task = await prisma.sourceCollectionTask.findUnique({ where: { id }, include: { mission: true } });
    if (!task) return reply.code(404).send({ message: "Collection task not found." });
    if (!env.searchProviderApiKey) {
      return reply.code(409).send({
        message: "Search discovery needs SEARCH_PROVIDER_API_KEY in .env. Without it, this lane stays assisted/manual."
      });
    }
    const query = body.query || task.searchPatterns[0];
    if (!query) return reply.code(409).send({ message: "This lane has no search pattern to run." });
    const results = await searchLeadCandidates(query, body.limit);
    const created = [];
    const skipped = [];
    for (const result of results) {
      if (!result.link) continue;
      const websiteUrl = safeOrigin(result.link);
      const existing = await prisma.sourceCandidateLead.findFirst({
        where: {
          missionId: task.missionId,
          OR: [
            websiteUrl ? { websiteUrl } : undefined,
            { sourceUrl: result.link }
          ].filter(Boolean) as any
        },
        select: { id: true, companyName: true }
      });
      if (existing) {
        skipped.push({ reason: "duplicate", title: result.title, url: result.link });
        continue;
      }
      const contact = await tryExtractPublicContact(result.link);
      const companyName = cleanCompanyTitle(result.title, result.link);
      const payload = {
        missionId: task.missionId,
        taskId: task.id,
        companyName,
        websiteUrl,
        email: contact.email,
        phone: contact.phone,
        country: inferCountryFromQuery(query, task.mission.market),
        industry: inferIndustryFromQuery(query),
        sourceUrl: result.link,
        painEvidence: result.snippet || `Discovered from search query: ${query}`,
        recommendedOffer: task.mission.offer,
        notes: `Search result title: ${result.title || "Untitled"}`,
        qualityScore: scoreCandidate({
          websiteUrl: websiteUrl ?? undefined,
          email: contact.email,
          phone: contact.phone,
          sourceUrl: result.link,
          painEvidence: result.snippet,
          recommendedOffer: task.mission.offer ?? undefined,
          country: inferCountryFromQuery(query, task.mission.market),
          industry: inferIndustryFromQuery(query)
        })
      };
      const candidate = await prisma.sourceCandidateLead.create({
        data: {
          ...payload,
          status: payload.qualityScore >= 72 ? "QUALIFIED" : "NEEDS_RESEARCH"
        }
      });
      created.push(candidate);
    }
    await refreshMissionProgress(prisma, task.missionId, task.id);
    await prisma.sourceCollectionTask.update({
      where: { id: task.id },
      data: { status: created.length ? "IN_PROGRESS" : task.status }
    });
    return {
      query,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped
    };
  });

  app.post("/source-strategy/tasks/:id/candidates", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const task = await prisma.sourceCollectionTask.findUnique({ where: { id }, include: { mission: true } });
    if (!task) return reply.code(404).send({ message: "Collection task not found." });
    const body = z.object({
      companyName: z.string().min(1),
      websiteUrl: z.string().url().optional().or(z.literal("")),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().optional(),
      country: z.string().optional(),
      industry: z.string().optional(),
      sourceUrl: z.string().url().optional().or(z.literal("")),
      painEvidence: z.string().optional(),
      recommendedOffer: z.string().optional(),
      notes: z.string().optional()
    }).parse(request.body);
    const qualityScore = scoreCandidate(body);
    const candidate = await prisma.sourceCandidateLead.create({
      data: {
        missionId: task.missionId,
        taskId: task.id,
        companyName: body.companyName,
        websiteUrl: emptyToNull(body.websiteUrl),
        email: emptyToNull(body.email),
        phone: emptyToNull(body.phone),
        country: emptyToNull(body.country),
        industry: emptyToNull(body.industry),
        sourceUrl: emptyToNull(body.sourceUrl),
        painEvidence: emptyToNull(body.painEvidence),
        recommendedOffer: emptyToNull(body.recommendedOffer) ?? task.mission.offer,
        notes: emptyToNull(body.notes),
        qualityScore,
        status: qualityScore >= 72 ? "QUALIFIED" : "NEEDS_RESEARCH"
      }
    });
    await refreshMissionProgress(prisma, task.missionId, task.id);
    return reply.code(201).send(candidate);
  });

  app.post("/source-strategy/candidates/:id/promote", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const candidate = await prisma.sourceCandidateLead.findUnique({ where: { id }, include: { mission: true, task: true } });
    if (!candidate) return reply.code(404).send({ message: "Candidate lead not found." });
    if (candidate.companyId) return reply.code(200).send({ companyId: candidate.companyId, reused: true });
    const normalizedName = normalizeName(candidate.companyName);
    const existing = await prisma.company.findFirst({
      where: {
        OR: [
          { normalizedName },
          candidate.websiteUrl ? { websiteUrl: candidate.websiteUrl } : undefined,
          candidate.email ? { contacts: { some: { type: "EMAIL", value: { equals: candidate.email, mode: "insensitive" } } } } : undefined
        ].filter(Boolean) as any
      },
      select: { id: true }
    });
    const company = existing
      ? await prisma.company.update({
          where: { id: existing.id },
          data: {
            websiteUrl: candidate.websiteUrl ?? undefined,
            email: candidate.email ?? undefined,
            phone: candidate.phone ?? undefined,
            country: candidate.country ?? undefined,
            industry: candidate.industry ?? undefined,
            dataOrigin: "REAL",
            realRevenueEligible: candidate.qualityScore >= 72
          }
        })
      : await prisma.company.create({
          data: {
            name: candidate.companyName,
            normalizedName,
            websiteUrl: candidate.websiteUrl,
            email: candidate.email,
            phone: candidate.phone,
            country: candidate.country,
            industry: candidate.industry,
            sourceUrl: candidate.sourceUrl,
            dataOrigin: "REAL",
            realRevenueEligible: candidate.qualityScore >= 72,
            trustStatus: "PROBABLE",
            status: "QUALIFIED",
            crmItem: { create: { status: candidate.qualityScore >= 72 ? "OUTREACH_READY" : "RESEARCH", tags: ["source-strategy-engine"] } }
          }
        });
    const contactWrites = [];
    if (candidate.email) {
      contactWrites.push(prisma.contact.upsert({
        where: { companyId_type_value: { companyId: company.id, type: "EMAIL", value: candidate.email } },
        create: { companyId: company.id, type: "EMAIL", value: candidate.email, normalizedValue: candidate.email.toLowerCase(), confidence: candidate.qualityScore, trustStatus: "PROBABLE", isPrimary: true },
        update: { confidence: Math.max(candidate.qualityScore, 60), doNotContact: false }
      }));
    }
    if (candidate.phone) {
      contactWrites.push(prisma.contact.upsert({
        where: { companyId_type_value: { companyId: company.id, type: "PHONE", value: candidate.phone } },
        create: { companyId: company.id, type: "PHONE", value: candidate.phone, confidence: 65, trustStatus: "PROBABLE" },
        update: { confidence: 65 }
      }));
    }
    if (candidate.painEvidence || candidate.recommendedOffer) {
      contactWrites.push(prisma.opportunity.create({
        data: {
          companyId: company.id,
          category: "REAL_REVENUE_CAMPAIGN",
          title: candidate.recommendedOffer || candidate.mission.offer || "Workflow improvement opportunity",
          reasoning: candidate.painEvidence || candidate.notes || "Captured through Source Strategy collection mission.",
          recommendedService: candidate.recommendedOffer || candidate.mission.offer || "Workflow automation",
          confidence: candidate.qualityScore
        }
      }));
    }
    await Promise.all(contactWrites);
    await prisma.sourceCandidateLead.update({ where: { id }, data: { companyId: company.id, status: "PROMOTED", promotedAt: new Date() } });
    await refreshMissionProgress(prisma, candidate.missionId, candidate.taskId ?? undefined);
    return reply.code(existing ? 200 : 201).send({ companyId: company.id, reused: Boolean(existing) });
  });
}

async function searchLeadCandidates(query: string, limit: number) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: env.searchProviderApiKey,
    output: "json",
    num: String(Math.max(10, limit)),
    safe: "active"
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
  const payload = (await response.json()) as SerpResponse;
  if (payload.error) throw new Error(`Search provider: ${payload.error}`);
  return (payload.organic_results ?? [])
    .filter((result) => Boolean(result.link))
    .filter((result) => !isBlockedDiscoveryHost(result.link!))
    .slice(0, limit);
}

async function tryExtractPublicContact(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "ProspectPilot/0.1 lead-research; respectful contact discovery" },
      signal: AbortSignal.timeout(12_000)
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return {};
    const html = await response.text();
    const contacts = extractContactsFromHtml(html.slice(0, 750_000), url);
    return {
      email: contacts.emails[0]?.value,
      phone: contacts.phones[0]?.value
    };
  } catch {
    return {};
  }
}

function cleanCompanyTitle(title: string | undefined, url: string) {
  const fallback = safeHost(url)?.split(".")[0] || "Discovered company";
  const clean = (title || fallback)
    .replace(/\s*[-|–—]\s*(Home|Official Site|Yelp|Yellow Pages|LinkedIn|Facebook|10times).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 120) || fallback;
}

function inferCountryFromQuery(query: string, missionMarket?: string | null) {
  const haystack = `${query} ${missionMarket || ""}`.toLowerCase();
  if (/\bcanada|ontario|toronto|vancouver\b/.test(haystack)) return "Canada";
  if (/\bdubai|uae|abu dhabi\b/.test(haystack)) return "UAE";
  if (/\bqatar|doha\b/.test(haystack)) return "Qatar";
  if (/\bsaudi|riyadh|jeddah\b/.test(haystack)) return "Saudi Arabia";
  if (/\buk|united kingdom|london|britain\b/.test(haystack)) return "United Kingdom";
  if (/\bgermany|france|italy|spain|switzerland\b/.test(haystack)) return "Europe";
  return "United States";
}

function inferIndustryFromQuery(query: string) {
  const lower = query.toLowerCase();
  const industries = ["hvac", "roofing", "dental", "med spa", "auto repair", "legal", "real estate", "construction", "manufacturing", "logistics", "commercial cleaning"];
  return industries.find((industry) => lower.includes(industry)) || "Local Services";
}

function isBlockedDiscoveryHost(url: string) {
  const host = safeHost(url);
  if (!host) return true;
  const blocked = ["facebook.com", "instagram.com", "youtube.com", "pinterest.com", "wikipedia.org", "reddit.com"];
  return blocked.some((item) => host === item || host.endsWith(`.${item}`));
}

function safeOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function rankedSources() {
  return [...sourceStrategies]
    .map((source) => ({
      ...source,
      totalScore: Math.round(
        source.reliabilityScore * 0.25 +
        source.leadQualityScore * 0.3 +
        source.dealPotentialScore * 0.3 +
        source.speedScore * 0.15
      )
    }))
    .sort((left, right) => right.totalScore - left.totalScore);
}

async function refreshMissionProgress(prisma: PrismaClient, missionId: string, taskId?: string) {
  const [missionCounts, promotedCount] = await Promise.all([
    prisma.sourceCandidateLead.count({ where: { missionId } }),
    prisma.sourceCandidateLead.count({ where: { missionId, status: "PROMOTED" } })
  ]);
  const writes = [
    prisma.sourceCollectionMission.update({ where: { id: missionId }, data: { collectedCount: missionCounts, promotedCount } })
  ];
  if (taskId) {
    writes.push(prisma.sourceCollectionTask.update({
      where: { id: taskId },
      data: {
        collectedCount: await prisma.sourceCandidateLead.count({ where: { taskId } }),
        promotedCount: await prisma.sourceCandidateLead.count({ where: { taskId, status: "PROMOTED" } })
      }
    }) as any);
  }
  await Promise.all(writes);
}

function scoreCandidate(input: { websiteUrl?: string; email?: string; phone?: string; sourceUrl?: string; painEvidence?: string; recommendedOffer?: string; country?: string; industry?: string }) {
  let score = 25;
  if (input.websiteUrl) score += 18;
  if (input.email) score += 22;
  if (input.phone) score += 10;
  if (input.sourceUrl) score += 8;
  if (input.painEvidence) score += 12;
  if (input.recommendedOffer) score += 7;
  if (input.country) score += 4;
  if (input.industry) score += 4;
  return Math.min(100, score);
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
