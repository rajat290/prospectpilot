import { AlertTriangle, BrainCircuit, CheckCircle2, ListChecks, PackageCheck, Sparkles } from "lucide-react";
import { ContextHelp } from "../../components/context-help";
import { IntelligenceBackfillControl, IntelligenceReviewActions, ServicePackageManager } from "../../components/copilot-settings";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";

export default async function CopilotPage() {
  const [status, reviews, packages, brief] = await Promise.all([
    apiGet<any>("/intelligence/status", { configured: false, deterministicFallback: true, counts: {} }),
    apiGet<any[]>("/intelligence/reviews", []),
    apiGet<any[]>("/service-packages", []),
    apiGet<any>("/command-brief", { counts: {}, priorities: [], atRisk: [] })
  ]);
  return (
    <main className="page copilot-page">
      <header className="page-head">
        <div><p className="eyebrow">Communication intelligence</p><h1>Sales Copilot control room.</h1><p className="subtle">Review uncertain decisions, approve commercial boundaries, and inspect what the system recommends next.</p></div>
        <div className="actions"><IntelligenceBackfillControl /><a className="button primary" href="/inbox"><Sparkles size={15} /> Open intelligent inbox</a></div>
      </header>

      <ContextHelp title="Human authority stays final">
        Deterministic opt-outs apply immediately. Commercial stage changes and every AI-assisted reply still require operator approval. Drafts cannot bypass the existing send queue.
      </ContextHelp>

      <section className="metric-grid copilot-metrics">
        <Metric icon={<BrainCircuit size={17} />} label="Analyzed replies" value={status.counts.analyzed || 0} note={status.automaticAiEnabled ? `${status.model} automatic` : status.configured ? `${status.model} manual only` : "Rule fallback only"} />
        <Metric icon={<AlertTriangle size={17} />} label="Needs review" value={status.counts.reviewRequired || 0} note={`Below ${status.reviewThreshold || 70}% confidence`} />
        <Metric icon={<ListChecks size={17} />} label="Pending actions" value={status.counts.pendingActions || 0} note="Awaiting approval" />
        <Metric icon={<CheckCircle2 size={17} />} label="Open tasks" value={status.counts.openTasks || 0} note="Revenue work queue" />
        <Metric icon={<PackageCheck size={17} />} label="Approved packages" value={status.counts.approvedPackages || 0} note="Pricing guardrails" />
        <Metric icon={<AlertTriangle size={17} />} label="Provider failures" value={status.counts.failedRuns || 0} note="Safe fallback preserved" />
      </section>

      <section className="band-grid copilot-grid">
        <div className="panel">
          <div className="panel-head"><h2>Low-confidence review queue</h2><span className="pill">{reviews.length} waiting</span></div>
          <div className="review-queue">
            {reviews.map((item) => (
              <article key={item.id}>
                <header><div><strong>{item.company?.name || "Unmatched conversation"}</strong><span>{item.message.subject || "No subject"}</span></div><Pill value={item.category} /></header>
                <p>{item.message.bodyText}</p>
                <footer><span>{item.confidence}% confidence / {item.sentiment.toLowerCase()} / {item.commercialIntent.toLowerCase()} intent</span><IntelligenceReviewActions item={item} /></footer>
              </article>
            ))}
            {!reviews.length ? <div className="empty"><CheckCircle2 size={22} /><p>No low-confidence reply is waiting.</p></div> : null}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Today&apos;s action pressure</h2><ListChecks size={17} /></div>
          <div className="panel-body stack">
            <Fact label="Needs reply" value={brief.counts.needsReply || 0} />
            <Fact label="High intent" value={brief.counts.highIntent || 0} />
            <Fact label="Pricing questions" value={brief.counts.pricingQuestions || 0} />
            <Fact label="Meeting intent" value={brief.counts.meetingIntents || 0} />
            <Fact label="At risk" value={brief.atRisk?.length || 0} />
          </div>
        </div>
      </section>

      <section className="panel package-panel">
        <div className="panel-head"><h2>Approved service and pricing boundaries</h2><PackageCheck size={17} /></div>
        <div className="panel-body"><ServicePackageManager packages={packages} /></div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function Fact({ label, value }: { label: string; value: number }) {
  return <div className="command-fact"><span>{label}</span><strong>{value}</strong></div>;
}
