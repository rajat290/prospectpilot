import { createHash } from "node:crypto";

export { createStructuredResponse } from "./openai.js";

export const REPLY_CATEGORIES = [
  "INTERESTED", "PRICING_QUESTION", "TECHNICAL_QUESTION", "MEETING_REQUEST", "REFERRAL", "WRONG_CONTACT",
  "NOT_INTERESTED", "OUT_OF_OFFICE", "UNSUBSCRIBE", "VENDOR_SALES_MESSAGE", "SPAM", "UNKNOWN"
] as const;
export type ReplyCategoryValue = typeof REPLY_CATEGORIES[number];
export type SentimentValue = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type CommercialIntentValue = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type UrgencyValue = "URGENT" | "NORMAL" | "LOW";

export type ReplyAnalysis = {
  category: ReplyCategoryValue;
  confidence: number;
  sentiment: SentimentValue;
  commercialIntent: CommercialIntentValue;
  urgency: UrgencyValue;
  requiresReply: boolean;
  extractedQuestions: string[];
  evidenceMessageIds: string[];
  deterministic: boolean;
};

export type DetectedObjection = {
  type: "PRICE" | "TIMING" | "TRUST" | "NEED_APPROVAL" | "EXISTING_VENDOR" | "NOT_PRIORITY" | "TECHNICAL_COMPATIBILITY" | "SECURITY" | "NO_BUDGET" | "SEND_INFORMATION" | "NOT_INTERESTED";
  evidenceQuote: string;
  recommendedHandling: string;
  confidence: number;
};

export type NextAction = {
  action: "REPLY_NOW" | "ASK_QUALIFICATION_QUESTION" | "SEND_CALENDAR_LINK" | "PREPARE_PRICING" | "GENERATE_PROPOSAL" | "FOLLOW_UP" | "WAIT" | "DISQUALIFY" | "MARK_WRONG_CONTACT" | "ESCALATE_MANUAL_REVIEW" | "SEND_PRICING_REPLY" | "OFFER_MEETING_SLOTS";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  deadlineHours?: number;
  confidence: number;
  requiresApproval: boolean;
  recommendedCrmStage?: "REPLIED" | "QUALIFIED" | "OPPORTUNITY" | "MEETING" | "NEGOTIATION" | "LOST";
};

export type MeetingSignal = {
  dateText?: string;
  timeText?: string;
  timezone?: string;
  meetingType?: string;
  participants: string[];
  agenda?: string;
  exactSlot: boolean;
  confidence: number;
};

