# Real Revenue Campaign Mode PRD

## Document Purpose

This PRD defines ProspectPilot's Real Revenue Campaign Mode: a focused operating mode for running real, revenue-seeking freelance outreach campaigns without demo data, test fixtures or misleading vanity metrics.

The purpose is not to make ProspectPilot look more impressive. The purpose is to help Rajat Tomar run disciplined campaigns that can produce replies, meetings, proposals and paid projects.

## Product Truth

ProspectPilot currently has strong internal infrastructure:

- Lead ingestion and enrichment
- Lead 360 workspace
- Gmail send, reply sync, thread matching and CRM history
- Campaign readiness checks
- Communication intelligence
- Founder mission dashboard

But real business progress is still weak because the current workspace mixes real leads, demo leads, acceptance fixtures, low-reachability sources and small outbound samples.

Real Revenue Campaign Mode fixes that by creating a strict business-only lane:

```text
Real target market
  -> real qualified leads
  -> approved offer-aware outreach
  -> controlled sending
  -> reply and bounce tracking
  -> meeting/proposal/won pipeline
  -> clean learning loop
```

## North Star

Help Rajat answer this every day:

> Which real prospects should I contact, what should I offer them, who replied, what should I do next and how close am I to paid work?

## Primary Outcome

The first version is successful when Rajat can run a controlled 100-lead real campaign and see an honest funnel:

```text
100 selected prospects
  -> qualified real leads
  -> approved recipients
  -> sent emails
  -> bounces
  -> replies
  -> positive replies
  -> meetings
  -> proposals
  -> won revenue
```

The system must make weak campaign performance understandable, not hide it.

## Product Position

Before this mode:

> ProspectPilot can extract, enrich, communicate and track leads.

After this mode:

> ProspectPilot can run real revenue experiments with clean qualification, approved outreach and reliable campaign analytics.

## Target User

Initial target user:

- Rajat Tomar
- Freelance/software service founder
- Wants foreign-paying clients
- Wants the software to handle everything around business development except actual project delivery
- Needs clarity, speed and disciplined execution

Future target users:

- Solo agencies
- Small dev shops
- B2B service founders
- Sales-assisted freelancers

## Core Problem

The current lead workspace has three business risks:

1. Demo/test records can look like business progress.
2. Lead counts can look good even when reachable contacts are weak.
3. Sent email counts are too small and unstructured to judge offer-market fit.

Real Revenue Campaign Mode must separate:

- Real vs demo/test data
- Qualified vs merely extracted leads
- Reachable vs uncontactable contacts
- Sent vs delivered vs bounced vs replied
- Interested replies vs noise
- Pipeline value vs collected revenue

## First Campaign Strategy

The mode should support worldwide campaigns later, but the first revenue experiment must be narrow.

Recommended first wedge:

```text
Market: US + Canada
Business type: local service businesses
Offer family: lead intake, quote workflow, booking workflow, CRM routing, follow-up automation
Campaign size: 100 qualified real prospects
Goal: 3-5 replies, 1 meeting, 1 proposal opportunity
Sender: Rajat Tomar
Mailbox: dedicated Gmail sending mailbox
```

Suggested industries for early experiments:

- HVAC contractors
- Roofing contractors
- Remodeling contractors
- Auto repair shops
- Dental clinics
- Med spas
- Law firm intake teams
- Real estate agencies
- B2B suppliers with quote requests

Avoid initially:

- Large enterprises
- Directories with weak email coverage
- Sources dominated by phone-only records
- Markets where the offer cannot be personalized with visible evidence

## Definition of Real Lead

A lead is real only when all required checks pass:

- Company name is not demo/test/fixture data.
- Website or official business page exists.
- Country/market matches the campaign.
- Industry/category matches the campaign.
- At least one usable contact method exists.
- Email is not suppressed, bounced, unsubscribed or marked do-not-contact.
- Company has a plausible business pain or opportunity.
- Company is not a duplicate of an existing active campaign recipient.
- Prior contact history does not make the outreach inappropriate.

Optional but preferred:

- Public evidence supports the recommended offer.
- Contact role or department is known.
- Phone and address match across sources.
- Website audit found a concrete workflow gap.

## Campaign Object

Each campaign should have:

- Name
- Mode: `REAL_REVENUE`
- Market/country
- Industry or segment
- Offer family
- Primary service
- Target recipient role
- Campaign goal
- Sender identity
- Sending mailbox
- Daily send cap
- Batch send cap
- Timezone window
- Approval policy
- Safety policy
- Status
- Created date
- Launch date
- Completed date

