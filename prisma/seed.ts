import { PrismaClient } from "@prisma/client";
import { createOutreachDrafts } from "@prospectpilot/outreach";

const prisma = new PrismaClient();

const demoLeads = [
  { name: "Northstar Auto Recyclers", city: "Toronto", region: "ON", website: "https://northstar-auto.example", email: "sales@northstar-auto.example", phone: "+1 416 555 0131", tech: ["WordPress", "PHP"], score: 90, band: "HOT", stage: "OUTREACH_READY", issue: "Inventory inquiries are not routed into a structured follow-up workflow", service: "Inventory inquiry portal and CRM follow-up automation", category: "Automotive Operations" },
  { name: "Metro Dental Studio", city: "Pune", region: "MH", website: "https://metro-dental.example", email: "hello@metro-dental.example", phone: "+91 98765 44021", tech: ["WordPress"], score: 85, band: "HOT", stage: "CONTACTED", issue: "The website has no visible appointment booking flow", service: "Appointment booking funnel with WhatsApp confirmations", category: "Lead Generation" },
  { name: "Apex Industrial Components", city: "Ahmedabad", region: "GJ", website: "https://apex-components.example", email: "inquiry@apex-components.example", phone: "+91 98250 11800", tech: ["PHP"], score: 80, band: "HOT", stage: "REPLIED", issue: "Quote requests depend on unstructured email and manual qualification", service: "B2B quote request portal and sales dashboard", category: "Custom Software" },
  { name: "Clearview Property Advisors", city: "Gurugram", region: "HR", website: "https://clearview-property.example", email: "connect@clearview-property.example", phone: "+91 98110 30041", tech: ["React"], score: 75, band: "QUALIFIED", stage: "MEETING", issue: "Lead response and property matching appear manually coordinated", service: "Property lead CRM and automated matching workflow", category: "Automation" },
  { name: "BrightPath Coaching Centre", city: "Jaipur", region: "RJ", website: "https://brightpath-coaching.example", email: "admissions@brightpath-coaching.example", phone: "+91 97820 54100", tech: ["Wix"], score: 70, band: "QUALIFIED", stage: "PROPOSAL", issue: "Course inquiries do not have a clear conversion or follow-up path", service: "Admissions funnel and counselor CRM", category: "Lead Generation" },
  { name: "Lakefront Legal Partners", city: "Chicago", region: "IL", website: "https://lakefront-legal.example", email: "intake@lakefront-legal.example", phone: "+1 312 555 0148", tech: ["Squarespace"], score: 70, band: "QUALIFIED", stage: "RESEARCH", issue: "The intake experience does not qualify cases before staff review", service: "Secure client intake and consultation booking system", category: "Custom Software" },
  { name: "Nova Packaging Works", city: "Surat", region: "GJ", website: "https://nova-packaging.example", email: "sales@nova-packaging.example", phone: "+91 99090 22018", tech: ["WordPress", "WooCommerce"], score: 65, band: "QUALIFIED", stage: "OUTREACH_READY", issue: "Product discovery and bulk quote requests are difficult for buyers", service: "B2B catalog and bulk quotation workflow", category: "Ecommerce" },
  { name: "Evergreen Wellness Clinic", city: "Bengaluru", region: "KA", website: "https://evergreen-wellness.example", email: "care@evergreen-wellness.example", phone: "+91 98450 11822", tech: ["Webflow"], score: 65, band: "QUALIFIED", stage: "CONTACTED", issue: "No instant response path is visible outside clinic hours", service: "AI FAQ assistant and appointment automation", category: "Automation" },
  { name: "Summit Fleet Services", city: "Dallas", region: "TX", website: "https://summit-fleet.example", email: "service@summit-fleet.example", phone: "+1 214 555 0197", tech: ["PHP"], score: 60, band: "QUALIFIED", stage: "RESEARCH", issue: "Service requests and maintenance updates rely on phone coordination", service: "Fleet service request and customer status portal", category: "Custom Software" },
  { name: "Craftline Home Interiors", city: "Mumbai", region: "MH", website: "https://craftline-interiors.example", email: "studio@craftline-interiors.example", phone: "+91 98201 44320", tech: ["Instagram"], score: 55, band: "REVIEW", stage: "RESEARCH", issue: "Project inquiries lack budget and timeline qualification", service: "Portfolio website and qualified consultation funnel", category: "Website Modernization" },
  { name: "Riverbend Auto Parts", city: "Austin", region: "TX", website: null, email: null, phone: "+1 512 555 0164", tech: [], score: 45, band: "REVIEW", stage: "RESEARCH", issue: "A verified website and digital inquiry path could not be found", service: "Business website and inventory inquiry setup", category: "Website Modernization" },
  { name: "Orchid Wholesale Traders", city: "Indore", region: "MP", website: null, email: null, phone: null, tech: [], score: 30, band: "LOW", stage: "RESEARCH", issue: "The listing has limited contact and online presence signals", service: "Digital presence and lead capture starter package", category: "Growth" }
] as const;