const rules: Array<{
  category: ReplyCategoryValue;
  confidence: number;
  pattern: RegExp;
  sentiment: SentimentValue;
  intent: CommercialIntentValue;
  urgency: UrgencyValue;
  requiresReply: boolean;
  hard: boolean;
}> = [
  { category: "UNSUBSCRIBE", confidence: 99, pattern: /\b(unsubscribe|remove me|stop (emailing|contacting)|do not (email|contact)|opt[ -]?out)\b/i, sentiment: "NEGATIVE", intent: "NONE", urgency: "URGENT", requiresReply: false, hard: true },
  { category: "WRONG_CONTACT", confidence: 98, pattern: /\b(wrong (person|contact|department)|no longer (work|works) here|not the right person)\b/i, sentiment: "NEUTRAL", intent: "NONE", urgency: "NORMAL", requiresReply: false, hard: true },
  { category: "OUT_OF_OFFICE", confidence: 98, pattern: /\b(out of (the )?office|automatic reply|auto-?reply|on (annual )?leave|away from the office)\b/i, sentiment: "NEUTRAL", intent: "NONE", urgency: "LOW", requiresReply: false, hard: true },
  { category: "SPAM", confidence: 96, pattern: /\b(crypto giveaway|claim your prize|lottery winner|wire transfer|urgent inheritance)\b/i, sentiment: "NEGATIVE", intent: "NONE", urgency: "LOW", requiresReply: false, hard: true },
  { category: "NOT_INTERESTED", confidence: 96, pattern: /\b(not interested|no thank(s| you)|please don't follow up|we will pass|not a fit)\b/i, sentiment: "NEGATIVE", intent: "NONE", urgency: "LOW", requiresReply: false, hard: true },
  { category: "MEETING_REQUEST", confidence: 94, pattern: /\b(call|meeting|meet|speak|chat|calendar|schedule|available|zoom|teams|google meet)\b/i, sentiment: "POSITIVE", intent: "HIGH", urgency: "NORMAL", requiresReply: true, hard: false },
  { category: "PRICING_QUESTION", confidence: 94, pattern: /\b(price|pricing|cost|quote|budget|rate|charges?|how much|proposal)\b/i, sentiment: "POSITIVE", intent: "HIGH", urgency: "NORMAL", requiresReply: true, hard: false },
  { category: "TECHNICAL_QUESTION", confidence: 88, pattern: /\b(integrat(e|ion)|api|compatible|security|hosting|stack|database|implementation|technical|architecture)\b/i, sentiment: "NEUTRAL", intent: "MEDIUM", urgency: "NORMAL", requiresReply: true, hard: false },
  { category: "REFERRAL", confidence: 90, pattern: /\b(contact|speak to|reach out to|forwarded|copying|cc'ing|refer)\b.{0,45}\b(manager|director|owner|team|colleague|person)\b/i, sentiment: "POSITIVE", intent: "MEDIUM", urgency: "NORMAL", requiresReply: true, hard: false },
  { category: "VENDOR_SALES_MESSAGE", confidence: 87, pattern: /\b(we (help|offer|provide)|our services|book a demo with us|grow your business)\b/i, sentiment: "NEUTRAL", intent: "NONE", urgency: "LOW", requiresReply: false, hard: false },
  { category: "INTERESTED", confidence: 86, pattern: /\b(interested|sounds good|looks interesting|tell me more|would like to know|let's explore)\b/i, sentiment: "POSITIVE", intent: "MEDIUM", urgency: "NORMAL", requiresReply: true, hard: false }
];

export function classifyReply(input: { messageId: string; subject?: string | null; body: string }): ReplyAnalysis {
  const text = `${input.subject ?? ""}\n${input.body}`.trim();
  const match = rules.find((rule) => rule.pattern.test(text));
  const questions = extractQuestions(input.body);
  if (match) {
    return {
      category: match.category,
      confidence: match.confidence,
      sentiment: match.sentiment,
      commercialIntent: match.intent,
      urgency: match.urgency,
      requiresReply: match.requiresReply,
      extractedQuestions: questions,
      evidenceMessageIds: [input.messageId],
      deterministic: match.hard
    };
  }
  return {
    category: "UNKNOWN",
    confidence: questions.length ? 58 : 42,
    sentiment: "NEUTRAL",
    commercialIntent: questions.length ? "LOW" : "NONE",
    urgency: "NORMAL",
    requiresReply: questions.length > 0,
    extractedQuestions: questions,
    evidenceMessageIds: [input.messageId],
    deterministic: false
  };
}

export function extractQuestions(body: string) {
  const sentences = body.replace(/\r/g, "").split(/(?<=[?.!])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  return sentences.filter((item) => item.endsWith("?") || /^(can|could|would|will|do|does|is|are|what|when|where|which|who|how)\b/i.test(item)).slice(0, 8);
}

export function detectObjections(body: string): DetectedObjection[] {
  const definitions: Array<[DetectedObjection["type"], RegExp, string]> = [
    ["NO_BUDGET", /\b(no budget|(?:may|might|do|does|did|can|could)?\s*not have (?:the )?budget|without (?:a )?budget|budget (?:is )?(?:tight|limited|unavailable)|cannot afford)\b/i, "Offer a smaller phased scope; do not invent or discount pricing."],
    ["PRICE", /\b(too expensive|price is high|cost concern|cheaper|discount)\b/i, "Reframe around business impact and offer phased implementation within approved pricing."],
    ["TIMING", /\b(not (the )?right time|later this|next quarter|too busy|timing)\b/i, "Clarify the decision window and propose a low-effort next step."],
    ["TRUST", /\b(case stud|reference|worked with|prove|trust|experience)\b/i, "Use only verified evidence and offer a scoped diagnostic or demo."],
    ["NEED_APPROVAL", /\b(need (to|get) approval|check with|speak to (my|the)|decision maker|management)\b/i, "Equip the contact with a concise business case and ask who should join the next step."],
    ["EXISTING_VENDOR", /\b(existing vendor|already have|current agency|in-house team)\b/i, "Position a complementary audit or a narrowly scoped improvement instead of replacement."],
    ["NOT_PRIORITY", /\b(not a priority|other priorities|backlog)\b/i, "Ask what event would make this important and set a respectful follow-up date."],
    ["TECHNICAL_COMPATIBILITY", /\b(won't integrate|compatib|legacy system|technical limitation)\b/i, "Ask for the relevant system details before claiming compatibility."],
    ["SECURITY", /\b(security|privacy|compliance|data protection|gdpr|hipaa)\b/i, "Request their security requirements and avoid unsupported compliance claims."],
    ["SEND_INFORMATION", /\b(send (me|us) (more )?(information|details|a deck)|email (me|us) details)\b/i, "Send a concise, evidence-backed overview with one clear next step."],
    ["NOT_INTERESTED", /\b(not interested|not a fit|we will pass)\b/i, "Acknowledge the rejection and stop outreach unless they explicitly reopen the conversation."]
  ];
  return definitions.flatMap(([type, pattern, handling]) => {
    const match = body.match(pattern);
    if (!match) return [];
    return [{ type, evidenceQuote: evidenceWindow(body, match.index ?? 0), recommendedHandling: handling, confidence: 88 }];
  });
}

export function detectMeetingIntent(body: string): MeetingSignal | null {
  if (!/\b(call|meeting|meet|speak|chat|calendar|schedule|available|zoom|teams|google meet)\b/i.test(body)) return null;
  const date = body.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/i)?.[0];
  const time = body.match(/\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening|noon)\b/i)?.[0];
  const timezone = body.match(/\b(?:UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|IST|GST)\b/i)?.[0];
  return {
    dateText: date,
    timeText: time,
    timezone,
    meetingType: body.match(/\b(zoom|teams|google meet|phone|call)\b/i)?.[0],
    participants: [],
    exactSlot: Boolean(date && /\d{1,2}(?::\d{2})?\s*(am|pm)/i.test(time ?? "")),
    confidence: date || time ? 90 : 78
  };
}

export function recommendNextAction(analysis: ReplyAnalysis): NextAction {
  const map: Record<ReplyCategoryValue, NextAction> = {
    UNSUBSCRIBE: { action: "DISQUALIFY", priority: "CRITICAL", reason: "The prospect explicitly opted out; suppression must remain immediate.", confidence: 99, requiresApproval: false, recommendedCrmStage: "LOST" },
    WRONG_CONTACT: { action: "MARK_WRONG_CONTACT", priority: "HIGH", reason: "The sender says this is the wrong contact.", confidence: 98, requiresApproval: true },
    SPAM: { action: "DISQUALIFY", priority: "LOW", reason: "The inbound message matches deterministic spam indicators.", confidence: 96, requiresApproval: true },
    NOT_INTERESTED: { action: "DISQUALIFY", priority: "LOW", reason: "The prospect clearly declined the offer.", confidence: 96, requiresApproval: true, recommendedCrmStage: "LOST" },
    OUT_OF_OFFICE: { action: "WAIT", priority: "LOW", reason: "This is an automatic absence response; avoid replying immediately.", deadlineHours: 72, confidence: 98, requiresApproval: false },
    MEETING_REQUEST: { action: "OFFER_MEETING_SLOTS", priority: "HIGH", reason: "The prospect requested or suggested a live conversation.", deadlineHours: 2, confidence: 94, requiresApproval: true, recommendedCrmStage: "MEETING" },
    PRICING_QUESTION: { action: "SEND_PRICING_REPLY", priority: "HIGH", reason: "The prospect directly requested price, quote, budget, or proposal information.", deadlineHours: 4, confidence: 94, requiresApproval: true, recommendedCrmStage: "OPPORTUNITY" },
    TECHNICAL_QUESTION: { action: "REPLY_NOW", priority: "HIGH", reason: "A technical question is blocking evaluation.", deadlineHours: 4, confidence: 88, requiresApproval: true, recommendedCrmStage: "QUALIFIED" },
    REFERRAL: { action: "ASK_QUALIFICATION_QUESTION", priority: "MEDIUM", reason: "The sender appears to be directing outreach to another stakeholder.", deadlineHours: 8, confidence: 90, requiresApproval: true, recommendedCrmStage: "QUALIFIED" },
    INTERESTED: { action: "ASK_QUALIFICATION_QUESTION", priority: "HIGH", reason: "Positive interest needs a focused discovery question and next step.", deadlineHours: 4, confidence: 86, requiresApproval: true, recommendedCrmStage: "QUALIFIED" },
    VENDOR_SALES_MESSAGE: { action: "WAIT", priority: "LOW", reason: "This appears to be an inbound vendor pitch rather than a prospect reply.", confidence: 87, requiresApproval: false },
    UNKNOWN: { action: "ESCALATE_MANUAL_REVIEW", priority: "MEDIUM", reason: "The message does not have enough evidence for a reliable commercial action.", deadlineHours: 8, confidence: analysis.confidence, requiresApproval: true }
  };
  return map[analysis.category];
}

export function incrementalSummary(input: {
  previousSummary?: string | null;
  latestMessages: Array<{ direction: "INBOUND" | "OUTBOUND"; body: string }>;
  analysis?: ReplyAnalysis;
}) {
  const previous = input.previousSummary?.trim();
  const latest = input.latestMessages.slice(-4).map((message) => {
    const speaker = message.direction === "INBOUND" ? "Prospect" : "Operator";
    return `${speaker}: ${compact(message.body, 180)}`;
  });
  const lines = [...(previous ? previous.split("\n").filter(Boolean).slice(-4) : []), ...latest].slice(-6);
  return {
    summary: lines.map((line) => `- ${line.replace(/^-\s*/, "")}`).join("\n"),
    currentState: stateLabel(input.analysis),
    pendingItems: input.analysis?.extractedQuestions.length ? input.analysis.extractedQuestions : input.analysis?.requiresReply ? ["Review and reply to the latest inbound message."] : []
  };
}

export function validateSuggestedReply(input: {
  body: string;
  approvedPackages: Array<{ minimumPrice?: number | null; maximumPrice?: number | null; deliveryMinDays?: number | null; deliveryMaxDays?: number | null }>;
}) {
  const warnings: string[] = [];
  const placeholders = input.body.match(/\[[^\]]+\]|\{\{[^}]+\}\}/g) ?? [];
  if (placeholders.length) warnings.push(`Resolve placeholders before approval: ${[...new Set(placeholders)].join(", ")}`);
  if (/\b(guarantee(d)?|100% certain|we have worked with|our client achieved|case study proves)\b/i.test(input.body)) {
    warnings.push("Draft contains an unsupported guarantee, client claim, or case-study claim.");
  }
  const prices = [...input.body.matchAll(/(?:\$|USD\s*)(\d[\d,]*)/gi)].map((match) => Number(match[1]?.replaceAll(",", "")));
  for (const price of prices) {
    const allowed = input.approvedPackages.some((item) => item.minimumPrice != null && item.maximumPrice != null && price >= item.minimumPrice && price <= item.maximumPrice);
    if (!allowed) warnings.push(`Price $${price.toLocaleString("en-US")} is outside approved package boundaries.`);
  }
  const promisedDays = [...input.body.matchAll(/\b(\d{1,3})\s*(business\s*)?days?\b/gi)].map((match) => Number(match[1]));
  for (const days of promisedDays) {
    const allowed = input.approvedPackages.some((item) => item.deliveryMinDays != null && item.deliveryMaxDays != null && days >= item.deliveryMinDays && days <= item.deliveryMaxDays);
    if (!allowed) warnings.push(`${days}-day delivery claim is outside approved delivery boundaries.`);
  }
  return { warnings: [...new Set(warnings)], hasPlaceholders: placeholders.length > 0 };
}

export function stableInputHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function evidenceWindow(body: string, index: number) {
  const start = Math.max(0, index - 70);
  return compact(body.slice(start, index + 180), 240);
}

function compact(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function stateLabel(analysis?: ReplyAnalysis) {
  if (!analysis) return "Awaiting analysis";
  if (analysis.category === "MEETING_REQUEST") return "Meeting intent";
  if (analysis.category === "PRICING_QUESTION") return "Positive evaluation";
  if (analysis.category === "NOT_INTERESTED" || analysis.category === "UNSUBSCRIBE") return "Closed or disengaging";
  if (analysis.commercialIntent === "HIGH") return "Active evaluation";
  if (analysis.sentiment === "POSITIVE") return "Positive conversation";
  return "Needs review";
}

export { replyIntelligenceSchema, suggestedReplySchema } from "./schemas.js";