Suggested statuses:

```text
DRAFT
QUALIFYING
READY_FOR_REVIEW
ACTIVE
PAUSED
COMPLETED
ARCHIVED
```

## Campaign Lead States

Each campaign lead should have a campaign-specific state:

```text
IMPORTED
NEEDS_RESEARCH
DISQUALIFIED
READY_TO_APPROVE
APPROVED
DRAFTED
SCHEDULED
SENT
BOUNCED
REPLIED
INTERESTED
MEETING
PROPOSAL
WON
LOST
SUPPRESSED
```

These states should not replace the existing CRM stage. They are campaign-level states for funnel analytics.

## Disqualification Reasons

The system must store why a lead cannot enter a real campaign.

Common reasons:

- Demo or test record
- Missing email
- Missing website
- Invalid website
- Country mismatch
- Industry mismatch
- Already contacted recently
- Existing active conversation
- Suppressed contact
- Bounced contact
- Unsubscribed contact
- Duplicate company
- Weak opportunity evidence
- Low data trust
- No responsible outreach angle

## Qualification Scoring

Real campaign qualification should produce separate scores:

### Data Trust Score

How reliable is the identity and contact data?

### Contactability Score

How reachable is the prospect?

### Opportunity Score

How strong is the visible business pain?

### Market Fit Score

How well does the lead match the campaign segment?

### Outreach Readiness Score

How safe and prepared is this lead for outbound contact?

### Revenue Priority

Recommended ranking:

```text
Revenue Priority =
Data Trust
* Contactability
* Opportunity Strength
* Market Fit
* Estimated Value
* Conversion Likelihood
```

Trust score must not be mixed blindly with commercial fit. A lead can be accurate but commercially weak.

## Campaign Workflow

### Step 1 - Create Campaign

Rajat chooses:

- Market
- Industry
- Offer family
- Goal
- Sender mailbox
- Daily limit
- Review strictness

System creates a draft campaign.

### Step 2 - Select Candidate Leads

Sources:

- Existing qualified leads
- Fresh connector output
- Manual imports
- Future search-provider discoveries

The system filters out demo/test and unsafe records.

### Step 3 - Qualification Gate

Each lead receives:

- Eligibility status
- Scores
- Rejection reasons if blocked
- Evidence notes
- Recommended outreach angle

### Step 4 - Review Queue

UI groups leads:

- Ready to approve
- Needs research
- Missing contact
- Suppressed
- Duplicate
- Weak opportunity

Rajat approves only leads that should actually receive outreach.

### Step 5 - Generate Drafts

For approved leads, the system generates offer-aware drafts:

- Subject
- Short opening
- Specific observed problem
- Proposed improvement
- Soft CTA
- Sender signature
- Opt-out text where needed

No fake client names, fake case studies, fake claims or unsupported discounts.

### Step 6 - Launch Batch

Only approved drafts can be launched.

Before send, system revalidates:

- Mailbox connected
- Contact not suppressed
- Contact not bounced
- No duplicate send
- Daily cap not exceeded
- Time window valid
- Approval exists
- Message has required identity/signature

### Step 7 - Monitor

Campaign cockpit shows:

- Sent
- Queued
- Cancelled
- Bounced
- Replied
- Positive replies
- Needs reply
- Meetings
- Proposals
- Won/lost

### Step 8 - Act

Replies flow into:

- Inbox
- Lead 360
- Campaign cockpit
- Recommended actions

The system should surface:

- Reply now
- Send pricing
- Ask qualification question
- Propose meeting
- Stop sequence
- Mark not interested
- Mark wrong contact
- Suppress

### Step 9 - Learn

After every campaign, system stores:

- Best performing segment
- Best offer angle
- Bounce causes
- Reply categories
- Suggested changes
- Next campaign recommendation

## UI Requirements

### Navigation

Add a business-focused page:

```text
Revenue Campaigns
```

It should be separate from decorative mission/overview UI.

### Page 1 - Campaign List

Show:

- Active campaigns
- Draft campaigns
- Completed campaigns
- Market
- Offer
- Audience size
- Sent
- Reply rate
- Positive replies
- Meetings
- Pipeline value
- Won revenue

### Page 2 - Create Campaign Wizard

Steps:

1. Market and segment
2. Offer and goal
3. Lead source selection
4. Sending policy
5. Review and create

