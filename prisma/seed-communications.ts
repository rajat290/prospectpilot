import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoSource = await prisma.leadSource.findUnique({ where: { url: "https://demo.prospectpilot.local/directory" } });
  if (!demoSource) throw new Error("Run npm run seed:demo before seeding communication fixtures.");
  const leads = await prisma.company.findMany({
    where: { leadSourceId: demoSource.id },
    include: { contacts: true, opportunities: { take: 1 } },
    orderBy: { name: "asc" },
    take: 4
  });
  if (leads.length < 3) throw new Error("At least three demo leads are required.");

  const account = await prisma.channelConnection.upsert({
    where: { provider_emailAddress: { provider: "INTERNAL", emailAddress: "demo@prospectpilot.local" } },
    create: {
      provider: "INTERNAL",
      channel: "EMAIL",
      emailAddress: "demo@prospectpilot.local",
      displayName: "ProspectPilot Demo Mailbox",
      status: "CONNECTED",
      grantedScopes: [],
      lastSyncedAt: new Date()
    },
    update: { status: "CONNECTED", lastError: null }
  });

  const templateFixtures = [
    {
      name: "Evidence-led first touch",
      category: "FIRST_TOUCH" as const,
      subject: "A workflow idea for {{companyName}}",
      body: "Hi {{firstName}},\n\nI noticed {{observedProblem}}. I have an idea for {{recommendedOffer}} that could improve {{businessImpact}}.\n\nWould a short walkthrough be useful?\n\n{{senderName}}",
      variables: ["firstName", "companyName", "observedProblem", "recommendedOffer", "businessImpact", "senderName"]
    },
    {
      name: "Short value follow-up",
      category: "FOLLOW_UP" as const,
      subject: "Re: A workflow idea for {{companyName}}",
      body: "Hi {{firstName}},\n\nOne practical outcome from this would be {{businessImpact}}. Happy to send a two-minute outline if useful.\n\n{{senderName}}",
      variables: ["firstName", "companyName", "businessImpact", "senderName"]
    },
    {
      name: "Respectful close loop",
      category: "CLOSE_LOOP" as const,
      subject: "Closing the loop",
      body: "Hi {{firstName}},\n\nI will close this out for now. If {{recommendedOffer}} becomes relevant later, I am happy to help.\n\n{{senderName}}",
      variables: ["firstName", "recommendedOffer", "senderName"]
    }
  ];
  for (const fixture of templateFixtures) {
    const existing = await prisma.messageTemplate.findFirst({ where: { name: fixture.name } });
    if (existing) {
      await prisma.messageTemplate.update({ where: { id: existing.id }, data: fixture });
    } else {
      await prisma.messageTemplate.create({
        data: { ...fixture, channel: "EMAIL", approvalMode: "REQUIRED" }
      });
    }
  }

  const first = leads[0]!;
  const firstContact = primaryEmail(first) || await ensureDemoEmail(first.id, "maya@demo-prospect.example");
  const firstConversation = await upsertConversation({
    companyId: first.id,
    connectionId: account.id,
    providerThreadId: `demo-thread-${first.id}`,
    subject: `Re: workflow idea for ${first.name}`,
    status: "NEEDS_REPLY",
    participantAddress: firstContact.value,
    contactId: firstContact.id
  });
  await upsertMessage({
    conversationId: firstConversation.id,
    companyId: first.id,
    contactId: firstContact.id,
    connectionId: account.id,
    providerMessageId: `demo-outbound-${first.id}`,
    direction: "OUTBOUND",
    status: "SUBMITTED",
    subject: `A workflow idea for ${first.name}`,
    bodyText: `Hi Maya,\n\nI noticed the current enquiry flow could benefit from structured qualification and routing. Would a short walkthrough be useful?`,
    from: account.emailAddress,
    to: firstContact.value,
    occurredAt: hoursAgo(7)
  });
  await upsertMessage({
    conversationId: firstConversation.id,
    companyId: first.id,
    contactId: firstContact.id,
    connectionId: account.id,
    providerMessageId: `demo-inbound-${first.id}`,
    direction: "INBOUND",
    status: "REPLIED",
    subject: `Re: workflow idea for ${first.name}`,
    bodyText: "This sounds relevant. Can you share an approximate implementation range and what would be included?",
    from: firstContact.value,
    to: account.emailAddress,
    occurredAt: hoursAgo(2)
  });

  const second = leads[1]!;
  const secondContact = primaryEmail(second) || await ensureDemoEmail(second.id, "operations@demo-prospect.example");
  const secondConversation = await upsertConversation({
    companyId: second.id,
    connectionId: account.id,
    providerThreadId: `demo-thread-${second.id}`,
    subject: `Operations idea for ${second.name}`,
    status: "AWAITING_PROSPECT",
    participantAddress: secondContact.value,
    contactId: secondContact.id
  });
  await upsertMessage({
    conversationId: secondConversation.id,
    companyId: second.id,
    contactId: secondContact.id,
    connectionId: account.id,
    providerMessageId: `demo-outbound-${second.id}`,
    direction: "OUTBOUND",
    status: "SUBMITTED",
    subject: `Operations idea for ${second.name}`,
    bodyText: "I prepared a short evidence-based workflow improvement idea. Is the operations team the right owner for this?",
    from: account.emailAddress,
    to: secondContact.value,
    occurredAt: hoursAgo(28)
  });

  const third = leads[2]!;
  const thirdContact = primaryEmail(third) || await ensureDemoEmail(third.id, "owner@demo-prospect.example");
  const thirdConversation = await upsertConversation({
    companyId: third.id,
    connectionId: account.id,
    providerThreadId: `demo-thread-${third.id}`,
    subject: `Lead handling idea for ${third.name}`,
    status: "OPEN",
    participantAddress: thirdContact.value,
    contactId: thirdContact.id
  });
  const pendingMessage = await prisma.message.upsert({
    where: { connectionId_providerMessageId: { connectionId: account.id, providerMessageId: `demo-draft-${third.id}` } },
    create: {
      conversationId: thirdConversation.id,
      companyId: third.id,
      contactId: thirdContact.id,
      connectionId: account.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      providerMessageId: `demo-draft-${third.id}`,
      providerThreadId: thirdConversation.providerThreadId,
      references: [],
      subject: `Lead handling idea for ${third.name}`,
      bodyText: "I noticed a possible gap between website enquiries and follow-up. I drafted a focused routing workflow idea for your review.",
      recipients: {
        create: [{ type: "TO", address: thirdContact.value, normalizedAddress: thirdContact.value.toLowerCase(), contactId: thirdContact.id }]
      },
      events: { create: [{ type: "CREATED" }, { type: "APPROVAL_REQUESTED" }] }
    },
    update: {
      status: "PENDING_APPROVAL",
      subject: `Lead handling idea for ${third.name}`,
      bodyText: "I noticed a possible gap between website enquiries and follow-up. I drafted a focused routing workflow idea for your review."
    }
  });
  await prisma.approvalRequest.upsert({
    where: { messageId: pendingMessage.id },
    create: {
      messageId: pendingMessage.id,
      status: "PENDING",
      reason: "Demo first-touch message requires operator approval.",
      riskFlags: ["DEMO_PROVIDER", `LEAD_${third.trustStatus}`]
    },
    update: {
      status: "PENDING",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      reason: "Demo first-touch message requires operator approval.",
      riskFlags: ["DEMO_PROVIDER", `LEAD_${third.trustStatus}`]
    }
  });

  let sequence = await prisma.sequence.findFirst({ where: { name: "Responsible four-touch introduction" } });
  if (!sequence) {
    sequence = await prisma.sequence.create({
      data: {
        name: "Responsible four-touch introduction",
        channel: "EMAIL",
        status: "DRAFT",
        approvalMode: "REQUIRED",
        dailyLimit: 20,
        perDomainLimit: 2,
        skipWeekends: true,
        steps: {
          create: [
            { position: 1, delayHours: 0, subject: "A focused idea for {{companyName}}", body: "Evidence-led first touch" },
            { position: 2, delayHours: 96, subject: "Re: A focused idea", body: "Short value follow-up" },
            { position: 3, delayHours: 120, subject: "One practical outcome", body: "Value-based idea" },
            { position: 4, delayHours: 168, subject: "Closing the loop", body: "Respectful close loop" }
          ]
        }
      }
    });
  }

  const suppressedLead = leads[3]!;
  const suppressedContact = primaryEmail(suppressedLead) || await ensureDemoEmail(suppressedLead.id, "blocked@demo-prospect.example");
  const existingSuppression = await prisma.suppressionEntry.findFirst({
    where: { channel: "EMAIL", normalizedDestination: suppressedContact.value.toLowerCase(), active: true }
  });
  if (!existingSuppression) {
    await prisma.suppressionEntry.create({
      data: {
        channel: "EMAIL",
        scope: "DESTINATION",
        normalizedDestination: suppressedContact.value.toLowerCase(),
        companyId: suppressedLead.id,
        contactId: suppressedContact.id,
        reason: "MANUALLY_BLOCKED",
        details: "Demo suppression fixture. No message may be submitted to this address."
      }
    });
  }

  console.log(`Communication demo ready: ${await prisma.conversation.count()} conversations, ${await prisma.message.count()} messages, ${await prisma.approvalRequest.count({ where: { status: "PENDING" } })} pending approvals.`);
}

