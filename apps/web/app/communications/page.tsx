import { AlertTriangle, CheckCircle2, Clock3, FileText, MailCheck, MessagesSquare, Route, ShieldOff } from "lucide-react";
import {
  AccountActions,
  ApprovalActions,
  GmailConnectButton,
  RevokeSuppression,
  SubmitApprovedMessage,
  SuppressionForm
} from "../../components/communication-actions";
import { ContextHelp } from "../../components/context-help";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";

export default async function CommunicationsPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const [status, approvals, templates, suppressions, sequences] = await Promise.all([
    apiGet<any>("/communications/status", { providers: { gmail: {} }, accounts: [], counts: {} }),
    apiGet<any[]>("/approval-requests", []),
    apiGet<any[]>("/message-templates", []),
    apiGet<any[]>("/suppressions", []),
    apiGet<any[]>("/sequences", [])
  ]);
  const hasRealMailbox = status.accounts.some((account: any) => account.provider === "GMAIL" && account.status === "CONNECTED");

  return (
    <main className="page communications-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Communication control room</p>
          <h1>Channels, approvals, and safety.</h1>
          <p className="subtle">Connect providers once, keep sending deliberate, and preserve every customer interaction on the lead timeline.</p>
        </div>
        <a className="button primary" href="/inbox"><MessagesSquare size={15} /> Open inbox</a>
      </header>

      {searchParams.connected ? <div className="quality-alert verified"><CheckCircle2 size={18} /><div><strong>Gmail connected</strong><span>Initial history sync is queued. New exact contact matches will appear in Inbox.</span></div></div> : null}
      {searchParams.error ? <div className="quality-alert critical"><AlertTriangle size={18} /><div><strong>Mailbox connection failed</strong><span>{searchParams.error.replaceAll("_", " ")}</span></div></div> : null}

      <section className="communication-metrics">
        <Metric label="Conversations" value={status.counts.conversations || 0} icon={<MessagesSquare size={17} />} />
        <Metric label="Need approval" value={status.counts.pendingApprovals || 0} icon={<MailCheck size={17} />} />
        <Metric label="Scheduled" value={status.counts.scheduled || 0} icon={<Clock3 size={17} />} />
        <Metric label="Suppressed" value={status.counts.suppressions || 0} icon={<ShieldOff size={17} />} />
      </section>

      <section className="communication-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Mailbox connections</h2><GmailConnectButton configured={Boolean(status.providers.gmail.oauthConfigured)} /></div>
            <div className="panel-body">
              <ContextHelp compact title="Provider boundary">Gmail uses server-side OAuth and encrypted refresh tokens. Outlook can plug into the same core later; personal WhatsApp and LinkedIn automation are intentionally excluded.</ContextHelp>
              {!status.providers.gmail.oauthConfigured ? (
                <div className="setup-warning"><AlertTriangle size={16} /><div><strong>Gmail credentials are not configured</strong><span>Add the three required values in `.env`: client ID, client secret, and a 32-byte encryption key. The redirect URI is {status.providers.gmail.redirectUri}.</span></div></div>
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
            <div className="panel-head"><h2>Approval queue</h2><span className="issue-count">{approvals.length}</span></div>
            <div className="panel-body approval-list">
              {approvals.map((approval: any) => (
                <article key={approval.id}>
                  <div className="approval-head"><div><strong>{approval.message.company?.name || "Unknown lead"}</strong><span>To {approval.message.recipients.find((item: any) => item.type === "TO")?.address}</span></div><Pill value={approval.message.status} /></div>
                  <h3>{approval.message.subject}</h3>
                  <p>{approval.message.bodyText}</p>
                  {approval.riskFlags?.length ? <div className="risk-flags">{approval.riskFlags.map((flag: string) => <span key={flag}>{flag.replaceAll("_", " ")}</span>)}</div> : null}
                  <footer>
                    {approval.status === "PENDING"
                      ? <ApprovalActions messageId={approval.messageId} />
                      : <SubmitApprovedMessage messageId={approval.messageId} realMailbox={hasRealMailbox} />}
                    <span>{approval.reason}</span>
                  </footer>
                </article>
              ))}
              {!approvals.length ? <div className="empty"><CheckCircle2 size={22} /><p>No drafts are waiting for review.</p></div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Active suppression list</h2><ShieldOff size={16} /></div>
            <div className="panel-body">
              <SuppressionForm />
              <div className="suppression-list">
                {suppressions.map((entry: any) => (
                  <div key={entry.id}><span className="icon-box"><ShieldOff size={14} /></span><div><strong>{entry.normalizedDestination || entry.domain || entry.company?.name || "Entire workspace"}</strong><p>{entry.reason.replaceAll("_", " ")} · {entry.details || "No operator note"}</p></div><RevokeSuppression id={entry.id} /></div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Safety readiness</h2><MailCheck size={16} /></div>
            <div className="panel-body readiness-list">
              <Readiness ready={status.providers.gmail.oauthConfigured} label="Gmail OAuth credentials" />
              <Readiness ready={hasRealMailbox} label="Live mailbox connected" />
              <Readiness ready={status.providers.gmail.pubsubConfigured} label="Push sync webhook" />
              <Readiness ready={true} label="Approval gate" />
              <Readiness ready={true} label="Suppression checks" />
              <Readiness ready={true} label="Idempotent send queue" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Reusable templates</h2><FileText size={16} /></div>
            <div className="panel-body template-list">
              {templates.map((template: any) => <div key={template.id}><div><strong>{template.name}</strong><Pill value={template.category} /></div><span>{template.subject || "No subject"}</span><p>{template.body}</p><small>{template.variables.length} variables · approval {template.approvalMode.toLowerCase()}</small></div>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Follow-up sequences</h2><Route size={16} /></div>
            <div className="panel-body sequence-list">
              {sequences.map((sequence: any) => (
                <div key={sequence.id}>
                  <header><div><strong>{sequence.name}</strong><span>{sequence.steps.length} steps · {sequence._count.enrollments} enrolled</span></div><Pill value={sequence.status} /></header>
                  {sequence.steps.map((step: any) => <div className="sequence-step" key={step.id}><span>{step.position}</span><div><strong>{step.subject}</strong><small>{step.delayHours ? `${step.delayHours}h after previous step` : "Immediately after enrollment"}</small></div></div>)}
                  <footer>{sequence.dailyLimit}/day · {sequence.perDomainLimit}/domain · {sequence.skipWeekends ? "weekends skipped" : "weekends included"}</footer>
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
