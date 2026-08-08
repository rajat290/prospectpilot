export type TermDefinition = {
  key: string;
  label: string;
  meaning: string;
  nextAction?: string;
  group: "Lead" | "Email" | "Data" | "Campaign" | "General";
};

const definitions: TermDefinition[] = [
  { key: "NEW", label: "New lead", meaning: "The business was found but has not been fully reviewed yet.", nextAction: "Open the lead and review its contact details and evidence.", group: "Lead" },
  { key: "RESEARCH", label: "Needs research", meaning: "Important lead information is still missing.", nextAction: "Find or verify its website, email, phone, or decision-maker.", group: "Lead" },
  { key: "OUTREACH_READY", label: "Ready to contact", meaning: "The lead has enough verified information for a reviewed first message.", nextAction: "Review the suggested offer and prepare outreach.", group: "Lead" },
  { key: "CONTACTED", label: "Contacted", meaning: "At least one outreach message has been sent.", nextAction: "Watch for a reply or follow the approved sequence.", group: "Lead" },
  { key: "REPLIED", label: "Replied", meaning: "The prospect has responded to your outreach.", nextAction: "Read the conversation and handle the recommended next action.", group: "Lead" },
  { key: "QUALIFIED", label: "Qualified", meaning: "The prospect appears to have a real need, fit, and path to a project.", nextAction: "Confirm scope, budget, decision-maker, and timing.", group: "Lead" },
  { key: "MEETING", label: "Meeting", meaning: "A sales conversation or discovery call is being arranged or completed.", nextAction: "Confirm the agenda and record the outcome.", group: "Lead" },
  { key: "PROPOSAL", label: "Proposal sent", meaning: "A formal offer or quotation is with the prospect.", nextAction: "Track acknowledgement and schedule a follow-up.", group: "Lead" },
  { key: "NEGOTIATION", label: "Negotiating", meaning: "Price, scope, terms, or delivery details are being discussed.", nextAction: "Resolve open terms without making unapproved promises.", group: "Lead" },
  { key: "WON", label: "Won", meaning: "The prospect accepted the deal.", nextAction: "Confirm payment terms and begin delivery onboarding.", group: "Lead" },
  { key: "LOST", label: "Lost", meaning: "The opportunity is no longer active.", nextAction: "Record the reason so future targeting improves.", group: "Lead" },

  { key: "PENDING_APPROVAL", label: "Needs approval", meaning: "A message is drafted but cannot be sent until you approve it.", nextAction: "Check the recipient, claims, offer, and wording before approving.", group: "Email" },
  { key: "AWAITING_APPROVAL", label: "Needs approval", meaning: "The campaign or action is waiting for your confirmation.", nextAction: "Review recipients and message content, then approve or reject it.", group: "Campaign" },
  { key: "APPROVED", label: "Approved", meaning: "You approved this action and it may now proceed.", nextAction: "No action is needed unless you want to cancel it before sending.", group: "Email" },
  { key: "QUEUED", label: "Waiting to send", meaning: "The message is safely waiting for the delivery worker.", nextAction: "Wait briefly or check email operations if it remains here.", group: "Email" },
  { key: "SCHEDULED", label: "Scheduled", meaning: "The message will be sent at the selected date and time.", nextAction: "You can reschedule or cancel it before the send time.", group: "Email" },
  { key: "PROVIDER_SUBMITTED", label: "Accepted by Gmail", meaning: "Gmail accepted the message for delivery, but final delivery is not yet confirmed.", nextAction: "Wait for delivery, reply, or bounce information.", group: "Email" },
  { key: "SENT", label: "Sent", meaning: "The provider sent the message successfully.", nextAction: "Wait for a reply or the next approved follow-up.", group: "Email" },
  { key: "DELIVERED", label: "Delivered", meaning: "The receiving mail system accepted the message where provider data supports this status.", nextAction: "Wait for engagement or follow-up at the planned time.", group: "Email" },
  { key: "OPENED", label: "Opened", meaning: "The recipient opened the tracked email. Tracking may not always be exact.", nextAction: "Do not overreact; use replies as the stronger buying signal.", group: "Email" },
  { key: "CLICKED", label: "Link clicked", meaning: "A tracked link in the message was opened.", nextAction: "Consider a relevant follow-up if the sequence permits it.", group: "Email" },
  { key: "BOUNCED", label: "Delivery failed", meaning: "The email could not be delivered. A hard bounce usually means the address is invalid.", nextAction: "Do not resend to the same address; research a verified replacement contact.", group: "Email" },
  { key: "HARD_BOUNCE", label: "Address invalid", meaning: "The receiving server says this email address is permanently undeliverable.", nextAction: "Keep it suppressed and find another verified contact.", group: "Email" },
  { key: "SOFT_BOUNCE", label: "Temporary delivery issue", meaning: "Delivery failed for a temporary reason such as a full inbox or server problem.", nextAction: "Wait for the controlled retry policy instead of sending manually.", group: "Email" },
  { key: "FAILED", label: "Failed", meaning: "The operation did not finish successfully.", nextAction: "Open its details, correct the cause, and retry only when safe.", group: "General" },
  { key: "CANCELLED", label: "Cancelled", meaning: "The action was stopped before completion.", nextAction: "No action is needed unless you intentionally want to recreate it.", group: "General" },
  { key: "READY", label: "Ready", meaning: "All required checks for this operation currently pass.", nextAction: "Review the final details and continue when you are satisfied.", group: "General" },
  { key: "BLOCKED", label: "Blocked", meaning: "A required safety, data, or setup condition is preventing this operation.", nextAction: "Open the surrounding details and resolve the listed blocker before retrying.", group: "General" },
  { key: "PENDING", label: "Waiting", meaning: "The operation has been created but has not completed yet.", nextAction: "Wait for its worker or review the associated approval requirement.", group: "General" },
  { key: "ACTIVE", label: "Active", meaning: "This workflow or account is currently enabled.", nextAction: "Monitor its results and pause it if conditions change.", group: "General" },
  { key: "PAUSED", label: "Paused", meaning: "The workflow is preserved but will not perform its next action.", nextAction: "Resume it only after confirming the lead and timing are still appropriate.", group: "General" },
  { key: "STOPPED", label: "Stopped", meaning: "The workflow has ended and no remaining steps should run.", nextAction: "Review the stop reason before creating any replacement workflow.", group: "General" },
  { key: "REVIEW", label: "Review needed", meaning: "Human judgment is required before the system can safely continue.", nextAction: "Inspect the evidence and choose the correct action.", group: "General" },
  { key: "CRITICAL", label: "Urgent", meaning: "This item has the highest current attention priority.", nextAction: "Review it before lower-priority work, while still verifying the underlying evidence.", group: "General" },
  { key: "HIGH", label: "High priority", meaning: "This item should be handled soon based on current signals.", nextAction: "Review the reason and take the recommended action when valid.", group: "General" },
  { key: "MEDIUM", label: "Medium priority", meaning: "This item matters but is not currently urgent.", nextAction: "Schedule it after high-priority work.", group: "General" },
  { key: "LOW", label: "Low priority", meaning: "Current signals do not justify immediate attention.", nextAction: "Keep it available for later review or further research.", group: "General" },

  { key: "VERIFIED", label: "Verified", meaning: "Strong evidence supports that this data is correct.", nextAction: "It is suitable for use, while still applying normal human judgment.", group: "Data" },
  { key: "PROBABLE", label: "Probably correct", meaning: "The data looks credible but does not yet have enough evidence for verified status.", nextAction: "Cross-check the official website or another trusted source before outreach.", group: "Data" },
  { key: "UNVERIFIED", label: "Not verified", meaning: "The system found this data but has not confirmed it.", nextAction: "Verify it before relying on it in outreach.", group: "Data" },
  { key: "CONFLICTING", label: "Conflicting data", meaning: "Different sources disagree about this field or business.", nextAction: "Inspect the evidence and choose the official or most recent value.", group: "Data" },
  { key: "STALE", label: "May be outdated", meaning: "This information has not been verified recently enough.", nextAction: "Refresh the lead before contacting it.", group: "Data" },
  { key: "QUARANTINED", label: "Held for review", meaning: "Suspicious data or a file was isolated so it cannot be trusted or used automatically.", nextAction: "Inspect it manually and approve only when you are certain it is safe.", group: "Data" },
  { key: "REJECTED", label: "Rejected", meaning: "A reviewer decided this data or action should not be used.", nextAction: "Review the reason before replacing or recreating it.", group: "Data" },

  { key: "PREPARING", label: "Preparing recipients", meaning: "The system is validating recipients and creating safe campaign messages.", nextAction: "Wait for preparation to finish, then review blocked and ready recipients.", group: "Campaign" },
  { key: "READY_TO_SEND", label: "Ready to launch", meaning: "Recipients and messages passed preparation and await final launch approval.", nextAction: "Review the sample and recipient count before launching.", group: "Campaign" },
  { key: "LAUNCHED", label: "Sending in progress", meaning: "The approved campaign is being processed under its sending limits.", nextAction: "Monitor delivery failures and replies; avoid starting a duplicate campaign.", group: "Campaign" },
  { key: "COMPLETE", label: "Complete", meaning: "The operation finished successfully.", nextAction: "Review the resulting leads, messages, or report.", group: "General" },
  { key: "COMPLETED", label: "Complete", meaning: "The campaign or workflow finished processing.", nextAction: "Review outcomes and decide the next follow-up action.", group: "Campaign" },
  { key: "SUPPRESSED", label: "Do not contact", meaning: "Sending is blocked for safety, unsubscribe, bounce, or policy reasons.", nextAction: "Do not bypass the block; review its recorded reason.", group: "Email" },
  { key: "CONNECTED", label: "Connected", meaning: "The mailbox account is authorized and available to the application.", nextAction: "Sync it when needed and monitor for revoked access or delivery errors.", group: "Email" },
  { key: "DISCONNECTED", label: "Disconnected", meaning: "The mailbox is not currently available for sending or synchronization.", nextAction: "Reconnect it through Google OAuth before attempting email operations.", group: "Email" },
  { key: "INVALID", label: "Invalid contact", meaning: "This contact point should not be used because validation or delivery evidence says it is wrong.", nextAction: "Find a different verified contact and leave this one suppressed.", group: "Email" },
  { key: "UNSUBSCRIBED", label: "Unsubscribed", meaning: "The recipient asked not to receive further outreach.", nextAction: "Do not contact this destination again.", group: "Email" },
  { key: "DO_NOT_CONTACT", label: "Do not contact", meaning: "Policy or consent state prohibits outreach to this destination.", nextAction: "Respect the block and do not try to bypass it through another campaign.", group: "Email" },
  { key: "UNMATCHED_REPLY", label: "Reply needs matching", meaning: "An incoming email could not be safely linked to an existing lead.", nextAction: "Attach it to the correct lead, create a lead, ignore it, or mark it as spam.", group: "Email" },

  { key: "CONFIDENCE", label: "Confidence", meaning: "How strongly the available evidence supports a specific conclusion. It is not a guarantee.", group: "General" },
  { key: "REVENUE_PRIORITY", label: "Revenue priority", meaning: "A ranking that combines trust, reachability, opportunity strength, value, and conversion likelihood.", group: "General" },
  { key: "ENRICHMENT", label: "Lead research", meaning: "The process of adding public website, contact, social, technology, and business information to a lead.", group: "Data" },
  { key: "EVIDENCE", label: "Evidence", meaning: "The source URL or captured fact supporting a data field or recommendation.", group: "Data" },
  { key: "SEQUENCE", label: "Follow-up sequence", meaning: "A controlled set of scheduled messages that stops on reply, bounce, suppression, or another exit condition.", group: "Email" }
];

export const TERMINOLOGY = Object.fromEntries(definitions.map((term) => [term.key, term])) as Record<string, TermDefinition>;
export const TERMINOLOGY_LIST = definitions;

export function normalizeTerm(value: string) {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function humanizeTerm(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function getTerm(value: string) {
  return TERMINOLOGY[normalizeTerm(value)];
}
