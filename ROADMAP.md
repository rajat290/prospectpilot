# ProspectPilot AI - Phase Wise Product Roadmap

## Current Milestone Status - Phase 9C Code Complete, Live Gmail Evidence Pending

Implemented and locally verified on July 27, 2026:

- Cross-source company identity and source observation history
- Evidence ledger for company, website, contact, social, technology, and opportunity fields
- Confidence, completeness, verification states, stale-data handling, and quarantine
- Normalized public contacts plus structured decision-maker extraction
- Connector run diagnostics, quality scoring, and degraded-source alerts
- Interactive Lead 360 tabs for identity, contacts, evidence, intelligence, and history
- Manual evidence verification/rejection and quality issue resolution
- Data Quality Control Center and global attention drawer
- Idempotent migration of all existing leads into the trust model
- Provider-neutral communication records for accounts, threads, messages, recipients, events, attachments, templates, approvals, schedules, suppression, preferences, and sequences
- Gmail OAuth adapter with encrypted token storage, RFC-compliant threaded email, mailbox history sync, push-webhook ingestion, and watch renewal
- Unified Inbox with lead context, reply classification, thread history, reusable templates, and approval-first composing
- Lead 360 Conversations tab and automatic CRM transitions for submitted mail and exact-match replies
- Pre-send trust, contactability, suppression, mailbox, approval, and idempotency checks
- Demo mailbox fixtures that can be tested safely without transmitting real email
- Unmatched inbound review with explicit operator resolution
- Safe local object storage, scan metadata, signed attachment downloads, and Gmail attachment ingestion
- Schedule/reschedule/cancel/retry controls tied to BullMQ
- Delivery and bounce analytics with hard-bounce suppression and sequence cancellation
- Approval-first operational sequence enrollment and step generation
- Periodic Gmail reconciliation alongside push/webhook sync
- Non-secret Gmail connection-event ledger, explicit token-refresh test, reconciliation test, provider revocation, and reconnect-safe mailbox identity
- Campaign readiness engine with trust, contactability, consent, suppression, prior-contact, and duplicate-enrollment checks
- Explicit Gmail sender selection, two-stage typed approval, 100-recipient hard cap, paced scheduling, daily/per-domain limits, timezone windows, and required opt-out text
- Campaign launch history, cancellation, CRM/reply/bounce exits, and send-time revalidation
- Dedicated Campaign Launch Center and Phase 9C acceptance report

The remaining Phase 9C gates are external: a dedicated Gmail mailbox must be connected with user-provided Google OAuth credentials, then the real send, reply, sync, match, CRM transition, refresh, disconnect/reconnect, and reconciliation loop must be witnessed. A first campaign also needs enough verified recipients and a properly authenticated sending domain. Simulated evidence is never accepted as real-provider evidence.

## Previous Milestone - Phase 1-8 Local Operating Cockpit

Implemented and locally verified on July 26, 2026:

- Connector-based directory ingestion with a tuned Car-Part connector and generic fallback
- Duplicate-safe company normalization and public contact/social extraction
- Website audit, technology detection, rule-based opportunity intelligence, and lead scoring
- Four manual outreach drafts per analyzed lead: email, LinkedIn, WhatsApp, and follow-up
- Filterable lead database, outreach-ready CSV export, lead detail, notes, reminders, and CRM stages
- Drag-and-select CRM pipeline board
- Source reruns, daily schedules, tracked jobs, retries, worker health, and daily reports
- Responsible crawl controls: record cap, pacing delay, request timeout, and basic robots.txt checks
- Idempotent demo workspace with 12 realistic leads for immediate product testing
- Responsive operator UI verified at desktop and mobile widths

Credential-dependent or intentionally deferred:

- SerpAPI-backed website discovery is implemented; live searches require `SEARCH_PROVIDER_API_KEY`
- LLM-generated business summaries and opportunity analysis; the current engine uses deterministic rules
- Browser-rendered crawling for JavaScript-only directories and deep pagination
- Automated outreach sending, which remains outside V1 by design
- Multi-user tenancy, billing, and production deployment from Phase 9 onward

This milestone is a complete local manual-outreach workflow, not the final SaaS product. The next production strike is real-source hardening: run capped samples from Car-Part and two additional connectors, review extraction accuracy, then add search and LLM provider adapters.

## Product Name

**ProspectPilot AI**

ProspectPilot AI converts public business directories, marketplaces, exhibitor lists, association pages, and business listings into qualified, outreach-ready sales opportunities.

