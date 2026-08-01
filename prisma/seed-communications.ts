import { PrismaClient } from "@prisma/client";
import { storeAttachment } from "@prospectpilot/communications";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

async function main() {
  const demoSource = await prisma.leadSource.findUnique({ where: { url: "https://demo.prospectpilot.local/directory" } });
  if (!demoSource) throw new Error("Run npm run seed:demo before seeding communication fixtures.");
  const leads = await prisma.company.findMany({
    where: { leadSourceId: demoSource.id },
    include: { contacts: true, opportunities: { take: 1 } },
    orderBy: { name: "asc" },
    take: 12
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
  const storedAttachment = await storeAttachment({
    bytes: Buffer.from("ProspectPilot demo scope\n\nDiscovery, workflow mapping, implementation, testing, and handoff."),
    fileName: "demo-project-scope.txt",
    mimeType: "text/plain",
    storageRoot: fileURLToPath(new URL("../.data/attachments", import.meta.url))
  });
  const existingAttachment = await prisma.attachment.findFirst({ where: { messageId: pendingMessage.id, sha256: storedAttachment.sha256 } });
  if (!existingAttachment) await prisma.attachment.create({ data: { messageId: pendingMessage.id, ...storedAttachment } });

  let sequence = await prisma.sequence.findFirst({ where: { name: "Responsible four-touch introduction" } });
  if (!sequence) {
    sequence = await prisma.sequence.create({
      data: {
        name: "Responsible four-touch introduction",
        channel: "EMAIL",
        status: "DRAFT",
        approvalMode: "REQUIRED",
        dailyLimit: 25,
        perDomainLimit: 2,
        maxLaunchSize: 100,
        minIntervalSeconds: 90,
        sendingTimezone: "America/New_York",
        sendWindowStartMinutes: 9 * 60,
        sendWindowEndMinutes: 16 * 60 + 30,
        skipWeekends: true,
        requireOptOut: true,
        steps: {
          create: [
            { position: 1, delayHours: 0, subject: "A focused idea for {{companyName}}", body: "Hi {{firstName}}, I found a practical opportunity around {{recommendedOffer}}. I can send a concise implementation outline if useful.\n\nVikas" },
            { position: 2, delayHours: 96, subject: "Re: A focused idea for {{companyName}}", body: "Hi {{firstName}}, one useful outcome from this work would be a faster and more reliable customer workflow. Happy to share the outline.\n\nVikas" },
            { position: 3, delayHours: 120, subject: "One practical outcome for {{companyName}}", body: "Hi {{firstName}}, I wanted to leave one practical thought: {{recommendedOffer}} can be scoped as a focused first milestone rather than a large transformation.\n\nVikas" },
            { position: 4, delayHours: 168, subject: "Closing the loop", body: "Hi {{firstName}}, I will close this out for now. If {{recommendedOffer}} becomes relevant later, I would be glad to help.\n\nVikas" }
          ]
        }
      }
    });
  }
  await prisma.sequence.update({
    where: { id: sequence.id },
    data: {
      status: "ACTIVE",
      dailyLimit: 25,
      perDomainLimit: 2,
      maxLaunchSize: 100,
      minIntervalSeconds: 90,
      sendingTimezone: "America/New_York",
      sendWindowStartMinutes: 9 * 60,
      sendWindowEndMinutes: 16 * 60 + 30,
      skipWeekends: true,
      requireOptOut: true
    }
  });
  const launchSteps = [
    { position: 1, delayHours: 0, subject: "A focused idea for {{companyName}}", body: "Hi {{firstName}}, I found a practical opportunity around {{recommendedOffer}}. I can send a concise implementation outline if useful.\n\nVikas" },
    { position: 2, delayHours: 96, subject: "Re: A focused idea for {{companyName}}", body: "Hi {{firstName}}, one useful outcome from this work would be a faster and more reliable customer workflow. Happy to share the outline.\n\nVikas" },
    { position: 3, delayHours: 120, subject: "One practical outcome for {{companyName}}", body: "Hi {{firstName}}, I wanted to leave one practical thought: {{recommendedOffer}} can be scoped as a focused first milestone rather than a large transformation.\n\nVikas" },
    { position: 4, delayHours: 168, subject: "Closing the loop", body: "Hi {{firstName}}, I will close this out for now. If {{recommendedOffer}} becomes relevant later, I would be glad to help.\n\nVikas" }
  ];
  for (const step of launchSteps) {
    await prisma.sequenceStep.upsert({
      where: { sequenceId_position: { sequenceId: sequence.id, position: step.position } },
      create: { sequenceId: sequence.id, ...step },
      update: step
    });
  }
  const sequenceLead = leads.find((lead) => lead.name === "Northstar Auto Recyclers") || leads.find((lead) => lead.id !== first.id && lead.id !== second.id && lead.id !== third.id) || second;
  const sequenceContact = primaryEmail(sequenceLead) || await ensureDemoEmail(sequenceLead.id, "sequence@demo-prospect.example");
  const existingEnrollment = await prisma.sequenceEnrollment.findFirst({ where: { sequenceId: sequence.id, companyId: sequenceLead.id } });
  if (!existingEnrollment) {
    await prisma.sequenceEnrollment.create({
      data: {
        sequenceId: sequence.id,
        companyId: sequenceLead.id,
        contactId: sequenceContact.id,
        status: "PENDING_APPROVAL"
      }
    });
  } else {
    const generatedMessages = await prisma.message.findMany({ where: { sequenceEnrollmentId: existingEnrollment.id }, select: { id: true } });
    for (const generated of generatedMessages) {
      await prisma.$transaction([
        prisma.messageEvent.deleteMany({ where: { messageId: generated.id } }),
        prisma.messageRecipient.deleteMany({ where: { messageId: generated.id } }),
        prisma.attachment.deleteMany({ where: { messageId: generated.id } }),
        prisma.approvalRequest.deleteMany({ where: { messageId: generated.id } }),
        prisma.scheduledMessage.deleteMany({ where: { messageId: generated.id } })
      ]);
      await prisma.message.delete({ where: { id: generated.id } });
    }
    await prisma.sequenceEnrollment.update({
      where: { id: existingEnrollment.id },
      data: {
        status: "PENDING_APPROVAL",
        currentStep: 0,
        nextStepAt: null,
        exitReason: null,
        approvedAt: null,
        approvedBy: null,
        pausedAt: null,
        completedAt: null
      }
    });
  }

  const scheduledDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const scheduledMessage = await prisma.message.upsert({
    where: { connectionId_providerMessageId: { connectionId: account.id, providerMessageId: `demo-scheduled-${second.id}` } },
    create: {
      conversationId: secondConversation.id,
      companyId: second.id,
      contactId: secondContact.id,
      connectionId: account.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "SCHEDULED",
      providerMessageId: `demo-scheduled-${second.id}`,
      subject: `Follow-up: Operations idea for ${second.name}`,
      bodyText: "A short scheduled follow-up awaiting its controlled delivery window.",
      scheduledAt: scheduledDueAt,
      recipients: { create: { type: "TO", address: secondContact.value, normalizedAddress: secondContact.value.toLowerCase(), contactId: secondContact.id } },
      events: { create: [{ type: "APPROVED" }, { type: "SCHEDULED" }] },
      approval: { create: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: "Demo operator", riskFlags: ["DEMO_PROVIDER"], reason: "Demo scheduled message." } }
    },
    update: { status: "SCHEDULED", scheduledAt: scheduledDueAt, failureReason: null }
  });
  await prisma.scheduledMessage.upsert({
    where: { messageId: scheduledMessage.id },
    create: { messageId: scheduledMessage.id, dueAt: scheduledDueAt, recipientTimezone: "Asia/Kolkata", status: "PENDING" },
    update: { dueAt: scheduledDueAt, recipientTimezone: "Asia/Kolkata", queueJobId: null, status: "PENDING", cancelledAt: null, lastError: null }
  });

  const unmatchedConversation = await prisma.conversation.upsert({
    where: { connectionId_providerThreadId: { connectionId: account.id, providerThreadId: "demo-unmatched-thread" } },
    create: {
      connectionId: account.id,
      channel: "EMAIL",
      providerThreadId: "demo-unmatched-thread",
      subject: "Referred by an exhibitor",
      status: "NEEDS_REPLY",
      latestMessageAt: hoursAgo(1),
      unreadCount: 1,
      participants: { create: { address: "hello@northwind-demo.example", normalizedAddress: "hello@northwind-demo.example", name: "Rhea Kapoor", role: "SENDER" } }
    },
    update: {}
  });
  const unmatchedMessage = await prisma.message.upsert({
    where: { connectionId_providerMessageId: { connectionId: account.id, providerMessageId: "demo-unmatched-message" } },
    create: {
      conversationId: unmatchedConversation.id,
      connectionId: account.id,
      channel: "EMAIL",
      direction: "INBOUND",
      status: "REPLIED",
      providerMessageId: "demo-unmatched-message",
      providerThreadId: "demo-unmatched-thread",
      subject: "Referred by an exhibitor",
      bodyText: "A colleague mentioned your workflow automation work. Could you share how you usually scope an initial engagement?",
      receivedAt: hoursAgo(1),
      sentAt: hoursAgo(1),
      recipients: {
        create: [
          { type: "FROM", address: "hello@northwind-demo.example", normalizedAddress: "hello@northwind-demo.example" },
          { type: "TO", address: account.emailAddress, normalizedAddress: account.emailAddress }
        ]
      },
      events: { create: [{ type: "SYNCED" }, { type: "REPLIED" }] }
    },
    update: {}
  });
  await prisma.inboundReview.upsert({
    where: { messageId: unmatchedMessage.id },
    create: {
      messageId: unmatchedMessage.id,
      connectionId: account.id,
      senderAddress: "hello@northwind-demo.example",
      senderName: "Rhea Kapoor",
      subject: unmatchedMessage.subject,
      providerThreadId: "demo-unmatched-thread",
      possibleMatches: [{ companyId: first.id, companyName: first.name, confidence: 55, reason: "Sender domain resembles a known business signal; operator confirmation required." }],
      matchConfidence: 55,
      matchReason: "Domain similarity is not strong enough for automatic attachment."
    },
    update: { status: "PENDING", resolvedAt: null, resolvedBy: null, resolution: null, resolvedCompanyId: null, resolvedContactId: null }
  });

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
  await prisma.contact.update({
    where: { id: suppressedContact.id },
    data: { contactabilityState: "INVALID", contactabilityUpdatedAt: new Date(), doNotContact: true, bounceCount: 1 }
  });
  const bounceConversation = await upsertConversation({
    companyId: suppressedLead.id,
    connectionId: account.id,
    providerThreadId: `demo-bounce-${suppressedLead.id}`,
    subject: `Delivery failed for ${suppressedLead.name}`,
    status: "AWAITING_PROSPECT",
    participantAddress: suppressedContact.value,
    contactId: suppressedContact.id
  });
  await prisma.message.upsert({
    where: { connectionId_providerMessageId: { connectionId: account.id, providerMessageId: `demo-bounce-message-${suppressedLead.id}` } },
    create: {
      conversationId: bounceConversation.id,
      companyId: suppressedLead.id,
      contactId: suppressedContact.id,
      connectionId: account.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "BOUNCED",
      providerMessageId: `demo-bounce-message-${suppressedLead.id}`,
      subject: `Delivery failed for ${suppressedLead.name}`,
      bodyText: "Demo message retained to exercise hard-bounce analytics and suppression.",
      bounceCategory: "HARD",
      failureReason: "Demo mailbox reported address not found.",
      recipients: { create: { type: "TO", address: suppressedContact.value, normalizedAddress: suppressedContact.value.toLowerCase(), contactId: suppressedContact.id } },
      events: { create: [{ type: "PROVIDER_SUBMITTED" }, { type: "BOUNCED", metadata: { demo: true } }] }
    },
    update: { status: "BOUNCED", bounceCategory: "HARD", failureReason: "Demo mailbox reported address not found." }
  });

  console.log(`Communication demo ready: ${await prisma.conversation.count()} conversations, ${await prisma.message.count()} messages, ${await prisma.approvalRequest.count({ where: { status: "PENDING" } })} pending approvals, ${await prisma.inboundReview.count({ where: { status: "PENDING" } })} unmatched replies.`);
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
