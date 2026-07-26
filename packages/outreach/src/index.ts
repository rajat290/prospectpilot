export type OutreachDraftInput = {
  companyName: string;
  opportunityTitle: string;
  recommendedService: string;
  reasoning: string;
  city?: string | null;
  senderName?: string;
};

export type OutreachDraft = {
  channel: "EMAIL" | "LINKEDIN" | "WHATSAPP" | "FOLLOW_UP";
  subject?: string;
  body: string;
  personalization: string;
};

export function createOutreachDrafts(input: OutreachDraftInput): OutreachDraft[] {
  const sender = input.senderName ?? "[Your name]";
  const observation = trimSentence(input.reasoning, 170);
  const service = input.recommendedService.toLowerCase();
  const location = input.city ? ` in ${input.city}` : "";
  const personalization = `${input.opportunityTitle}. ${observation}`;

  return [
    {
      channel: "EMAIL",
      subject: `A practical idea for ${input.companyName}`,
      personalization,
      body: `Hi ${input.companyName} team,\n\nI came across your business${location} and noticed a specific opportunity: ${input.opportunityTitle.toLowerCase()}.\n\n${observation}\n\nI help businesses implement ${service}. I can share a short, no-obligation action plan showing what I would improve first and the likely business impact.\n\nWould a quick 10-minute conversation this week be useful?\n\nBest,\n${sender}`
    },
    {
      channel: "LINKEDIN",
      personalization,
      body: `Hi, I was reviewing ${input.companyName} and noticed an opportunity around ${input.opportunityTitle.toLowerCase()}. I work on ${service} and have a few practical ideas that could improve inquiry conversion. Happy to send a short action plan here if useful.`
    },
    {
      channel: "WHATSAPP",
      personalization,
      body: `Hi, is this the right contact for ${input.companyName}? I noticed a practical opportunity around ${input.opportunityTitle.toLowerCase()}. I help businesses with ${service}. May I send a short 3-point improvement plan?`
    },
    {
      channel: "FOLLOW_UP",
      subject: `Re: A practical idea for ${input.companyName}`,
      personalization,
      body: `Hi, just following up on the idea I shared for ${input.companyName}. I can send the short action plan first, so you can judge whether ${service} is worth exploring. Should I send it over?\n\nBest,\n${sender}`
    }
  ];
}

export function createBasicOutreachDraft(input: OutreachDraftInput): { subject: string; body: string } {
  const email = createOutreachDrafts(input)[0]!;
  return { subject: email.subject ?? "", body: email.body };
}

function trimSentence(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).replace(/[,\s]+$/, "")}.`;
}