async function upsertConversation(input: {
  companyId: string;
  connectionId: string;
  providerThreadId: string;
  subject: string;
  status: "OPEN" | "NEEDS_REPLY" | "AWAITING_PROSPECT";
  participantAddress: string;
  contactId: string;
}) {
  return prisma.conversation.upsert({
    where: { connectionId_providerThreadId: { connectionId: input.connectionId, providerThreadId: input.providerThreadId } },
    create: {
      companyId: input.companyId,
      connectionId: input.connectionId,
      channel: "EMAIL",
      providerThreadId: input.providerThreadId,
      subject: input.subject,
      status: input.status,
      latestMessageAt: new Date(),
      unreadCount: input.status === "NEEDS_REPLY" ? 1 : 0,
      aiClassification: input.status === "NEEDS_REPLY" ? "PRICING_QUESTION" : undefined,
      classificationConfidence: input.status === "NEEDS_REPLY" ? 91 : undefined,
      nextAction: input.status === "NEEDS_REPLY" ? "Answer the implementation range question." : "Wait for a reply.",
      participants: {
        create: [{
          contactId: input.contactId,
          address: input.participantAddress,
          normalizedAddress: input.participantAddress.toLowerCase(),
          role: "RECIPIENT"
        }]
      }
    },
    update: { status: input.status, latestMessageAt: new Date() }
  });
}