async function main() {
  const source = await prisma.leadSource.upsert({
    where: { url: "https://demo.prospectpilot.local/directory" },
    create: {
      name: "ProspectPilot Demo Directory",
      url: "https://demo.prospectpilot.local/directory",
      status: "COMPLETE",
      recordCount: demoLeads.length,
      lastRunAt: new Date(),
      automationEnabled: true,
      nextRunAt: tomorrowAt(8)
    },
    update: {
      status: "COMPLETE",
      recordCount: demoLeads.length,
      lastRunAt: new Date(),
      automationEnabled: true,
      nextRunAt: tomorrowAt(8),
      errorMessage: null
    }
  });

  for (const [index, lead] of demoLeads.entries()) {
    const normalizedName = lead.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const company = await prisma.company.upsert({
      where: { leadSourceId_normalizedName: { leadSourceId: source.id, normalizedName } },
      create: {
        leadSourceId: source.id,
        name: lead.name,
        normalizedName,
        websiteUrl: lead.website,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        region: lead.region,
        country: lead.region.length === 2 && ["ON", "IL", "TX"].includes(lead.region) ? "USA/Canada" : "India",
        industry: index % 3 === 0 ? "Professional Services" : index % 3 === 1 ? "Local Services" : "B2B",
        category: lead.category,
        connectorId: index < 2 ? "car-part" : index < 6 ? "clutch" : "generic",
        sourceUrl: "https://demo.prospectpilot.local/directory",
        description: `${lead.name} is a demo prospect representing a realistic freelance sales opportunity.`,
        extractionScore: 88 - index,
        status: lead.score >= 60 ? "QUALIFIED" : "AUDITED"
      },
      update: {
        websiteUrl: lead.website,
        email: lead.email,
        phone: lead.phone,
        status: lead.score >= 60 ? "QUALIFIED" : "AUDITED"
      }
    });

    if (lead.website) {
      await prisma.website.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, url: lead.website, finalUrl: lead.website, title: lead.name, discoveryScore: 91, isVerified: true },
        update: { url: lead.website, finalUrl: lead.website, title: lead.name, discoveryScore: 91, isVerified: true }
      });
      await prisma.websiteAudit.deleteMany({ where: { companyId: company.id } });
      await prisma.websiteAudit.create({
        data: {
          companyId: company.id,
          url: lead.website,
          statusCode: 200,
          hasHttps: true,
          hasMobileViewport: index % 5 !== 0,
          hasContactForm: index % 3 !== 0,
          hasLiveChat: index % 4 === 0,
          hasAnalytics: index % 2 === 0,
          hasCookieBanner: index % 3 === 0,
          brokenLinkCount: index % 4,
          loadStatus: "COMPLETE",
          summary: "Demo audit completed"
        }
      });
    }

    if (lead.email) await upsertContact(company.id, "EMAIL", lead.email, 92);
    if (lead.phone) await upsertContact(company.id, "PHONE", lead.phone, 88);
    for (const technology of lead.tech) {
      await prisma.technology.upsert({
        where: { companyId_name: { companyId: company.id, name: technology } },
        create: { companyId: company.id, name: technology, category: "Web technology", confidence: 85, evidence: "Demo website signal" },
        update: { confidence: 85, evidence: "Demo website signal" }
      });
    }

    await prisma.opportunity.deleteMany({ where: { companyId: company.id } });
    const opportunity = await prisma.opportunity.create({
      data: {
        companyId: company.id,
        category: lead.category,
        title: lead.issue,
        reasoning: `${lead.name} shows a measurable digital workflow gap: ${lead.issue.toLowerCase()}.`,
        recommendedService: lead.service,
        confidence: Math.min(94, lead.score + 10)
      }
    });
    await prisma.leadScore.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, score: lead.score, band: lead.band, breakdown: scoreBreakdown(lead.score) },
      update: { score: lead.score, band: lead.band, breakdown: scoreBreakdown(lead.score) }
    });
    await prisma.crmItem.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, status: lead.stage, priority: lead.band, tags: [lead.category] },
      update: { status: lead.stage, priority: lead.band, tags: [lead.category] }
    });

    const drafts = createOutreachDrafts({
      companyName: lead.name,
      city: lead.city,
      opportunityTitle: opportunity.title,
      recommendedService: opportunity.recommendedService,
      reasoning: opportunity.reasoning,
      senderName: "Rajat Tomar"
    });
    for (const draft of drafts) {
      await prisma.outreachDraft.upsert({
        where: { companyId_channel: { companyId: company.id, channel: draft.channel } },
        create: { companyId: company.id, ...draft },
        update: { subject: draft.subject, body: draft.body, personalization: draft.personalization }
      });
    }
    if ((await prisma.activity.count({ where: { companyId: company.id } })) === 0) {
      await prisma.activity.createMany({
        data: [
          { companyId: company.id, type: "EXTRACTED", summary: "Company extracted from demo directory" },
          { companyId: company.id, type: "ENRICHMENT_COMPLETE", summary: `Intelligence completed with a ${lead.score}/100 lead score` }
        ]
      });
    }
  }

  if ((await prisma.job.count()) === 0) {
    await prisma.job.createMany({
      data: [
        { leadSourceId: source.id, type: "CRAWL_SOURCE", status: "COMPLETE", payload: { demo: true }, result: { companies: demoLeads.length }, attempts: 1, startedAt: minutesAgo(12), completedAt: minutesAgo(10) },
        { leadSourceId: source.id, type: "EXTRACT_CONTACTS", status: "COMPLETE", payload: { demo: true }, result: { enriched: 10 }, attempts: 1, startedAt: minutesAgo(9), completedAt: minutesAgo(5) }
      ]
    });
  }

  const reportDate = new Date();
  reportDate.setHours(0, 0, 0, 0);
  await prisma.dailyReport.upsert({
    where: { reportDate },
    create: { reportDate, leadsFound: demoLeads.length, qualifiedLeads: 9, hotLeads: 3, emailsFound: 10, phonesFound: 11, failedJobs: 0, topOpportunity: "Custom Software", bestLeadName: demoLeads[0].name, bestLeadScore: demoLeads[0].score },
    update: { leadsFound: demoLeads.length, qualifiedLeads: 9, hotLeads: 3, emailsFound: 10, phonesFound: 11, failedJobs: 0, topOpportunity: "Custom Software", bestLeadName: demoLeads[0].name, bestLeadScore: demoLeads[0].score }
  });
}

async function upsertContact(companyId: string, type: "EMAIL" | "PHONE", value: string, confidence: number) {
  await prisma.contact.upsert({
    where: { companyId_type_value: { companyId, type, value } },
    create: { companyId, type, value, confidence, sourceUrl: "https://demo.prospectpilot.local/directory" },
    update: { confidence }
  });
}

function scoreBreakdown(score: number) {
  return { website: Math.min(10, score), contact: score >= 45 ? 15 : 0, industry: 10, websiteIssues: score >= 40 ? 15 : 0, opportunity: 20, highValueIndustry: score >= 65 ? 10 : 0, decisionMaker: score >= 85 ? 10 : 0, digitalMaturityGap: 10 };
}
function tomorrowAt(hour: number) {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(hour, 0, 0, 0);
  return value;
}
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

main()
  .then(() => console.log(`Seeded ${demoLeads.length} demo leads for ProspectPilot AI.`))
  .finally(() => prisma.$disconnect());
