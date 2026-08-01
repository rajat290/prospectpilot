# Phase 9C Communication Acceptance

This document records real-provider acceptance evidence for ProspectPilot communication workflows.
Do not store client secrets, access or refresh tokens, encryption keys, raw authorization codes, or unredacted private message bodies here.

## Run Information

| Field | Value |
| --- | --- |
| Phase | 9C - Live Gmail Activation and Acceptance |
| Execution date | 2026-08-01 |
| Operator | Internal operator |
| Provider | Gmail |
| Sending mailbox | `r***@gmail.com` |
| Prospect mailbox | `s***@gmail.com` |
| Application environment | Local |
| Overall status | ACCEPTED - all 16 local Gmail go-live criteria passed |

## Current Readiness

| Requirement | Status | Evidence or limitation |
| --- | --- | --- |
| Communication encryption key | PASS | Configured locally; value not recorded |
| Attachment signing key | PASS | Configured locally; value not recorded |
| Gmail redirect URI | PASS | `http://localhost:4000/communications/oauth/gmail/callback` |
| Gmail OAuth client ID | PASS | Configured locally; value not recorded |
| Gmail OAuth client secret | PASS | Configured locally; value not recorded |
| Dedicated Gmail test mailbox | PASS | Connected once through Google OAuth |
| Second prospect test mailbox | PASS | Controlled mailbox used for real send and reply |
| Gmail Pub/Sub topic | OPTIONAL | Not required for manual sync acceptance |
| Gmail webhook token | OPTIONAL | Required only when Pub/Sub push is enabled |

## Acceptance Matrix

Use `REAL` only for evidence observed from Gmail. Use `SIMULATED` for fixtures or controlled local events.

| ID | Test case | Expected result | Actual result | Result | Evidence type | Non-secret IDs | Screenshot reference | Known limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | OAuth consent | Dedicated mailbox connects and appears once | Mailbox connected once; profile matched the expected account | PASS | REAL | Connection `cmsa8yzru00017znhhov2kkks` | Operator dashboard | Disconnect/reconnect remains separate |
| A2 | Encrypted refresh token | Refresh token stored encrypted and survives restart | Encrypted token presence persisted through application and worker restarts; mailbox remained usable | PASS | REAL | Connection `cmsa8yzru00017znhhov2kkks` | Operator dashboard | Token value was never inspected or recorded |
| A3 | Token refresh | Expired access token refreshes successfully | Forced refresh completed and refreshed profile matched | PASS | REAL | Connection `cmsa8yzru00017znhhov2kkks` | N/A | Provider access was live |
| A4 | Disconnect and reconnect | Disconnect clears tokens; reconnect reuses mailbox record | Disconnect cleared both encrypted tokens; OAuth reconnect restored encrypted tokens on the same mailbox record | PASS | REAL | Connection `cmsa8yzru00017znhhov2kkks`; event `OAUTH_RECONNECTED` | Operator dashboard | None observed |
| A5 | Revoked Google access | Connection reports provider error without leaking secrets | Refresh failures are sanitized and move the connection to `EXPIRED` or `ERROR`; an actual Google-side revoke was not performed because it would require another interactive consent | DEFERRED | SIMULATED | Token-refresh error handler | N/A | Destructive provider-revoke drill is not a local launch gate |
| B1 | Approved outbound | `PENDING_APPROVAL -> APPROVED -> QUEUED -> PROVIDER_SUBMITTED -> SENT` | One controlled message completed the full Gmail state path on the first job attempt | PASS | REAL | Message `cmsa9a43t000k7znh0b8c1yi5`; job `cmsa9a498000t7znhoyfl8l6t` | Gmail and operator dashboard | No campaign or follow-up was started |
| B2 | CRM contacted | Successful provider submission moves eligible lead to `CONTACTED` | Controlled lead moved from `QUALIFIED` to `CONTACTED` | PASS | REAL | Company `cmsa99svq00009hz0kqsctnv3` | Operator dashboard | None for direct send |
| C1 | Threaded reply | Reply attaches to existing conversation and exact contact | Reply matched the provider thread, company, contact, and Gmail connection; no duplicate conversation was created | PASS | REAL | Conversation `cmsa9a42p000g7znhvvjssamw`; inbound message `cmsa9f26v002z456a1j9cyn62`; contact `cmsa99swb00029hz0fvzamddm` | Operator dashboard | None observed |
| C2 | Reply consequences | Timeline updates, CRM becomes `REPLIED`, sequence exits, Inbox needs reply | Real reply ended the active enrollment as `EXITED_REPLY`, cleared `nextStepAt`, and moved CRM to `REPLIED` | PASS | REAL | Enrollment `cmsaqr8xa001d45xx08htvziy`; message `cmsaqr94e00069xysq7n9kjrw` | Operator dashboard | None observed |
| D1 | Unknown inbound | Weak domain inference does not auto-attach | Real unknown-sender email entered pending review with 55% confidence and `companyId: null` | PASS | REAL | Review `cmsash8ow000dtineg7ho3nv4`; message `cmsash8ls0003tinewiwp3bdy` | Operator dashboard | Deliberately left pending for operator review |
| D2 | Review actions | Attach, create contact, create lead, ignore, and spam preserve audit state | Locally exercised | PASS | SIMULATED | Demo review record | Pending | Must repeat one action with real Gmail |
| E1 | Safe attachment | Safe PDF is stored, scanned, attached, and downloadable | Clean PDF uploaded, signed-download returned 200, Gmail accepted the MIME attachment, and reconciliation confirmed `SENT` | PASS | REAL | Message `cmsaqn14n000m45xxxitl5nw5`; attachment `cmsaqnagx000v45xxtdwlbvxw` | Recipient Gmail and operator dashboard | Test PDF contains no private data |
| E2 | Duplicate attachment | Duplicate bytes reuse content-addressed storage | Two uploads produced the same SHA-256 and storage key; the duplicate DB attachment was removed before send | PASS | REAL | Attachments `cmsaqnagx000v45xxtdwlbvxw`, `cmsaqnaiy000z45xxuuqvzmui` | N/A | Content-addressed bytes were reused |
| E3 | Unsafe attachment controls | Oversize, invalid, suspicious, expired, deleted, and quarantined access fail safely | Executable extension and oversize upload returned 400; EICAR fixture returned 422/QUARANTINED; expired signed link returned 401 | PASS | REAL local controls | Message `cmsaqn14n000m45xxxitl5nw5` | N/A | EICAR is a harmless antivirus test signature |
| F1 | Scheduled send survives restart | Delayed job persists and sends once after worker restart | Worker stopped and restarted before due time; job completed once and Gmail reconciliation confirmed one `SENT` message | PASS | REAL | Message `cmsaq9ejn00167znh33indsrq`; schedule `cmsaq9eqn001h7znhtzgi2ey3`; job `cmsaq9eo0001f7znhpo4hbskk` | Recipient Gmail and operator dashboard | None observed |
| F2 | Schedule cancellation gates | Cancel, disconnect, suppression, reply, and duplicate retry prevent sending | Destination suppression produced controlled `SUPPRESSED`, terminal `CANCELLED`, no provider ID, and one cancellation event; duplicate submit returned 409 before queue creation | PASS | REAL local gate | Suppression-test message `cmsaqkp0c000545xxbrveuwwv`; attachment message above | N/A | Disconnect and reply exits are recorded separately |
| G1 | Bounce workflow | NDR marks contact invalid, suppresses, cancels, exits sequence, and records history | Controlled NDR fixture passes | PASS | SIMULATED | Demo bounce message | Pending | Real provider bounce not yet observed |
| H1 | Sequence lifecycle | Approval, pause, resume, reply, stop, bounce, deal, suppression, and retry cancel remaining steps | Three-step controlled sequence sent step 1 through Gmail; real reply exited the enrollment before steps 2 and 3 | PASS | REAL | Sequence `cmsaqq08p000115po44cn9pii`; enrollment `cmsaqr8xa001d45xx08htvziy` | Operator dashboard | Other exit reasons remain covered by focused fixtures |
| I1 | Reconciliation recovery | Missed event is recovered by Gmail history reconciliation | Backfill recovered the disconnected-window reply and unknown email without duplicating existing provider messages | PASS | REAL | Job `cmsash74m0000xpuxa7igzr12`; result: 11 threads inspected, 2 messages saved | N/A | Reconnect now preserves the previous history cursor |

