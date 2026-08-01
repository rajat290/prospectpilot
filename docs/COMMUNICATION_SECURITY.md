# Communication Security Runbook

## Gmail Test Account

Use a dedicated Gmail test mailbox, not a personal primary account. Configure Google OAuth as a server-side web application and register:

```text
http://localhost:4000/communications/oauth/gmail/callback
```

Required local values:

```text
COMMUNICATION_ENCRYPTION_KEY="<base64 32-byte key>"
GMAIL_CLIENT_ID="<google client id>"
GMAIL_CLIENT_SECRET="<google client secret>"
GMAIL_REDIRECT_URI="http://localhost:4000/communications/oauth/gmail/callback"
```

Generate the encryption key with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit keys or OAuth credentials. Local and production environments must use different keys.

## Encryption Key Rotation

Refresh and access tokens use AES-256-GCM authenticated encryption. Replacing the key without re-encrypting stored tokens makes existing mailbox connections unreadable.

Rotation procedure:

1. Pause communication workers and scheduled sends.
2. Back up the database and old key in the approved secret manager.
3. Decrypt every stored token with the old key.
4. Re-encrypt each token with the new key inside one controlled migration.
5. Update the runtime secret and restart API/workers.
6. Trigger mailbox sync and token refresh for every Gmail connection.
7. Revoke the old key after all connections pass.

If the old key is unavailable, disconnect each mailbox and complete OAuth consent again.

## Attachment Storage

- Binary files live under the configured object-storage root; PostgreSQL stores metadata only.
- Local development defaults to `.data/attachments`, which is ignored by Git.
- Production must set `ATTACHMENT_STORAGE_ROOT` and `ATTACHMENT_SIGNING_KEY`.
- Downloads use five-minute HMAC-signed URLs and `X-Content-Type-Options: nosniff`.
- Uploads are limited to 10 MB and an allowlist of PDF, Office Open XML, images, CSV, and text.
- Executable/script extensions are blocked, filenames are sanitized, hashes support deduplication, and the scanner hook quarantines suspicious content.
- Replace the local scan hook with the production malware scanner before external users are enabled.

## Gmail Sync Reliability

- Push notification: primary signal after Pub/Sub is configured.
- Reconciliation job: every 20 minutes for connected Gmail accounts.
- Invalid Gmail history cursor: fall back to a recent full thread sync.
- Watch renewal: performed during sync when Pub/Sub is enabled.
- Unknown senders never attach through domain inference; they enter Unmatched Inbound Review.

## Live Acceptance Test

1. Connect the dedicated Gmail account.
2. Create a manually verified test lead using a second email address.
3. Draft, approve, and send from Lead 360.
4. Verify `PROVIDER_SUBMITTED`, then sync the Sent message to `SENT`.
5. Reply from the second account and run mailbox sync.
6. Verify the same provider thread, exact lead/contact match, timeline event, CRM `REPLIED`, and sequence exit.
7. Revoke credentials once and confirm the connection reports an error.

Use `/campaigns` for the live acceptance dashboard. It exposes only boolean secret readiness, encrypted-token presence, non-secret connection events, provider status, and record IDs.

## First Campaign Safety Gate

Before selecting real recipients:

1. Use a dedicated business sending mailbox with SPF, DKIM, and DMARC configured for its domain.
2. Complete the two-mailbox Phase 9C acceptance loop.
3. Add only verified or probable email contacts with evidence.
4. Review every blocked reason in Campaign Launch Center.
5. Keep the first sequence within its configured daily and per-domain limits.
6. Use a clear sender identity and the required respectful opt-out line.
7. Type the displayed `PREPARE`, `APPROVE`, and `LAUNCH` confirmations yourself.
8. Monitor replies, bounces, suppressions, and provider errors after every batch.

Campaign preparation never sends email. Only the final typed launch confirmation schedules provider submission.