The name is sellable because it clearly signals the outcome: it helps users find and navigate prospects. It is broader and more SaaS-friendly than "Lead Hunter AI", but still simple enough for an internal tool.

## Core Intention

Build this as an **internal revenue tool first**, with clean architecture so it can become a SaaS later without rebuilding from scratch.

The immediate goal is not to build every possible revenue intelligence feature. The immediate goal is:

> Turn public business sources into qualified freelance project opportunities as fast as possible.

For V1, the product should help us find businesses, understand their websites, detect problems, generate service opportunities, score leads, and export personalized outreach data.

V1 should **not** send emails, LinkedIn messages, WhatsApp messages, or automated DMs. Outreach sending can come later after the research and qualification engine proves value.

## Final Product Vision

ProspectPilot AI should eventually become a Revenue Intelligence Platform where a user can paste a source URL and receive:

- Company details
- Website
- Emails
- Phones
- Social profiles
- Technology stack
- Website quality audit
- Business summary
- Pain points
- Suggested service opportunities
- Lead score
- Personalized outreach angles
- CRM status
- Exportable sales database

The long-term product is not just a scraper. It is a system that answers:

> Which businesses should I contact, why should I contact them, what should I sell them, and what should I say?

## Strategy

### Internal Tool First

The first version should serve our own freelancing/business development workflow.

Primary users:

- Us
- Our freelance sales workflow
- Our future agency workflow

Primary target outcome:

- Generate qualified leads daily
- Find businesses with clear digital gaps
- Identify what service to pitch
- Export data for manual outreach
- Help reach revenue faster

### SaaS-Ready Later

Even though V1 is internal, we should avoid shortcuts that block SaaS later.

We should keep:

- Clean database schema
- Modular workers
- Source abstraction
- User/account model ready, even if single-user first
- Job queue design
- Audit logs
- Clear enrichment pipeline
- Exportable structured data
- API-first backend

We should delay:

- Billing
- Team accounts
- Public onboarding
- Email sending
- Complex permissions
- Marketplace integrations
- Heavy LinkedIn automation

## Recommended Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Table
- React Query

### Backend

- Node.js
- Fastify for speed and simplicity
- NestJS only if the backend becomes very large

### Database

- PostgreSQL
- Prisma ORM

### Workers

- BullMQ
- Redis
- Playwright
- Cheerio

### AI

- OpenAI for analysis, opportunity generation, and outreach drafts
- Optional later: Anthropic/Gemini fallback

### Search

- SerpAPI or similar provider for website discovery
- Manual provider abstraction so we can swap later

### Storage

- S3-compatible storage later for screenshots, raw HTML snapshots, exports, and reports

### Hosting

- Frontend: Vercel
- API/workers: Railway, Render, Fly.io, or VPS
- Crawler workers: Docker-ready from early phases

## High-Level Architecture

```text
User enters source URL
        |
        v
Source Manager creates ingestion job
        |
        v
Crawler extracts company records
        |
        v
Company enrichment pipeline
        |
        +--> Website discovery
        +--> Contact extraction
        +--> Website audit
        +--> Tech detection
        +--> AI business analysis
        +--> Opportunity generation
        +--> Lead scoring
        |
        v
CRM-style lead database
        |
        v
Review, filter, prioritize, export CSV
```

## Suggested Monorepo Structure

```text
apps/
  web/
  api/
  workers/

packages/
  crawler/
  enrichment/
  scoring/
  outreach/
  shared/

prisma/
  schema.prisma

docs/
  product/
  architecture/
  operations/
```

## Data Model

Core tables for V1:

- users
- lead_sources
- companies
- websites
- contacts
- socials
- technologies
- audits
- opportunities
- lead_scores
- outreach_drafts
- crm_items
- notes
- jobs

Important design rule:

Store both raw extracted data and normalized data.

For example:

- Raw phone/email found on page
- Normalized phone/email after cleanup
- Confidence score
- Source URL where it was found

This helps debugging and makes the system more trustworthy.

## Phase 0 - Foundation And Product Setup

### Goal

Create the technical foundation and lock the exact MVP scope.

### What We Build

- Monorepo setup
- Next.js web app
- Fastify API
- PostgreSQL + Prisma
- Redis + BullMQ
- Basic job system
- Basic auth-ready user model
- Environment config
- Shared types package
- Initial dashboard shell

### Modules Included

- Project foundation
- Database foundation
- Job queue foundation
- UI foundation

### Output

An app that runs locally with:

- Web dashboard
- API health check
- Database connection
- Worker process
- Background job demo

### Done Criteria

- Local dev environment works
- Prisma schema exists
- API can create a test job
- Worker can process a test job
- Web app can show basic dashboard layout

### Why This Phase Matters

This prevents messy growth. We are building internal-first, but not throwaway.

## Phase 1 - Directory To Company Extraction

### Goal

Take one public directory/listing URL and extract company records from it.

### What We Build

- Source Manager
- Source URL submission
- Crawler job creation
- Playwright page loader
- Cheerio HTML parser
- Basic structure detection
- Company extraction
- Pagination support for one known source pattern
- Confidence score per extracted company
- Raw HTML snapshot storage locally or in database

### Modules Included

- Source Manager
- Intelligent Crawler v1
- Job tracking

### Extracted Fields

- Company name
- Website if present
- Phone if present
- Email if present
- Address if present
- Category/industry if present
- Description if present
- Source URL
- Confidence score

### UI

- Add Source page
- Source detail page
- Crawl progress
- Extracted companies table
- Failed/skipped records view

### Output

User pastes one supported source URL and receives a table of companies.

### Done Criteria

- At least one real directory source works end to end
- Extracted records are saved in database
- Crawl progress is visible
- Failed pages are logged
- Duplicate companies are handled

### Business Value

This is the first moment the tool becomes useful. Even without AI, it saves manual copy-paste time.

## Phase 2 - Website Discovery And Contact Extraction

### Goal

For every company, find or verify its official website and extract public contact details.

### What We Build

- Website discovery job
- Search provider integration
- Official website confidence scoring
- Homepage crawler
- Contact page discovery
- Email extraction
- Phone extraction
- Social link extraction
- Contact confidence score

### Modules Included

- Website Discovery
- Contact Intelligence v1
- Social extraction

### Website Discovery Logic

Search query examples:

- `{company name} official website`
- `{company name} {city} website`
- `{company name} contact`

Signals for confidence:

- Domain name matches company name
- Website mentions company name
- Address/city matches
- Directory listing links to same site
- Social profiles point to same domain

### Contact Extraction Sources

- Homepage
- Contact page
- About page
- Footer
- Schema.org metadata
- `mailto:` links
- `tel:` links
- Public social links

### UI

- Enrichment status per company
- Website confidence indicator
- Contacts table
- Manual correction fields

### Output

Each company has website, email, phone, and social links where publicly available.

### Done Criteria

- Website discovery works for companies without URLs
- Emails and phones are extracted from real sites
- Confidence score is stored
- User can filter by leads with email/phone
- User can manually edit incorrect details

### Business Value

This turns raw company names into contactable leads.

## Phase 3 - Website Audit And Technology Detection

### Goal

Analyze each company website and detect digital weaknesses we can sell services around.

### What We Build

- Website audit worker
- Basic performance signals
- HTTPS detection
- Mobile/responsive signal
- CMS/framework detection
- Contact form detection
- Live chat/chatbot detection
- Analytics/pixel detection
- Cookie banner detection
- Broken link sampling
- Screenshot capture later if needed

### Modules Included

- Website Auditor
- Technology Detection

### Audit Fields

- Page title
- Meta description
- HTTPS status
- Mobile viewport support
- Contact form present
- Live chat present
- AI chatbot present
- Analytics present
- Facebook/Meta pixel present
- Google tag present
- CMS/framework
- Ecommerce platform
- Broken link count
- Load status
- Final URL

### Technology Detection

Detect common technologies:

- WordPress
- Shopify
- WooCommerce
- Magento
- React
- Next.js
- Vue
- Angular
- Laravel
- PHP
- ASP.NET
- Node.js
- Django
- Wix
- Webflow
- Squarespace

### UI

- Website audit tab
- Tech badges
- Problem indicators
- Filter: WordPress, no HTTPS, no contact form, no chat, outdated site, etc.

### Output

Each company now has technical context and visible opportunity signals.

### Done Criteria

- Audit runs in background
- Website status and tech stack are saved
- User can filter leads by website weaknesses
- Failed audits are retried or marked clearly

### Business Value

This helps decide what to sell before writing outreach.

## Phase 4 - AI Business Analysis And Opportunity Engine

### Goal

Use AI to understand the business and generate practical service opportunities.

### What We Build

- AI analysis worker
- Website content extraction
- Business summary generation
- Target customer inference
- Revenue model inference
- Pain point detection
- Opportunity generation
- Suggested service package
- Personalized reasoning

