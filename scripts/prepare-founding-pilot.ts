import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const campaignName = "Car-Part Founding Pilot 01";
const evidenceMarker = "[FOUNDING_PILOT_REVIEW_2026-08-05]";

const candidates = [
  {
    companyId: "cms0wv0hx00apywneozav4p8h",
    contactId: "cms0wwsrm02tpywnenw4g3sai",
    companyName: "Car Recyclers",
    email: "parts@Car-Recyclers.com",
    evidenceUrl: "https://www.scrapmonster.com/scrap-yard/car-recyclers-inc/55516"
  },
  {
    companyId: "cms0wv0aq004dywnex5u1lxn6",
    contactId: "cms0wvylq019zywnegzfnnm21",
    companyName: "All Import Auto Salvage",
    email: "sales@all-import.com",
    evidenceUrl: "https://all-import.com/about-all-import/connect-with-us/"
  },
  {
    companyId: "cms0wv0e7007hywnevbkmpub1",
    contactId: "cms0wwfq20231ywnef3kx49kr",
    companyName: "Badger Motors",
    email: "sales@BadgerMotors.com",
    evidenceUrl: "https://www.scrapmonster.com/scrap-yard/badger-motors-auto-salvage-inc/58930"
  },
  {
    companyId: "cms0wv0fi008pywnesfhywr1v",
    contactId: "cms0wwjkj02dlywneclicbwly",
    companyName: "Biloxi Auto Recycling",
    email: "sales@BiloxiAutoRecycling.com",
    evidenceUrl: "https://www.scrapmonster.com/scrap-yard/biloxi-auto-recycling/50572"
  },
  {
    companyId: "cms0wv0gp009pywne0mwn2inj",
    contactId: "cms0wwoqa02nbywne3cbqmcjo",
    companyName: "Browning Auto Parts",
    email: "parts@browningautoparts.com",
    evidenceUrl: "https://www.scrapmonster.com/scrap-yard/browning-auto-parts/59146"
  }
] as const;

const packages = [
  {
    name: "Website Conversion Upgrade",
    description: "Focused improvements to turn an existing business website into a clearer enquiry and quote-conversion channel. Founding pilot: $750-$1,500. Standard engagements: $2,000-$4,000. Final scope and price require discovery and written approval.",
    currency: "USD",
    minimumPrice: 750,
    maximumPrice: 4_000,
    capabilities: ["Conversion review", "Lead-capture improvements", "Mobile UX improvements", "Analytics and handoff"],
    exclusions: ["Unapproved third-party fees", "Unconfirmed integrations", "Unlimited revisions"],
    approved: true
  },
  {
    name: "Quote & Lead Automation",
    description: "A quote intake, qualification, routing, and follow-up workflow for businesses handling enquiries manually. Founding pilot: $1,500-$3,000. Full engagements: $4,000-$8,000. Final scope and price require discovery and written approval.",
    currency: "USD",
    minimumPrice: 1_500,
    maximumPrice: 8_000,
    capabilities: ["Guided quote intake", "Lead qualification", "CRM routing", "Follow-up automation", "Reporting"],
    exclusions: ["Unapproved third-party fees", "Guaranteed sales outcomes", "Unsupported legacy integrations"],
    approved: true
  },
  {
    name: "Inventory Search / Customer Portal",
    description: "Discovery and implementation for searchable inventory, customer self-service, and request workflows. Discovery starts at $2,500. Full implementations typically range from $6,000-$15,000+. Final scope and price require discovery and written approval.",
    currency: "USD",
    minimumPrice: 2_500,
    maximumPrice: 15_000,
    capabilities: ["Workflow discovery", "Inventory search", "Customer portal", "Request tracking", "Integration planning"],
    exclusions: ["Unapproved data migration", "Unconfirmed vendor APIs", "Fixed price before discovery"],
    approved: true
  }
] as const;