async function upsertMessage(input: {
  conversationId: string;
  companyId: string;
  contactId: string;
  connectionId: string;
  providerMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "REPLIED" | "SUBMITTED";
  subject: string;
  bodyText: string;
  from: string;
  to: string;
  occurredAt: Date;
}) {
  return prisma.message.upsert({
    where: { connectionId_providerMessageId: { connectionId: input.connectionId, providerMessageId: input.providerMessageId } },
    create: {
      conversationId: input.conversationId,
      companyId: input.companyId,
      contactId: input.contactId,
      connectionId: input.connectionId,
      channel: "EMAIL",
      direction: input.direction,
      status: input.status,
      providerMessageId: input.providerMessageId,
      providerThreadId: `demo-thread-${input.companyId}`,
      references: [],
      subject: input.subject,
      bodyText: input.bodyText,
      submittedAt: input.direction === "OUTBOUND" ? input.occurredAt : undefined,
      receivedAt: input.direction === "INBOUND" ? input.occurredAt : undefined,
      sentAt: input.occurredAt,
      recipients: {
        create: [
          { type: "FROM", address: input.from, normalizedAddress: input.from.toLowerCase(), contactId: input.direction === "INBOUND" ? input.contactId : undefined },
          { type: "TO", address: input.to, normalizedAddress: input.to.toLowerCase(), contactId: input.direction === "OUTBOUND" ? input.contactId : undefined }
        ]
      },
      events: { create: input.direction === "INBOUND" ? [{ type: "SYNCED" }, { type: "REPLIED", occurredAt: input.occurredAt }] : [{ type: "SUBMITTED", occurredAt: input.occurredAt }] }
    },
    update: {}
  });
}

function primaryEmail(company: { contacts: Array<{ id: string; type: string; value: string; isPrimary: boolean }> }) {
  return company.contacts.find((contact) => contact.type === "EMAIL" && contact.isPrimary) ||
    company.contacts.find((contact) => contact.type === "EMAIL");
}

async function ensureDemoEmail(companyId: string, value: string) {
  return prisma.contact.upsert({
    where: { companyId_type_value: { companyId, type: "EMAIL", value } },
    create: {
      companyId,
      type: "EMAIL",
      value,
      normalizedValue: value.toLowerCase(),
      label: "Demo contact",
      confidence: 100,
      trustStatus: "VERIFIED",
      isPrimary: true,
      contactabilityState: "REACHABLE",
      contactabilityUpdatedAt: new Date()
    },
    update: { normalizedValue: value.toLowerCase(), isPrimary: true }
  });
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
