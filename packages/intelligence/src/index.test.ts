import assert from "node:assert/strict";
import test from "node:test";
import { classifyReply, detectMeetingIntent, detectObjections, incrementalSummary, recommendNextAction, validateSuggestedReply } from "./index.js";

test("unsubscribe stays deterministic and immediate", () => {
  const result = classifyReply({ messageId: "m1", body: "Please remove me from this list and stop emailing." });
  assert.equal(result.category, "UNSUBSCRIBE");
  assert.equal(result.deterministic, true);
  assert.equal(result.requiresReply, false);
  assert.equal(recommendNextAction(result).requiresApproval, false);
});

test("pricing and timeline questions produce high commercial intent", () => {
  const result = classifyReply({ messageId: "m2", body: "This looks interesting. What would it cost and how long will implementation take?" });
  assert.equal(result.category, "PRICING_QUESTION");
  assert.equal(result.commercialIntent, "HIGH");
  assert.equal(result.extractedQuestions.length, 1);
  assert.equal(recommendNextAction(result).action, "SEND_PRICING_REPLY");
});

test("meeting intent keeps ambiguous slots unconfirmed", () => {
  const signal = detectMeetingIntent("Can we speak Tuesday afternoon?");
  assert.equal(signal?.dateText?.toLowerCase(), "tuesday");
  assert.equal(signal?.timeText?.toLowerCase(), "afternoon");
  assert.equal(signal?.exactSlot, false);
});

test("objections retain evidence and handling guidance", () => {
  const objections = detectObjections("We may not have budget for the complete system this quarter.");
  assert.equal(objections[0]?.type, "NO_BUDGET");
  assert.match(objections[0]?.recommendedHandling ?? "", /phased/i);
});

test("summary update uses prior state plus only latest messages", () => {
  const result = incrementalSummary({ previousSummary: "- Initial outreach discussed automation.", latestMessages: [{ direction: "INBOUND", body: "Can you share pricing?" }] });
  assert.match(result.summary, /Initial outreach/);
  assert.match(result.summary, /pricing/);
});

test("reply safety flags unsupported prices and delivery promises", () => {
  const result = validateSuggestedReply({ body: "We guarantee delivery in 3 days for $9000.", approvedPackages: [{ minimumPrice: 2000, maximumPrice: 5000, deliveryMinDays: 10, deliveryMaxDays: 20 }] });
  assert.equal(result.warnings.length, 3);
});