async function main() {
  const gmail = await prisma.channelConnection.findFirst({
    where: { provider: "GMAIL", status: "CONNECTED", emailAddress: "rajattomar.freelance@gmail.com" },
    orderBy: { updatedAt: "desc" }
  });
  if (!gmail) throw new Error("The dedicated Gmail mailbox is not connected.");

  for (const item of packages) {
    await prisma.servicePackage.upsert({
      where: { name: item.name },
      create: { ...item, capabilities: [...item.capabilities], exclusions: [...item.exclusions] },
      update: { ...item, capabilities: [...item.capabilities], exclusions: [...item.exclusions] }
    });
  }

  let sequence = await prisma.sequence.findFirst({ where: { name: campaignName } });
  if (!sequence) {
    sequence = await prisma.sequence.create({
      data: {
        name: campaignName,
        connectionId: gmail.id,
        channel: "EMAIL",
        status: "ACTIVE",
        approvalMode: "REQUIRED",
        dailyLimit: 5,
        perDomainLimit: 1,
        maxLaunchSize: 5,
        minIntervalSeconds: 900,
        sendingTimezone: "America/New_York",
        sendWindowStartMinutes: 9 * 60,
        sendWindowEndMinutes: 15 * 60,
        skipWeekends: true,
        requireOptOut: true,
        steps: {
          create: {
            position: 1,
            delayHours: 0,
            subject: "A practical enquiry-flow idea for {{companyName}}",
            body: "Hi {{firstName}},\n\nI was reviewing {{companyName}}'s public online presence and how customers reach you when they need a part or quote. When enquiries arrive through website, email, and phone touchpoints, qualification and follow-up can become difficult to track.\n\nA focused {{recommendedOffer}} could make that flow easier without replacing the systems your team already relies on.\n\nWould it be useful if I sent a short, no-obligation outline tailored to your current process?\n\nRajat Tomar"
          }
        }
      }
    });
  } else {
    sequence = await prisma.sequence.update({
      where: { id: sequence.id },
      data: {
        connectionId: gmail.id,
        status: "ACTIVE",
        approvalMode: "REQUIRED",
        dailyLimit: 5,
        perDomainLimit: 1,
        maxLaunchSize: 5,
        minIntervalSeconds: 900,
        sendingTimezone: "America/New_York",
        sendWindowStartMinutes: 9 * 60,
        sendWindowEndMinutes: 15 * 60,
        skipWeekends: true,
        requireOptOut: true
      }
    });
  }

  const checked = [];
  for (const candidate of candidates) {
    const contact = await prisma.contact.findUnique({
      where: { id: candidate.contactId },
      include: {
        company: { include: { qualityIssues: { where: { status: "OPEN" } } } },
        communicationPreferences: true
      }
    });
    if (!contact || contact.companyId !== candidate.companyId) throw new Error(`Candidate record mismatch: ${candidate.companyName}`);
    if (contact.type !== "EMAIL" || contact.value.toLowerCase() !== candidate.email.toLowerCase()) throw new Error(`Candidate email mismatch: ${candidate.companyName}`);
    if (!["VERIFIED", "PROBABLE"].includes(contact.company.trustStatus) || !["VERIFIED", "PROBABLE"].includes(contact.trustStatus)) throw new Error(`Trust gate failed: ${candidate.companyName}`);
    if (contact.company.quarantinedAt || contact.doNotContact || contact.company.qualityIssues.length > 0) throw new Error(`Quality gate failed: ${candidate.companyName}`);
    if (["BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(contact.contactabilityState)) throw new Error(`Contactability gate failed: ${candidate.companyName}`);

    const suppressed = await prisma.suppressionEntry.findFirst({
      where: {
        active: true,
        channel: "EMAIL",
        OR: [{ scope: "WORKSPACE" }, { companyId: candidate.companyId }, { contactId: candidate.contactId }, { normalizedDestination: contact.value.toLowerCase() }]
      }
    });
    if (suppressed) throw new Error(`Suppression gate failed: ${candidate.companyName}`);

    const existingNote = await prisma.note.findFirst({ where: { companyId: candidate.companyId, body: { contains: evidenceMarker } } });
    if (!existingNote) {
      await prisma.note.create({
        data: {
          companyId: candidate.companyId,
          body: `${evidenceMarker}\nFounding pilot candidate. Public business email cross-checked on 2026-08-05: ${candidate.evidenceUrl}\nStatus remains PROBABLE until outreach confirms deliverability and ownership. Before approval, replace broad assumptions with a specific, evidence-backed observation from the current website. No automated send.`
        }
      });
    }
    checked.push({ company: contact.company.name, contactId: contact.id, email: contact.value, trust: contact.trustStatus });
  }

  console.log(JSON.stringify({
    campaign: { id: sequence.id, name: sequence.name, status: sequence.status, nextGate: "PREPARE 5" },
    mailbox: gmail.emailAddress,
    packages: packages.map((item) => ({ name: item.name, range: `$${item.minimumPrice}-$${item.maximumPrice}` })),
    candidates: checked,
    sent: 0
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