### Page 3 - Qualification Queue

Columns:

- Company
- Country
- Industry
- Website
- Contact
- Trust
- Contactability
- Opportunity
- Market fit
- Recommended angle
- Status
- Approve/reject

Filters:

- Ready
- Needs research
- Missing email
- Suppressed
- Bounced
- Duplicate
- Weak opportunity

### Page 4 - Campaign Cockpit

Top metrics:

- Selected
- Qualified
- Approved
- Sent
- Bounced
- Replies
- Positive replies
- Meetings
- Proposals
- Won

Core panels:

- Funnel
- Reply queue
- At-risk leads
- Bounce reasons
- Best-performing angles
- Next actions

### Page 5 - Lead Campaign Detail

Show campaign-specific history:

- Why this lead was selected
- Why this offer was suggested
- Evidence
- Drafts
- Send events
- Replies
- Current next action
- Final outcome

## Metrics

### Funnel Metrics

- Selected leads
- Qualified leads
- Approved leads
- Drafted messages
- Scheduled messages
- Sent messages
- Delivered/submitted messages
- Bounces
- Replies
- Positive replies
- Meeting requests
- Proposals
- Won deals
- Lost deals

### Quality Metrics

- Email coverage rate
- Bounce rate
- Reply rate
- Positive reply rate
- Meeting conversion rate
- Proposal conversion rate
- Won conversion rate
- Average time to first reply
- Average time to operator response
- Suggested-reply edit rate
- Disqualification breakdown

### Business Interpretation

The UI should explain what the numbers mean.

Examples:

```text
Bounce rate above 8% means the list quality is weak.
Reply rate below 2% means the segment or message likely needs adjustment.
Positive replies without meetings means follow-up handling needs improvement.
Many missing emails means this source is poor for email campaigns.
```

## Safety and Compliance Guardrails

Real Revenue Campaign Mode must not become a blind spam machine.

Required guardrails:

- Approval-first launch
- Suppression checks
- Bounce checks
- Duplicate-send protection
- Daily send cap
- Per-domain pacing
- Sender identity present
- Opt-out handling
- No outreach to suppressed contacts
- No auto-follow-up after prospect reply
- No fake personalization
- No unsupported claims
- Audit record for every outbound action

## AI Boundaries

AI can help with:

- Opportunity angle
- Draft generation
- Reply classification
- Suggested replies
- Objection handling
- Next-best action
- Campaign lessons

AI must not:

- Invent facts
- Claim experience that does not exist
- Invent pricing without allowed bounds
- Send without approval in V1
- Ignore unsubscribes
- Override suppression
- Attach weak domain matches automatically

## First Version Scope

### In Scope

- PRD and implementation roadmap
- Campaign mode flag/status
- Real/demo/test filtering
- Campaign creation UI
- Qualification queue
- Lead eligibility engine
- Campaign lead states
- Campaign cockpit metrics
- Approved launch guard
- Real-only reporting
- Campaign action queue
- Basic learning summary

### Out of Scope for V1

- Fully autonomous outbound
- WhatsApp sending
- LinkedIn automation
- Paid enrichment providers
- Calendar booking automation
- Stripe/payment collection
- Proposal generation
- Multi-user permissions
- SaaS billing

## Implementation Phases

### Phase RRC-0 - Product Contract

Goal:

Create this PRD and align on the exact business outcome.

Deliverables:

- PRD document
- Acceptance checklist
- Implementation sequence

Done when:

- Scope is clear
- Success metrics are clear
- V1 boundaries are clear

### Phase RRC-1 - Data Separation

Goal:

Make real business records visually and logically separate from demo/test records.

Deliverables:

- Record origin classification
- Demo/test exclusion rules
- Real-only filters
- UI labels for demo/test data

Done when:

- Campaign mode cannot accidentally include demo/test leads.
- Real campaign metrics do not count fixtures.

### Phase RRC-2 - Campaign Domain Model

Goal:

Add campaign entities and lead membership states.

Deliverables:

- Real campaign model
- Campaign lead model
- Eligibility/rejection reasons
- Campaign-level lifecycle states

Done when:

- A campaign can exist independently from generic conversations.
- Leads can be attached, qualified, approved and tracked.

### Phase RRC-3 - Qualification Engine

Goal:

Automatically evaluate whether each candidate lead is safe and useful for the campaign.

Deliverables:

- Eligibility rules
- Score calculation
- Disqualification reasons
- Revenue priority
- Readiness summary

