# Freedom Mission Control FM-1

Freedom Mission Control is ProspectPilot's founder motivation layer. It keeps the existing Today dashboard intact and adds a separate `/overview` tab for Rajat's Rs 1 crore mission.

## What FM-1 Includes

- Separate Overview tab with a premium arcade-inspired mission dashboard.
- Founder profile, Rs 1 crore target, discipline mode, privacy, reduced-motion and sound settings.
- Seven mission milestones: iPhone, gold chain, debt freedom, bike, property/asset, independent balance and XUV/Fortuner.
- Append-only XP ledger, reward coin ledger, mission allocation ledger and debt payment ledger.
- Daily revenue quests generated from actual ProspectPilot data.
- Founder levels and progress toward the next level.
- Achievement definitions and earned achievement records.
- Celebration events for real actions only.
- Guardrails that keep pipeline, deal value, collected revenue and personal freedom progress separate.

## FM-2 Additions

- Mission operations panel on `/overview` for recording real payments, allocations, debt payments, reserves and verified assets.
- Milestone detail modal with pause and verification actions.
- Celebration cards can be marked seen so one-time wins do not keep showing as new.
- Financial trend bars and projection text from verified ledger movement.
- Debt account and asset recording API endpoints.
- Milestone update API for target/status/evidence changes.
- Darker original arcade HUD direction, closer to the founder-mission reference while avoiding copied game assets.

## Product Boundary

The mission layer consumes ProspectPilot events but does not mutate lead, communication or CRM records. It is not an accounting replacement and does not provide investment advice.

Freedom Progress is calculated as:

```text
verified debt repaid
+ liquid reserve
+ verified investment value
+ completed personal/asset/vehicle allocations
```

Collected business revenue is displayed separately and never treated as personal wealth by itself.

## Real Event Sources

FM-1 currently derives provisional XP from:

- Verified leads
- Hot lead qualification
- Valid outbound messages
- Inbound replies
- Positive reply intelligence
- CRM meeting/proposal/won stages
- Verified collected-revenue mission allocations
- Debt payments
- Completed mission milestones
- Earned achievements
- Completed daily quests

Every XP event uses an idempotency key so repeated page loads do not duplicate rewards.

## Acceptance Checklist

```text
[x] Existing Today dashboard remains available at /
[x] Freedom Mission Control is available at /overview
[x] API summary is available at /founder-mission
[x] Mission milestones bootstrap automatically
[x] XP ledger is append-only and idempotent
[x] Daily quests use real operational counts
[x] Deal won and payment received remain separate
[x] Pipeline value does not count as freedom progress
[x] Privacy mode can hide visible money values
[x] Reduced-motion setting disables mission animations
[x] Dashboard uses original arcade-inspired visuals
[x] No copyrighted game assets, characters, sounds or blocks are used
[x] Operator can record payment/debt/allocation/asset events
[x] Milestones can be inspected and verified from the Overview UI
[x] Mission velocity chart and projection are visible
```

## Operational Note

After pulling this branch on a fresh database, run:

```bash
npx prisma generate
npx prisma db push
```

The local database must be running before `db push`.
