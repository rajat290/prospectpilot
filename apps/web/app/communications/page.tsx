import { AlertTriangle, BarChart3, CheckCircle2, Clock3, FileQuestion, FileText, MailCheck, MessagesSquare, Route, ShieldOff } from "lucide-react";
import {
  AccountActions,
  ApprovalActions,
  DeliveryEventActions,
  GmailConnectButton,
  InboundReviewActions,
  RevokeSuppression,
  ScheduledMessageActions,
  SequenceActions,
  SubmitApprovedMessage,
  SuppressionForm
} from "../../components/communication-actions";
import { ContextHelp } from "../../components/context-help";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";

export default async function CommunicationsPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const [status, approvals, templates, suppressions, sequences, schedules, reviews, analytics, leads] = await Promise.all([
    apiGet<any>("/communications/status", { providers: { gmail: {} }, accounts: [], counts: {} }),
    apiGet<any[]>("/approval-requests", []),
    apiGet<any[]>("/message-templates", []),
    apiGet<any[]>("/suppressions", []),
    apiGet<any[]>("/sequences", []),
    apiGet<any[]>("/scheduled-messages", []),
    apiGet<any[]>("/inbound-reviews", []),
    apiGet<any>("/communication-analytics", { statuses: [], events: [], bounces: [], contactability: [], recentFailures: [] }),
    apiGet<any[]>("/companies?limit=250&hasContact=true", [])
  ]);
  const hasRealMailbox = status.accounts.some((account: any) => account.provider === "GMAIL" && account.status === "CONNECTED");

  return (
    <main className="page communications-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Phase 9B operations</p>
          <h1>Communication control room.</h1>
          <p className="subtle">Match unknown replies, approve and schedule messages, control sequences, and act on delivery risk.</p>
        </div>
        <a className="button primary" href="/inbox"><MessagesSquare size={15} /> Open inbox</a>
      </header>

      {searchParams.connected ? <div className="quality-alert verified"><CheckCircle2 size={18} /><div><strong>Gmail connected</strong><span>Initial history sync is queued. New exact contact matches will appear in Inbox.</span></div></div> : null}
      {searchParams.error ? <div className="quality-alert critical"><AlertTriangle size={18} /><div><strong>Mailbox connection failed</strong><span>{searchParams.error.replaceAll("_", " ")}</span></div></div> : null}

      <section className="communication-metrics phase9b-metrics">
        <Metric label="Conversations" value={status.counts.conversations || 0} icon={<MessagesSquare size={17} />} />
        <Metric label="Need approval" value={status.counts.pendingApprovals || 0} icon={<MailCheck size={17} />} />
        <Metric label="Scheduled" value={status.counts.scheduled || 0} icon={<Clock3 size={17} />} />
        <Metric label="Unmatched" value={status.counts.unmatched || 0} icon={<FileQuestion size={17} />} />
        <Metric label="Failed / bounced" value={status.counts.failed || 0} icon={<AlertTriangle size={17} />} />
        <Metric label="Suppressed" value={status.counts.suppressions || 0} icon={<ShieldOff size={17} />} />
      </section>

      <section className="communication-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Mailbox connections</h2><GmailConnectButton configured={Boolean(status.providers.gmail.oauthConfigured)} /></div>
            <div className="panel-body">
              <ContextHelp compact title="Live activation gate">Use a dedicated test Gmail account. Google OAuth credentials and consent are still required before the real send, reply, sync, match, and CRM loop can be proven.</ContextHelp>
              {!status.providers.gmail.oauthConfigured ? (
                <div className="setup-warning"><AlertTriangle size={16} /><div><strong>Gmail credentials are not configured</strong><span>Add the Google client ID and client secret in `.env`, then connect the dedicated test mailbox. Redirect URI: {status.providers.gmail.redirectUri}.</span></div></div>
              ) : null}
              <div className="account-list">
                {status.accounts.map((account: any) => (
                  <div key={account.id}>
                    <span className={`provider-mark ${account.provider.toLowerCase()}`}>{account.provider === "GMAIL" ? "G" : "D"}</span>
                    <div><strong>{account.displayName || account.emailAddress}</strong><p>{account.emailAddress} · {account.provider.replaceAll("_", " ")}</p><span>Last sync {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "not completed"}</span></div>
                    <Pill value={account.status} />
                    <AccountActions account={account} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Unmatched inbound review</h2><span className={`issue-count ${reviews.length ? "critical" : ""}`}>{reviews.length}</span></div>
            <div className="panel-body unmatched-list">
              {reviews.map((review: any) => {
                const candidates = Array.isArray(review.possibleMatches) ? review.possibleMatches : [];
                return (
                  <article key={review.id}>
                    <header><div><strong>{review.senderName || review.senderAddress}</strong><span>{review.senderAddress} · via {review.connection.emailAddress}</span></div><Pill value="review" /></header>
                    <h3>{review.subject || "No subject"}</h3>
                    <p>{review.message.bodyText}</p>
                    <div className="candidate-reason"><strong>{review.matchConfidence}% match confidence</strong><span>{review.matchReason}</span>{candidates[0] ? <small>Candidate: {candidates[0].companyName}</small> : null}</div>
                    <InboundReviewActions review={review} leads={leads} />
                  </article>
                );
              })}
              {!reviews.length ? <div className="empty"><CheckCircle2 size={22} /><p>No unknown sender is waiting for review.</p></div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Approval queue</h2><span className="issue-count">{approvals.length}</span></div>
            <div className="panel-body approval-list">
              {approvals.map((approval: any) => (
                <article key={approval.id}>
                  <div className="approval-head"><div><strong>{approval.message.company?.name || "Unknown lead"}</strong><span>To {approval.message.recipients.find((item: any) => item.type === "TO")?.address}</span></div><Pill value={approval.message.status} /></div>
                  <h3>{approval.message.subject}</h3><p>{approval.message.bodyText}</p>
                  {approval.riskFlags?.length ? <div className="risk-flags">{approval.riskFlags.map((flag: string) => <span key={flag}>{flag.replaceAll("_", " ")}</span>)}</div> : null}
                  <footer>
                    {approval.status === "PENDING" ? <ApprovalActions messageId={approval.messageId} /> : <SubmitApprovedMessage messageId={approval.messageId} realMailbox={hasRealMailbox} />}
                    <span>{approval.reason}</span>
                  </footer>
                </article>
              ))}
              {!approvals.length ? <div className="empty"><CheckCircle2 size={22} /><p>No drafts are waiting for review.</p></div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Scheduled delivery queue</h2><Clock3 size={16} /></div>
            <div className="panel-body scheduled-list">
              {schedules.map((schedule: any) => (
                <article key={schedule.id}>
                  <div><strong>{schedule.message.company?.name || "Unknown lead"}</strong><span>{schedule.message.subject} · to {schedule.message.recipients.find((item: any) => item.type === "TO")?.address}</span></div>
                  <div><Pill value={schedule.status} /><time>{formatDate(schedule.dueAt)} · {schedule.recipientTimezone}</time></div>
                  {["PENDING", "QUEUED", "FAILED"].includes(schedule.status) ? <ScheduledMessageActions schedule={schedule} /> : null}
                  {schedule.lastError ? <p>{schedule.lastError}</p> : null}
                </article>
              ))}
              {!schedules.length ? <div className="empty">No scheduled messages.</div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Active suppression list</h2><ShieldOff size={16} /></div>
            <div className="panel-body"><SuppressionForm /><div className="suppression-list">
              {suppressions.map((entry: any) => <div key={entry.id}><span className="icon-box"><ShieldOff size={14} /></span><div><strong>{entry.normalizedDestination || entry.domain || entry.company?.name || "Entire workspace"}</strong><p>{entry.reason.replaceAll("_", " ")} · {entry.details || "No operator note"}</p></div><RevokeSuppression id={entry.id} /></div>)}
            </div></div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Safety readiness</h2><MailCheck size={16} /></div>
            <div className="panel-body readiness-list">
              <Readiness ready={status.providers.gmail.oauthConfigured} label="Gmail OAuth credentials" />
              <Readiness ready={hasRealMailbox} label="Live mailbox connected" />
              <Readiness ready={status.providers.gmail.pubsubConfigured} label="Push sync webhook" />
              <Readiness ready={true} label="20-minute reconciliation" />
              <Readiness ready={true} label="Approval + suppression gates" />
              <Readiness ready={Boolean(status.attachments?.signingConfigured)} label="Production attachment signing" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Delivery pulse</h2><BarChart3 size={16} /></div>
            <div className="panel-body delivery-pulse">
              <div className="delivery-bars">{analytics.statuses.map((item: any) => <div key={item.status}><span>{item.status.replaceAll("_", " ")}</span><strong>{item._count}</strong><div><i style={{ width: `${Math.min(100, item._count * 12)}%` }} /></div></div>)}</div>
              {analytics.recentFailures.map((message: any) => <article key={message.id}><div><strong>{message.company?.name || "Unknown lead"}</strong><span>{message.failureReason || message.bounceCategory || message.status}</span></div><DeliveryEventActions messageId={message.id} status={message.status} /></article>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Reusable templates</h2><FileText size={16} /></div>
            <div className="panel-body template-list">{templates.map((template: any) => <div key={template.id}><div><strong>{template.name}</strong><Pill value={template.category} /></div><span>{template.subject || "No subject"}</span><p>{template.body}</p><small>{template.variables.length} variables · approval {template.approvalMode.toLowerCase()}</small></div>)}</div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Operational sequences</h2><Route size={16} /></div>
            <div className="panel-body sequence-list">
              {sequences.map((sequence: any) => (
                <div key={sequence.id}>
                  <header><div><strong>{sequence.name}</strong><span>{sequence.steps.length} steps · {sequence._count.enrollments} enrolled</span></div><Pill value={sequence.status} /></header>
                  {sequence.steps.map((step: any) => <div className="sequence-step" key={step.id}><span>{step.position}</span><div><strong>{step.subject}</strong><small>{step.delayHours ? `${step.delayHours}h after previous step` : "Immediately after approval"}</small></div></div>)}
                  <footer>{sequence.dailyLimit}/day · {sequence.perDomainLimit}/domain · {sequence.skipWeekends ? "weekends skipped" : "weekends included"}</footer>
                  <SequenceActions sequence={sequence} leads={leads} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div></div>;
}
function Readiness({ ready, label }: { ready: boolean; label: string }) {
  return <div className={ready ? "ready" : ""}>{ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<span>{label}</span><strong>{ready ? "Ready" : "Action needed"}</strong></div>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