### Modules Included

- AI Website Analysis
- Opportunity Engine

### AI Output

For every company:

- Business summary
- What they sell
- Who they serve
- Digital maturity level
- Problems visible from website
- Automation opportunities
- Growth opportunities
- Best service to pitch
- Why this service makes sense
- Suggested first message angle

### Opportunity Categories

- Website redesign
- Website speed improvement
- SEO
- Local SEO
- Booking system
- CRM setup
- AI chatbot
- WhatsApp automation
- Inventory system
- Internal dashboard
- Analytics setup
- Ecommerce improvement
- Payment integration
- Lead capture funnel
- Custom software

### UI

- Opportunity tab per lead
- AI-generated recommendation
- Opportunity category filters
- High-value opportunity list

### Output

The app tells us what to pitch and why.

### Done Criteria

- AI analysis runs for enriched companies
- Results are saved and viewable
- User can regenerate analysis
- User can filter by opportunity category
- User can see AI reasoning without opening the website manually

### Business Value

This is the core moat. The product moves from "lead database" to "sales intelligence."

## Phase 5 - Lead Scoring And Prioritization

### Goal

Score every lead so we know who to contact first.

### What We Build

- Rule-based scoring engine
- AI-assisted score explanation
- Score breakdown
- Priority levels
- Best leads dashboard

### Modules Included

- Lead Scoring
- Prioritization Dashboard

### Initial Scoring Formula

Score out of 100:

- Website exists: 10
- Contact found: 15
- Clear business category: 10
- Website has visible issues: 15
- Service opportunity exists: 20
- High-value industry: 10
- Decision maker/contact signal: 10
- Digital maturity gap: 10

This formula should stay simple at first. Later we can improve it using reply rate, meetings booked, and won projects.

### Priority Bands

- 80-100: Hot
- 60-79: Qualified
- 40-59: Needs review
- 0-39: Low priority

### UI

- Lead score column
- Score breakdown modal
- Hot leads dashboard
- Filters by score and opportunity

### Output

The user can open the dashboard and immediately know which leads deserve attention.

### Done Criteria

- Every enriched lead receives a score
- Score breakdown is stored
- User can sort/filter by score
- User can manually override priority

### Business Value

This saves time and helps focus outreach on leads most likely to convert.

## Phase 6 - Outreach Drafts And CSV Export

### Goal

Generate personalized outreach material but keep sending manual.

### What We Build

- Outreach draft generator
- Cold email draft
- LinkedIn message draft
- WhatsApp message draft
- Follow-up draft
- CSV export
- Export field selection

### Modules Included

- Outreach Generator
- Export

### Outreach Fields

- Subject line
- Cold email
- Short LinkedIn message
- WhatsApp-style short pitch
- Follow-up message
- Suggested offer
- Personalization reason

### Export Fields

- Company name
- Website
- Email
- Phone
- Industry
- Location
- Score
- Priority
- Opportunity
- Recommended service
- Outreach angle
- Cold email
- LinkedIn message
- Source URL

### UI

- Outreach tab
- Regenerate draft button
- Copy buttons
- CSV export button
- Export history

### Output

The user receives a ready-to-review lead list with personalized pitch material.

### Done Criteria

- Outreach draft generated per qualified lead
- User can copy messages
- CSV export works
- Exported CSV can be used in external CRM/outreach tools

### Business Value

This is the first complete money-making version.

## Phase 7 - CRM-Lite Workflow

### Goal

Track outreach and deal progress manually inside the app.

### What We Build

- Pipeline statuses
- Notes
- Tags
- Reminders
- Timeline
- Manual activity log
- Lead ownership-ready model

### Modules Included

- CRM
- Notes
- Reminders

### Pipeline Statuses

- New
- Research
- Qualified
- Outreach Ready
- Contacted
- Replied
- Meeting
- Proposal
- Won
- Lost
- Retainer

### UI

- CRM board
- Lead detail page
- Notes panel
- Status updates
- Reminder date
- Basic search

### Output

The app becomes a working internal sales cockpit.

### Done Criteria

- Leads can move through statuses
- Notes are saved
- Reminders are visible
- User can search and filter pipeline

### Business Value

This helps manage actual freelance conversations and prevents leads from getting lost.

## Phase 8 - Daily Automation

### Goal

Make the system run daily and prepare leads for review.

### What We Build

- Scheduled source crawls
- Daily enrichment jobs
- Daily summary dashboard
- Job retry handling
- Daily report