## Go-Live Criteria

- [x] Real Gmail OAuth completed
- [x] Access-token refresh tested
- [x] Approved message sent externally
- [x] Gmail thread preserved
- [x] Real reply synchronized
- [x] Reply attached to correct lead
- [x] CRM moved from `CONTACTED` to `REPLIED`
- [x] Reply stopped the active sequence
- [x] Unknown sender entered unmatched review
- [x] Scheduling survived a worker restart
- [x] Suppression blocked a queued send
- [x] Attachment control matrix passed
- [x] Duplicate send remained blocked
- [x] Disconnect and reconnect passed
- [x] Reconciliation recovered a missed event
- [x] Complete non-secret audit history was preserved

Phase 9C must not be marked complete until every item above is checked with real-provider evidence where required.

All 16 criteria above passed. Phase 9C is accepted for controlled local Gmail operation.

## Defects Found And Corrected

- Suppression originally prevented provider submission but left the message retryable. Safety blocks now terminate the message and schedule as `CANCELLED` with an audit event.
- Repeated submit originally created an orphan tracked job. Submission is now accepted only from `APPROVED`; later attempts return `409` before queue creation.
- Gmail reconnect originally replaced the old history cursor and could skip mail received while disconnected. Reconnect now preserves the cursor so reconciliation recovers the gap.

## Evidence Rules

- Record message, conversation, company, contact, connection, job, and enrollment IDs only.
- Redact mailbox local-parts when screenshots are not restricted to the operator.
- Store screenshots under `docs/evidence/phase-9c/` with no secrets or private message bodies visible.
- Label every result as `REAL` or `SIMULATED`.
- Record failures as failures. Do not replace failed real-provider evidence with a fixture.
