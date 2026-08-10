import { AlertTriangle, BarChart3, CheckCircle2, FileText, MailCheck, Route, ShieldOff } from "lucide-react";
import {
  AccountActions,
  DeliveryEventActions,
  GmailConnectButton,
  RevokeSuppression,
  SequenceActions,
  SuppressionForm
} from "../../components/communication-actions";
import { ContextHelp } from "../../components/context-help";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";
import { displayTerm } from "../../lib/terminology";

export default async function EmailSettingsPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const [status, templates, suppressions, sequences, analytics, leads] = await Promise.all([
    apiGet<any>("/communications/status", { providers: { gmail: {} }, accounts: [], counts: {} }),
    apiGet<any[]>("/message-templates", []),
    apiGet<any[]>("/suppressions", []),
    apiGet<any[]>("/sequences", []),
    apiGet<any>("/communication-analytics", { statuses: [], events: [], bounces: [], contactability: [], recentFailures: [] }),
    apiGet<any[]>("/companies?limit=250&hasContact=true", [])
  ]);
  const hasRealMailbox = status.accounts.some((account: any) => account.provider === "GMAIL" && account.status === "CONNECTED");

  return (
    <main className="page communications-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Email settings</p>
          <h1>Email settings</h1>
          <p className="subtle">Connect Gmail, protect deliverability, manage blocked contacts, templates, and follow-up sequences.</p>
        </div>
        <a className="button primary" href="/inbox">Open Inbox</a>
      </header>

      {searchParams.connected ? <div className="quality-alert verified"><CheckCircle2 size={18} /><div><strong>Gmail connected</strong><span>Initial history sync is queued. New exact contact matches will appear in Inbox.</span></div></div> : null}
      {searchParams.error ? <div className="quality-alert critical"><AlertTriangle size={18} /><div><strong>Mailbox connection failed</strong><span>{displayTerm(searchParams.error)}</span></div></div> : null}

      <section className="communication-metrics phase9b-metrics">
        <Metric label="Conversations" value={status.counts.conversations || 0} />
        <Metric label="Need approval" value={status.counts.pendingApprovals || 0} />
        <Metric label="Scheduled" value={status.counts.scheduled || 0} />
        <Metric label="Unmatched" value={status.counts.unmatched || 0} />
        <Metric label="Failed or bounced" value={status.counts.failed || 0} />
        <Metric label="Blocked contacts" value={status.counts.suppressions || 0} />
      </section>

      <section className="communication-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Mailbox connections</h2><GmailConnectButton configured={Boolean(status.providers.gmail.oauthConfigured)} /></div>
            <div className="panel-body">
              <ContextHelp compact title="Dedicated sending mailbox">Use the dedicated outreach Gmail account. Personal mailboxes should not be used for campaigns.</ContextHelp>
              {!status.providers.gmail.oauthConfigured ? (
                <div className="setup-warning"><AlertTriangle size={16} /><div><strong>Gmail setup needs attention</strong><span>Ask the workspace admin to finish Gmail setup, then connect the dedicated outreach mailbox.</span></div></div>
              ) : null}
              <div className="account-list">
                {status.accounts.map((account: any) => (
                  <div key={account.id}>
                    <span className={`provider-mark ${account.provider.toLowerCase()}`}>{account.provider === "GMAIL" ? "G" : "D"}</span>
                    <div><strong>{account.displayName || account.emailAddress}</strong><p>{account.emailAddress} · {displayTerm(account.provider)}</p><span>Last sync {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "not completed"}</span></div>
                    <Pill value={account.status} />
                    <AccountActions account={account} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Active block list</h2><ShieldOff size={16} /></div>
            <div className="panel-body"><SuppressionForm /><div className="suppression-list">
              {suppressions.map((entry: any) => <div key={entry.id}><span className="icon-box"><ShieldOff size={14} /></span><div><strong>{entry.normalizedDestination || entry.domain || entry.company?.name || "Entire workspace"}</strong><p>{displayTerm(entry.reason)} · {entry.details || "No operator note"}</p></div><RevokeSuppression id={entry.id} /></div>)}
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
              <Readiness ready={true} label="Regular inbox reconciliation" />
              <Readiness ready={true} label="Approval + block-list checks" />
              <Readiness ready={Boolean(status.attachments?.signingConfigured)} label="Secure attachment links" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Delivery pulse</h2><BarChart3 size={16} /></div>
            <div className="panel-body delivery-pulse">
              <div className="delivery-bars">{analytics.statuses.map((item: any) => <div key={item.status}><span><Pill value={item.status} /></span><strong>{item._count}</strong><div><i style={{ width: `${Math.min(100, item._count * 12)}%` }} /></div></div>)}</div>
              {analytics.recentFailures.map((message: any) => <article key={message.id}><div><strong>{message.company?.name || "Unknown lead"}</strong><span>{message.failureReason || message.bounceCategory || "Delivery needs review"}</span></div><DeliveryEventActions messageId={message.id} status={message.status} /></article>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Reusable templates</h2><FileText size={16} /></div>
            <div className="panel-body template-list">{templates.map((template: any) => <div key={template.id}><div><strong>{template.name}</strong><Pill value={template.category} /></div><span>{template.subject || "No subject"}</span><p>{template.body}</p><small>{template.variables.length} variables · approval {template.approvalMode.toLowerCase()}</small></div>)}</div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Follow-up sequences</h2><Route size={16} /></div>
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

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span><MailCheck size={17} /></div><div className="metric-value">{value}</div></div>;
}

function Readiness({ ready, label }: { ready: boolean; label: string }) {
  return <div className={ready ? "ready" : ""}>{ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<span>{label}</span><strong>{ready ? "Ready" : "Action needed"}</strong></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