### Modules Included

- Automation
- Daily Reporter
- Job Reliability

### Daily Report Example

```text
150 leads found
72 qualified
18 high priority
34 emails found
41 phones found
Top opportunity: Website modernization
Best lead: ABC Manufacturing
```

### UI

- Automation settings
- Daily report page
- Worker/job health panel

### Output

Every morning, the system has new leads ready for review.

### Done Criteria

- Scheduled jobs run
- Daily report is generated
- Failed jobs are visible
- User can pause/resume source automation

### Business Value

This makes lead generation consistent instead of effort-based.

## Phase 9 - Unified Communication Hub

### Goal

Turn ProspectPilot into the daily outreach command center while preserving trust, consent, and a complete lead history.

### Phase 9A - Communication Core And Gmail

- Provider-neutral domain model and adapter contract
- Gmail server-side OAuth with encrypted refresh tokens
- Conversation and message normalization
- Exact email/contact and provider-thread matching
- Inbox, Lead 360 composer, reusable templates, and approval queue
- Scheduled BullMQ submission with idempotency and retry controls
- Suppression, unsubscribe, bounce, complaint, and do-not-contact safety states
- Gmail history sync, push events, watch renewal, and fallback polling
- CRM Contacted and Replied transitions from actual events

### Phase 9B - Reliable Operator Workflow

- [x] Attachment object storage and malware/type validation hook
- [x] Draft attachments, explicit scheduling UI, and cancel/reschedule controls
- [x] Sent, bounce, reply, and failure analytics available from current provider evidence
- [x] Manual review queue for unmatched inbound conversations
- [x] Contactability analytics and mailbox health alerts
- [x] Sequence enrollment, approval, pause/resume/stop, reply exits, and commercial exit rules
- [ ] Live Gmail Connect → Send → Reply → Sync acceptance test with user-provided credentials

### Phase 9C - Live Gmail Activation And Campaign Acceptance

- [x] Non-secret connection lifecycle audit and credential readiness diagnostics
- [x] Forced refresh, reconciliation, disconnect, provider revoke, and reconnect-safe mailbox identity controls
- [x] Existing outbound Gmail sync promotion from `PROVIDER_SUBMITTED` to `SENT`
- [x] Real-NDR cancellation of pending follow-ups and sequence exits
- [x] Campaign eligibility preview with explicit block reasons
- [x] Bulk preparation and approval-gated enrollment for up to 100 recipients
- [x] Explicit sender mailbox, daily/per-domain caps, send windows, pacing, opt-out text, and send-time revalidation
- [x] Campaign cancellation, audit history, and operator launch UI
- [ ] Real Gmail OAuth and complete acceptance run with user-provided credentials
- [ ] First real campaign launch after domain and recipient readiness checks

### Done Criteria

- Operator sends an approved email from Lead 360 through a connected Gmail account
- A Gmail reply syncs into the correct lead and conversation without weak matching
- Timeline and CRM state move from Contacted to Replied
- Suppressed, unapproved, stale/conflicting, bounced, or duplicate sends are blocked
- Missing provider events are recoverable through history sync

### Business Value

The operator can research, communicate, and follow up from one trustworthy workspace without turning the product into a spam tool.

## Phase 10 - SaaS Preparation

### Goal

Prepare the internal tool for external users without changing the product core.

### What We Build

- Multi-user support
- Workspace/account model
- Role-ready permissions
- Usage tracking
- Source/job quotas
- Better onboarding
- Billing-ready architecture
- Admin dashboard

### Modules Included

- Accounts
- Workspaces
- Usage
- Admin

### Output

The app becomes ready for beta users.

### Done Criteria

- Multiple users can use isolated workspaces
- Data is tenant-safe
- Usage is tracked
- Admin can view system health

### Business Value

This prepares the product for SaaS monetization after internal validation.

## Phase 11 - Advanced Sources And Integrations

### Goal

Expand input sources and connect the system to external tools.

### What We Build

- Google Maps source
- Better directory auto-detection
- Product Hunt/startup lists
- Marketplace seller lists
- CRM export integrations
- Webhook export
- Optional Google Sheets export

### Modules Included

- Advanced Source Manager
- Integrations

### Future Sources

- Google Maps
- LinkedIn company URLs, with care around compliance
- Product Hunt
- IndiaMART
- Udaan
- Yellow Pages
- Clutch
- GoodFirms
- Trade show lists
- Association member directories
- Marketplace sellers

### Output

