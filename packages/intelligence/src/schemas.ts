const schemaReplyCategories = [
  "INTERESTED", "PRICING_QUESTION", "TECHNICAL_QUESTION", "MEETING_REQUEST", "REFERRAL", "WRONG_CONTACT",
  "NOT_INTERESTED", "OUT_OF_OFFICE", "UNSUBSCRIBE", "VENDOR_SALES_MESSAGE", "SPAM", "UNKNOWN"
] as const;

export const replyIntelligenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "confidence", "sentiment", "commercialIntent", "urgency", "requiresReply", "extractedQuestions", "summary", "currentState", "pendingItems", "objections", "nextAction"],
  properties: {
    category: { type: "string", enum: [...schemaReplyCategories] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
    commercialIntent: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "NONE"] },
    urgency: { type: "string", enum: ["URGENT", "NORMAL", "LOW"] },
    requiresReply: { type: "boolean" },
    extractedQuestions: { type: "array", items: { type: "string" }, maxItems: 8 },
    summary: { type: "string" },
    currentState: { type: "string" },
    pendingItems: { type: "array", items: { type: "string" }, maxItems: 8 },
    objections: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "evidenceQuote", "recommendedHandling", "confidence"],
        properties: {
          type: { type: "string", enum: ["PRICE", "TIMING", "TRUST", "NEED_APPROVAL", "EXISTING_VENDOR", "NOT_PRIORITY", "TECHNICAL_COMPATIBILITY", "SECURITY", "NO_BUDGET", "SEND_INFORMATION", "NOT_INTERESTED"] },
          evidenceQuote: { type: "string" },
          recommendedHandling: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 }
        }
      }
    },
    nextAction: {
      type: "object",
      additionalProperties: false,
      required: ["action", "priority", "reason", "deadlineHours", "confidence", "requiresApproval", "recommendedCrmStage"],
      properties: {
        action: { type: "string", enum: ["REPLY_NOW", "ASK_QUALIFICATION_QUESTION", "SEND_CALENDAR_LINK", "PREPARE_PRICING", "GENERATE_PROPOSAL", "FOLLOW_UP", "WAIT", "DISQUALIFY", "MARK_WRONG_CONTACT", "ESCALATE_MANUAL_REVIEW", "SEND_PRICING_REPLY", "OFFER_MEETING_SLOTS"] },
        priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
        reason: { type: "string" },
        deadlineHours: { type: ["integer", "null"], minimum: 0, maximum: 720 },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        requiresApproval: { type: "boolean" },
        recommendedCrmStage: { type: ["string", "null"], enum: ["REPLIED", "QUALIFIED", "OPPORTUNITY", "MEETING", "NEGOTIATION", "LOST", null] }
      }
    }
  }
} as const;

export const suggestedReplySchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "bodyText", "confidence", "warnings", "usedFacts"],
  properties: {
    subject: { type: ["string", "null"] },
    bodyText: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    warnings: { type: "array", items: { type: "string" }, maxItems: 8 },
    usedFacts: { type: "array", items: { type: "string" }, maxItems: 12 }
  }
} as const;