Done when:

- The operator can see why a lead is ready or blocked.
- Weak leads do not enter outreach silently.

### Phase RRC-4 - Campaign Creation and Review UI

Goal:

Let Rajat create a real campaign and approve only qualified leads.

Deliverables:

- Campaign wizard
- Qualification queue
- Approve/reject actions
- Campaign summary

Done when:

- Rajat can prepare a 100-lead campaign without touching demo data.

### Phase RRC-5 - Draft and Launch Guard

Goal:

Generate grounded outreach and launch only approved batches.

Deliverables:

- Campaign-specific templates
- Draft generation
- Pre-send revalidation
- Batch launch guard
- Daily cap visibility

Done when:

- Every sent message belongs to an approved real campaign lead.
- Duplicate and suppressed sends are blocked.

### Phase RRC-6 - Campaign Cockpit

Goal:

Show the real revenue funnel clearly.

Deliverables:

- Funnel cards
- Reply queue
- Bounce dashboard
- Positive reply view
- Meeting/proposal tracking
- Next-action list

Done when:

- Rajat can tell within 30 seconds what happened in a campaign and what to do next.

### Phase RRC-7 - Campaign Learning Loop

Goal:

Convert campaign results into better next campaign decisions.

Deliverables:

- Campaign post-mortem
- Segment performance
- Offer-angle performance
- Bounce/reply interpretation
- Next experiment recommendation

Done when:

- The system explains whether the issue was source, list, offer, message or follow-up.

## First 100-Lead Acceptance Test

Use one controlled campaign:

```text
Campaign: US/Canada Local Service Workflow Audit
Sender: Rajat Tomar
Audience: 100 qualified real prospects
Offer: quote/booking/intake workflow improvement
Mode: REAL_REVENUE
```

Acceptance checks:

```text
[ ] Campaign created with market, segment, offer and sender
[ ] Demo/test leads excluded
[ ] Suppressed and bounced contacts excluded
[ ] 100 candidate leads evaluated
[ ] At least 50 leads qualify or disqualification reasons are clear
[ ] Operator approves a first batch
[ ] Drafts are generated with grounded personalization
[ ] Launch blocks unapproved leads
[ ] Launch blocks duplicate sends
[ ] Launch blocks suppressed contacts
[ ] Sent messages appear in campaign cockpit
[ ] Replies attach to correct campaign leads
[ ] Bounces update campaign metrics
[ ] Positive replies surface in action queue
[ ] Meetings/proposals can be tracked
[ ] Final campaign report shows honest funnel
```

## Success Targets

For the first real 100-lead campaign:

```text
Bounce rate: below 8%
Reply rate: 3% to 8%
Positive reply rate: 1% to 3%
Meeting target: 1
Proposal target: 1 qualified opportunity if meeting goes well
```

These are not guarantees. They are diagnostic targets.

Interpretation:

- High bounce rate means source/contact quality is bad.
- Low reply rate means targeting or messaging is weak.
- Replies but no meetings means follow-up or offer clarity is weak.
- Meetings but no proposals means discovery or pricing needs improvement.
- Proposals but no wins means trust, proof, pricing or closing process needs work.

## Operating Principle

The mode must prefer honest pain over comforting numbers.

If a campaign performs badly, ProspectPilot should say so clearly and explain the likely reason.

## Completion Criteria

Real Revenue Campaign Mode is complete when:

```text
[ ] Real campaigns are separated from demo/test data
[ ] Real campaign creation works
[ ] Lead qualification produces reasons and scores
[ ] Campaign lead approval works
[ ] Outreach drafts are campaign-aware
[ ] Launch only sends approved safe leads
[ ] Campaign metrics are real-only
[ ] Replies, bounces and CRM outcomes update the campaign
[ ] Operator can see the next action for every active reply
[ ] A 100-lead campaign can be run and reviewed
[ ] Campaign report explains what to improve next
```

## What This Will Achieve

This mode will not magically guarantee sales.

It will achieve something more useful:

- Remove fake confidence from demo/test data
- Force clean targeting
- Force qualified recipient selection
- Make weak lead sources obvious
- Make poor email coverage obvious
- Make bounce and reply rates visible
- Make offer-market fit measurable
- Give Rajat a repeatable campaign process
- Create the operational foundation for scaling outreach responsibly

The immediate business goal is:

> Launch real campaigns that teach us exactly which market, offer and message can produce paid freelance work.