The product supports more sources and becomes flexible for different users.

### Done Criteria

- At least 3 source types work reliably
- Export integrations work
- Source parser system is modular

### Business Value

This makes the product more SaaS-worthy and useful across industries.

## Phase 12 - Advanced Outreach Automation

### Goal

Only after V1 is stable, add controlled outreach workflows.

### What We Build

- Email provider integration
- Sending limits
- Unsubscribe support
- Reply tracking
- Bounce tracking
- Deliverability safeguards
- Campaign approval flow

### Important Warning

This phase should not happen early.

Outreach sending brings serious complexity:

- Domain reputation
- Spam rules
- Compliance
- Bounce handling
- Unsubscribe management
- Provider limits
- Account bans
- Reply parsing

### Output

Users can send approved campaigns from the app.

### Done Criteria

- Sending is compliant
- Unsubscribe works
- Sending limits exist
- Reply/bounce tracking works
- User approval is required before sending

### Business Value

This turns the platform from research intelligence into a full outbound system.

## Fastest Path To Revenue

The fastest useful version is:

```text
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6
```

That gives us:

- Source URL input
- Business extraction
- Website discovery
- Contact extraction
- Website audit
- Tech detection
- AI opportunity
- Lead score
- Outreach draft
- CSV export

This is enough to start freelancing outreach.

## First Commercial Use Case

Start with service offers that are easy to understand and sell:

- Website redesign
- Website modernization
- Local SEO
- Appointment booking system
- AI chatbot
- WhatsApp automation
- CRM setup
- Internal dashboard
- Ecommerce improvement
- Lead capture system

Best early target businesses:

- Clinics
- Dentists
- Schools/coaching centers
- Real estate agencies
- Manufacturers
- Local service businesses
- Consultants
- Small ecommerce sellers
- B2B suppliers

These businesses often have visible website gaps and clear service needs.

## MVP Definition

The MVP is complete when we can:

1. Paste a directory URL.
2. Extract at least 100 companies.
3. Find websites for most companies.
4. Extract public emails/phones where available.
5. Audit each website.
6. Generate one clear service opportunity per company.
7. Score each lead.
8. Export a CSV with personalized outreach drafts.
9. Use that CSV to start manual outreach.

## MVP Success Metric

The first success metric is not number of features.

The first success metric is:

> Can one person generate 100 outreach-ready leads in one day?

Target milestones:

- Manual process: 15 leads/day
- MVP target: 100 leads/day
- Stable internal target: 500 qualified leads/day
- SaaS target: multiple users generating qualified pipelines from different sources

## Build Order Summary

### Must Build First

- App foundation
- Source ingestion
- Crawler
- Company database
- Website discovery
- Contact extraction
- Website audit
- AI opportunity generation
- Lead score
- CSV export

### Build Soon After

- CRM-lite
- Daily automation
- Better filters
- Notes
- Reminders
- Export history

### Build Later

- Google Maps
- LinkedIn enrichment
- Funding data
- Traffic estimation
- Screenshot capture
- Multi-user SaaS
- Billing
- Outreach sending

## What We Should Avoid Early

- Building email sending too soon
- Building too many source types at once
- Overengineering AI agents
- Making scoring too complex
- Building SaaS billing before internal success
- Scraping LinkedIn aggressively
- Spending weeks on UI polish before the pipeline works

## Practical Development Milestones

### Milestone 1

Local app runs with database, API, worker, and dashboard.

### Milestone 2

User submits a source URL and crawler extracts company records.

### Milestone 3

System enriches companies with website, email, phone, and social links.

### Milestone 4

System audits websites and detects technologies.

### Milestone 5

AI generates business analysis and sales opportunities.

### Milestone 6

Lead scoring and prioritization dashboard works.

### Milestone 7

Outreach drafts and CSV export work.

### Milestone 8

CRM-lite workflow works.

### Milestone 9

Daily automation prepares new leads automatically.

### Milestone 10

SaaS-ready multi-user foundation is added.

## Development Philosophy

Build the money machine first.

Do not wait for the perfect platform. The early product should answer:

- Who should we contact?
- What do they need?
- Why are they a good lead?
- How should we pitch them?

Once that works, everything else becomes easier.

## Immediate Next Step

Start Phase 0.

Recommended first implementation task:

> Scaffold the monorepo with Next.js web app, Fastify API, PostgreSQL/Prisma schema, Redis/BullMQ worker, and a basic dashboard shell.

After that, move directly into Phase 1 and choose the first real directory source to support.
