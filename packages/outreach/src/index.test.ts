import assert from "node:assert/strict";
import test from "node:test";
import { createOutreachDrafts } from "./index.js";

test("creates all manual outreach channels with personalization", () => {
  const drafts = createOutreachDrafts({
    companyName: "Northstar Auto",
    opportunityTitle: "Missing lead capture",
    recommendedService: "Lead capture funnel",
    reasoning: "The website has no clear inquiry form.",
    city: "Toronto",
    senderName: "Rajat Tomar"
  });

  assert.deepEqual(drafts.map((draft) => draft.channel), ["EMAIL", "LINKEDIN", "WHATSAPP", "FOLLOW_UP"]);
  assert.match(drafts[0]!.body, /Rajat Tomar/);
  assert.match(drafts[1]!.body, /Northstar Auto/);
  assert.ok(drafts.every((draft) => draft.personalization.length > 0));
});
