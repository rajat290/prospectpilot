# Phase 10 - Communication Intelligence and Sales Copilot

## Objective

Turn every inbound conversation into a grounded commercial decision without allowing AI to send messages, invent facts, or silently change CRM stages.

```text
Inbound message
-> deterministic safety rules
-> structured analysis
-> incremental summary
-> objection and meeting extraction
-> next-best action
-> grounded draft
-> operator approval
```

## Runtime Configuration

```env
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5.6"
INTELLIGENCE_AI_ENABLED="false"
INTELLIGENCE_REVIEW_THRESHOLD="70"
```

`INTELLIGENCE_AI_ENABLED` is an explicit privacy gate for automatic inbound analysis. A configured API key alone does not authorize private mailbox content to leave the local system. Manual Generate Reply actions remain explicit operator requests. When automatic AI is disabled, the key is unavailable, or a provider call fails, deterministic analysis remains operational and the decision is preserved in the audit trail. The threshold is a percentage from 0 to 100; lower-confidence results enter the review queue.

## Data Model

Phase 10 stores reply intelligence, incremental conversation summaries, recommended actions, objections, meeting intent, suggested replies, sales tasks, service packages, and AI run audits as separate records. Every AI run records its feature, model, prompt version, input hash, status, confidence, related evidence message IDs, and sanitized error state.

Data trust and commercial intelligence remain separate. A persuasive recommendation never upgrades the underlying evidence quality.

## Safety Rules

- Unsubscribe, wrong-contact, out-of-office, spam, and clear rejection rules execute before an LLM call.
- Unsubscribe immediately creates suppression and cancels pending messages and active sequences.
- AI stage changes are recommendations until an operator approves them.
- Generated replies always enter the existing approval queue; they are never sent directly.
- Approved service packages define allowed pricing and delivery boundaries.
- Unsupported prices, dates, guarantees, case studies, clients, capabilities, and unresolved placeholders produce blocking warnings.
- Low-confidence classifications stay visible in Sales Copilot review.
- Incremental summaries use the previous summary plus only newly received messages.

## Operator Surfaces

- `/inbox`: revenue action queue, intent, urgency, objections, meeting signals, summary, recommended action, and suggested reply controls.
- `/copilot`: intelligence review, action pressure, and approved service-package boundaries.
- `/`: Today Command Brief with replies requiring attention, commercial intent, stalled conversations, and pipeline planning range.
- `/leads/:id`: Lead 360 intelligence view tied to the complete communication history.

## API Surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/intelligence/status` | Provider and threshold status without exposing secrets |
| `POST` | `/messages/:id/analyze` | Queue inbound analysis |
| `POST` | `/intelligence/backfill` | Preview or queue historical inbound replies without intelligence |
| `GET` | `/intelligence/reviews` | Low-confidence review queue |
| `PATCH` | `/reply-intelligence/:id/review` | Approve or reject an analysis |
| `POST` | `/conversations/:id/suggested-replies` | Generate a grounded reply |
| `POST` | `/suggested-replies/:id/use` | Create an approval-queue draft |
| `POST` | `/recommended-actions/:id/approve` | Apply an operator-approved action or CRM recommendation |
| `POST` | `/recommended-actions/:id/dismiss` | Dismiss a recommendation with audit state |
| `PATCH` | `/sales-tasks/:id` | Update task workflow state |
| `GET/POST` | `/service-packages` | Read or define pricing boundaries |
| `PATCH` | `/service-packages/:id` | Edit or approve a package |
| `POST` | `/intelligence/stalled/run` | Run stalled-conversation detection |
| `GET` | `/command-brief` | Build the daily revenue brief |

## Acceptance Gates

- Every synchronized inbound reply queues analysis exactly once.
- Deterministic safety categories remain independent of the model.
- Structured classifications persist confidence, sentiment, intent, urgency, questions, and evidence IDs.
- Low-confidence results enter review.
- Conversation summaries update incrementally.
- Objections and meeting intent create auditable records and suitable tasks.
- Suggested replies use company evidence, conversation context, and approved package boundaries.
- Missing commercial facts create placeholders or warnings.
- Recommendations require approval before CRM mutation.
- Replies continue to stop communication sequences before intelligence processing.
- Stalled conversations create alerts without duplicate tasks.
- Today Command Brief ranks revenue work without presenting planning estimates as quotations.

## Controlled Pilot

Start with 5 to 10 manually reviewed prospects. Record delivery rate, reply rate, classification accuracy, draft edit rate, time saved, meetings, bounces, and unsubscribes. Keep all drafts approval-gated until observed classification and edit rates justify narrower automation.

Mass outreach is not a Phase 10 acceptance test. Sending volume must follow mailbox reputation, provider limits, consent, suppression, and applicable market rules.
