import { AlertTriangle, CheckCircle2, Clock3, MailCheck, Rocket, ShieldCheck, Users } from "lucide-react";
import { CampaignBuilder, CampaignLaunchActions, GmailAcceptanceActions } from "../../components/campaign-actions";
import { ContextHelp } from "../../components/context-help";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [acceptance, readiness, sequences, launches] = await Promise.all([
    apiGet<any>("/communications/acceptance-readiness", { credentials: {}, accounts: [] }),
    apiGet<any>("/campaigns/readiness?limit=500", {
      providerReady: false,
      connectedMailboxes: [],
      eligibleCount: 0,
      blockedCount: 0,
      eligible: [],
      blocked: [],
      launchCap: 100
    }),
    apiGet<any[]>("/sequences", []),
    apiGet<any[]>("/campaigns/launches", [])
  ]);
  const credentialsReady = Boolean(
    acceptance.credentials?.encryptionKey &&
    acceptance.credentials?.gmailClientId &&
    acceptance.credentials?.gmailClientSecret
  );

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <p className="eyebrow">Phase 9C launch control</p>
          <h1>Campaign launch center.</h1>
          <p className="page-subtitle">Prove the Gmail loop, select only trustworthy recipients, and release a paced campaign with explicit operator approval.</p>
        </div>
        <a className="button" href="/communications"><MailCheck size={15} /> Communication control</a>
      </section>

      <section className="metric-grid campaign-metrics">
        <Metric label="Eligible now" value={readiness.eligibleCount || 0} icon={<Users size={17} />} />
        <Metric label="Blocked safely" value={readiness.blockedCount || 0} icon={<ShieldCheck size={17} />} />
        <Metric label="Real Gmail" value={readiness.connectedMailboxes.length || 0} icon={<MailCheck size={17} />} />
        <Metric label="Launch records" value={launches.length || 0} icon={<Rocket size={17} />} />
      </section>

      <section className="campaign-layout">
        <div className="campaign-main">
          <section className="panel">
            <div className="panel-head"><h2>Provider acceptance gate</h2><Pill value={readiness.providerReady ? "READY" : "BLOCKED"} /></div>
            <div className="panel-body">
              <ContextHelp compact title="No secret exposure">This screen reports only configured/not-configured state and encrypted-token presence. It never returns OAuth tokens or secret values.</ContextHelp>
              <div className="acceptance-checklist">
                <Readiness ready={Boolean(acceptance.credentials?.encryptionKey)} label="Token encryption key" />
                <Readiness ready={Boolean(acceptance.credentials?.gmailClientId)} label="Google OAuth client ID" />
                <Readiness ready={Boolean(acceptance.credentials?.gmailClientSecret)} label="Google OAuth client secret" />
                <Readiness ready={Boolean(readiness.connectedMailboxes.length)} label="Dedicated Gmail mailbox connected" />
                <Readiness ready={Boolean(acceptance.credentials?.attachmentSigning)} label="Attachment download signing" />
                <Readiness ready={Boolean(acceptance.credentials?.pubsub)} optional label="Gmail push notifications" />
              </div>
              {!credentialsReady ? <div className="setup-warning"><AlertTriangle size={16} /><div><strong>Provider activation required</strong><span>Add Google OAuth credentials locally, restart the stack, then connect the dedicated test mailbox.</span></div></div> : null}
              {acceptance.accounts.map((account: any) => (
                <article className="acceptance-account" key={account.id}>
                  <div>
                    <strong>{account.emailAddress}</strong>
                    <span>{account.status} · token encrypted {account.refreshTokenStoredEncrypted ? "yes" : "no"} · events {account._count.connectionEvents}</span>
                  </div>
                  <GmailAcceptanceActions account={account} />
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Prepare a controlled campaign</h2><span className="panel-count">{Math.min(100, readiness.launchCap || 100)} max</span></div>
            <div className="panel-body">
              <ContextHelp compact title="Prepare does not send">Preparation creates approval-gated enrollments. A second typed confirmation is required after all personalized first-touch drafts exist.</ContextHelp>
              <CampaignBuilder readiness={readiness} sequences={sequences} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Launch operations</h2><span className="panel-count">{launches.length}</span></div>
            <div className="panel-body campaign-launch-list">
              {launches.length ? launches.map((launch: any) => (
                <article className="campaign-launch" key={launch.id}>
                  <header>
                    <div><strong>{launch.sequence.name}</strong><span>via {launch.connection.emailAddress}</span></div>
                    <Pill value={launch.status} />
                  </header>
                  <div className="campaign-progress">
                    <span><b>{launch.enrolledCount}</b> enrolled</span>
                    <span><b>{launch.approvedMessageCount}</b> approved</span>
                    <span><b>{launch.scheduledCount}</b> scheduled</span>
                    <span><b>{launch.sequence.dailyLimit}</b>/day</span>
                  </div>
                  <small>{launch.sequence.perDomainLimit}/domain · {launch.sequence.sendingTimezone} · created {formatDate(launch.createdAt)}</small>
                  <CampaignLaunchActions launch={launch} />
                </article>
              )) : <div className="empty-state">No campaign launch has been prepared yet.</div>}
            </div>
          </section>
        </div>

        <aside className="campaign-side">
          <section className="panel">
            <div className="panel-head"><h2>Safety policy</h2><ShieldCheck size={16} /></div>
            <div className="panel-body launch-policy">
              <Policy label="Human approval" value="Required twice" />
              <Policy label="Launch ceiling" value={`${Math.min(100, readiness.launchCap || 100)} recipients`} />
              <Policy label="Duplicate sends" value="Blocked" />
              <Policy label="Suppression" value="Checked at select and send" />
              <Policy label="Reply exit" value="Automatic" />
              <Policy label="Opt-out line" value="Required" />
              <Policy label="Restart recovery" value="Redis-backed queue" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Blocked contacts</h2><span className="panel-count">{readiness.blockedCount || 0}</span></div>
            <div className="panel-body blocked-candidates">
              {readiness.blocked.slice(0, 30).map((candidate: any) => (
                <div key={candidate.contactId}>
                  <strong>{candidate.companyName}</strong>
                  <span>{candidate.destination}</span>
                  <small>{candidate.reasons.join(" · ")}</small>
                </div>
              ))}
              {!readiness.blockedCount ? <div className="empty-state">No blocked contacts in the current candidate set.</div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Launch sequence</h2><Clock3 size={16} /></div>
            <div className="panel-body numbered-flow">
              <span><b>1</b> Connect and test Gmail</span>
              <span><b>2</b> Select eligible contacts</span>
              <span><b>3</b> Type PREPARE count</span>
              <span><b>4</b> Approve enrollments</span>
              <span><b>5</b> Review generated drafts</span>
              <span><b>6</b> Type LAUNCH count</span>
              <span><b>7</b> Monitor replies and bounces</span>
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

function Readiness({ ready, label, optional = false }: { ready: boolean; label: string; optional?: boolean }) {
  return <div className={ready ? "ready" : optional ? "optional" : ""}>{ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<span>{label}</span><strong>{ready ? "Ready" : optional ? "Optional" : "Action needed"}</strong></div>;
}

function Policy({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
