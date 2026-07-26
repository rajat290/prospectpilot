# ProspectPilot AI

ProspectPilot turns public business directories into prioritized, outreach-ready freelance opportunities.

## Current Milestone

The local Phase 1-8 operating cockpit includes:

- Source ingestion through connector modules
- Company, contact, social, and website enrichment
- Website audits and technology detection
- Opportunity recommendations and 0-100 lead scoring
- Email, LinkedIn, WhatsApp, and follow-up drafts
- Lead filters and outreach-ready CSV export
- Lead detail, notes, reminders, and CRM pipeline
- Scheduled daily source runs, job history, retries, and daily reports
- Crawl caps, pacing, timeouts, and basic robots.txt checks

The rule-based intelligence engine works without paid credentials. Search-provider website discovery and LLM analysis are the next provider-backed upgrades.

## Official Website Discovery

The SerpAPI adapter is connected to the enrichment worker. Add a SerpAPI key to the root `.env` file:

```text
SEARCH_PROVIDER="serpapi"
SEARCH_PROVIDER_API_KEY="your-serpapi-key"
```

Restart `npm run dev:all`, open Lead database, and use **Discover 25 websites**. The action only queues leads that do not already have a website. Search candidates from directories, social networks, and common aggregators are rejected before official-domain scoring.

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
npm run dev:all
```

Open:

- App: http://localhost:3000
- Interactive product guide: http://localhost:3000/guide
- API health: http://localhost:4000/health

The demo seed is idempotent and can be rerun without creating duplicate leads.

## Test Checklist

1. Open Overview and confirm 12 demo leads and the daily report.
2. Open Lead database, apply score/stage/contact filters, and export that view.
3. Open a lead, copy each outreach draft, update its stage, add a reminder, and save a note.
4. Open Deal pipeline and move a card using drag-and-drop or its stage menu.
5. Open Sources and add a public directory with a conservative record cap.
6. Enable or pause daily automation and use Run now for a controlled manual crawl.
7. Open Automation to inspect jobs, retry failures, and refresh the daily report.

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
npm run db:push
docker compose ps
docker compose down
```

## Workspace

```text
apps/web       Next.js operator cockpit
apps/api       Fastify API and queue producer
apps/workers   BullMQ ingestion, enrichment, and automation worker
packages/*     crawler, enrichment, scoring, opportunity, outreach, shared
prisma/        PostgreSQL schema and demo seed
```

See [ROADMAP.md](./ROADMAP.md) for the complete product phases and the exact implemented/deferred boundary.
