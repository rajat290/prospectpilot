# ProspectPilot AI

ProspectPilot turns public business directories into prioritized, outreach-ready freelance opportunities.

## Current Product Snapshot

The local operating cockpit now includes lead discovery, data review, Gmail outreach, Inbox triage, deal tracking, and Sales Copilot recommendations:

- Cross-source company identity fingerprints and duplicate matching
- Field-level evidence ledger with origin URL, extraction method, confidence, and review state
- Verified, probable, unverified, conflicting, stale, and rejected trust states
- Automatic completeness scoring, quality issues, and suspicious-lead quarantine
- Normalized contact values and explicit decision-maker extraction from structured website evidence
- Connector run diagnostics, acceptance ratios, duplicate counts, and health history
- Interactive Lead 360 workspace with Summary, Contact details, Why we trust it, Sales opportunity, Messages, and Timeline tabs
- Data quality review queue and global attention drawer
- Provider-neutral conversations, messages, recipients, events, templates, approvals, schedules, suppressions, and sequences
- Gmail OAuth adapter, encrypted token storage, threaded RFC email submission, history sync, and push-webhook ingestion
- Approval-first Inbox and Lead 360 composer with exact contact/thread matching
- Contacted and Replied CRM transitions recorded from real communication events
- Demo communication fixtures that exercise replies, pending approvals, sequences, and suppression without sending email
- Unmatched inbound review with candidate evidence and attach/create/ignore/spam actions
- Safe attachment storage with MIME/size policy, filename sanitization, SHA-256 deduplication, scan state, and signed downloads
- Timezone-aware schedule, reschedule, cancel, and failed-send retry controls
- Delivery/bounce analytics with hard-bounce invalidation, suppression, pending-message cancellation, and sequence exit
- Approval-gated sequence activation, enrollment, pause/resume/stop, due-step drafting, and reply/commercial exit rules
- Twenty-minute Gmail history reconciliation in addition to optional Pub/Sub push sync
- Non-secret Gmail lifecycle diagnostics, forced refresh test, provider revocation, reconnect-safe account identity, and connection event history
- Campaign readiness with explicit trust, contactability, consent, suppression, prior-contact, and duplicate block reasons
- Up-to-100 recipient preparation with two typed approvals, explicit Gmail sender selection, paced scheduling, daily/per-domain limits, timezone windows, opt-out text, and cancellation

The wider cockpit also includes:

- Source ingestion through connector modules
- Company, contact, social, and website enrichment
- Website audits and technology detection
- Opportunity recommendations and 0-100 lead scoring
- Email, LinkedIn, WhatsApp, and follow-up drafts
- Lead filters and outreach-ready CSV export
- Lead detail, notes, reminders, and CRM pipeline
- Scheduled daily source runs, job history, retries, and daily reports
- Crawl caps, pacing, timeouts, and basic robots.txt checks

The rule-based intelligence engine and communication demo work without paid credentials. Live Gmail requires Google OAuth credentials; search-provider discovery and LLM analysis remain provider-backed upgrades.

## Email Settings

Generate an encryption key and configure Google OAuth in the root `.env`:

```text
COMMUNICATION_ENCRYPTION_KEY="<base64 32-byte key>"
GMAIL_CLIENT_ID="<google oauth client id>"
GMAIL_CLIENT_SECRET="<google oauth client secret>"
GMAIL_REDIRECT_URI="http://localhost:4000/communications/oauth/gmail/callback"
```

For automatic push sync, also configure a Gmail Pub/Sub topic and `GMAIL_WEBHOOK_TOKEN`. Without push configuration, the operator can still request mailbox sync from Email settings. Open `/email-settings`, connect Gmail, then use Inbox or a lead's Messages tab. Every new draft requires approval before it can enter the send queue.

See [Communication Security Runbook](./docs/COMMUNICATION_SECURITY.md) for Gmail operations, [Communication Acceptance](./docs/COMMUNICATION_ACCEPTANCE.md) for the completed real-provider evidence matrix, [Communication Intelligence](./docs/PHASE_10_COMMUNICATION_INTELLIGENCE.md) for the sales-copilot operating model, and the [Dependency Security Audit](./docs/DEPENDENCY_SECURITY_AUDIT_2026-08-02.md) before any public deployment.

For the current product verdict, operational inventory, readiness scorecard, campaign decision, and recommended next work, read the [Product Status Report](./docs/PRODUCT_STATUS_REPORT_2026-08-02.md).

## Official Website Discovery

The SerpAPI adapter is connected to the enrichment service. Add a SerpAPI key to the root `.env` file:

```text
SEARCH_PROVIDER="serpapi"
SEARCH_PROVIDER_API_KEY="your-serpapi-key"
```

Restart `npm run dev:all`, open Leads, and use **Discover 25 websites**. The action only queues leads that do not already have a website. Search candidates from directories, social networks, and common aggregators are rejected before official-domain scoring.

## First Local Run

Requirements:

- Node.js 20+
- Docker Desktop

```powershell
docker compose up -d
npm install
npm run prisma:generate
npm run db:push
npm run seed:demo
npm run seed:communications
npm run dev:all
```

Open:

- App: http://localhost:3000
- Interactive product guide: http://localhost:3000/guide
- Unified inbox: http://localhost:3000/inbox
- Email settings: http://localhost:3000/email-settings
- Campaigns: http://localhost:3000/campaigns
- API health: http://localhost:4000/health

The demo seed is idempotent and can be rerun without creating duplicate leads.

## Test Checklist

1. Open Today and confirm the daily report.
2. Open Leads, apply score/stage/contact filters, and export that view.
3. Open Data quality, select a lead, review its evidence, resolve issues, and verify trusted fields.
4. Open a lead, test all six workspace tabs, draft an email, update its stage, add a reminder, and save a note.
5. Open Deals and move a card using drag-and-drop or its stage menu.
6. Open Find leads and add a public directory with a conservative record cap.
7. Enable or pause daily automation and use Run now for a controlled manual crawl.
8. Open Automation to inspect jobs, retry failures, and refresh the daily report.
9. Open Inbox, inspect the seeded reply, then approve or reject the waiting demo draft.
10. In Email settings, review the connected mailbox, blocked contacts, reusable templates, and follow-up sequences.
11. Open Campaigns, inspect provider gates, eligible/blocked reasons, pacing policy, and the two-stage prepare/launch controls.

## Real Source: Car-Part

Use:

```text
https://www.car-part.com/Services/dealers.htm
```

Start with:

- Record limit: `25`
- Batch delay: `1000` ms
- Automation: off until the sample output is reviewed

The Car-Part connector extracts recycler name, official website, city, state, country, industry/category, source URL, and connector metadata. All companies then enter the shared enrichment pipeline.

## Commands

```powershell
npm run dev:all
npm run typecheck
npm test
npm run build
npm run seed:demo
npm run seed:communications
npm run backfill:spine
npm run db:push
docker compose ps
docker compose down
```

## Workspace

```text
apps/web       Next.js operator cockpit
apps/api       Fastify API and queue producer
apps/workers   BullMQ ingestion, enrichment, and automation worker
packages/*     communications, crawler, enrichment, scoring, opportunity, outreach, shared
prisma/        PostgreSQL schema and demo seed
```

See [ROADMAP.md](./ROADMAP.md) for the complete product phases and the exact implemented/deferred boundary.
