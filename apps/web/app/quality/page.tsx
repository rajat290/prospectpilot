import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { ContextHelp } from "../../components/context-help";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";

export default async function QualityPage() {
  const [summary, leads, sources] = await Promise.all([
    apiGet<any>("/quality/summary", { trust: [], openIssues: [], quarantined: 0, average: { _avg: {} } }),
    apiGet<any[]>("/companies?hasIssues=true&limit=250", []),
    apiGet<any[]>("/sources", [])
  ]);
  const trustCount = (status: string) => summary.trust.find((item: any) => item.trustStatus === status)?._count || 0;
  const issueCount = (severity: string) => summary.openIssues.find((item: any) => item.severity === severity)?._count || 0;

  return (
    <main className="page">
      <header className="page-head">
        <div><p className="eyebrow">Data quality</p><h1>Data quality</h1><p className="subtle">Every uncertain field should be visible, attributable, and reviewable.</p></div>
        <div className="actions"><a className="button primary" href="/leads?trustStatus=VERIFIED"><ShieldCheck size={14} /> Verified leads</a></div>
      </header>

      <ContextHelp title="This page protects your reputation">
        Resolve critical identity conflicts first, then missing contacts and stale evidence. A high sales score never overrides weak source evidence.
      </ContextHelp>

      <section className="metric-grid quality-metrics-grid">
        <QualitySummary icon={<ShieldCheck size={17} />} label="Verified" value={trustCount("VERIFIED")} note="Human or multi-source confirmed" tone="green" />
        <QualitySummary icon={<CheckCircle2 size={17} />} label="Probable" value={trustCount("PROBABLE")} note="Strong automatic evidence" tone="blue" />
        <QualitySummary icon={<AlertTriangle size={17} />} label="Critical issues" value={issueCount("CRITICAL")} note="Manual review required" tone="red" />
        <QualitySummary icon={<Database size={17} />} label="Quarantined" value={summary.quarantined} note="Excluded from trusted outreach" tone="yellow" />
        <QualitySummary icon={<ShieldCheck size={17} />} label="Avg completeness" value={`${Math.round(summary.average?._avg?.dataCompleteness || 0)}%`} note="Across all company records" tone="neutral" />
      </section>

      <section className="band-grid quality-band">
        <div className="panel table-wrap">
          <div className="panel-head"><h2>Lead review queue</h2><span className="pill">{leads.length} leads</span></div>
          <table>
            <thead><tr><th>Lead</th><th>Trust</th><th>Confidence</th><th>Complete</th><th>Open issues</th><th>Action</th></tr></thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td><a className="company-link" href={`/leads/${lead.id}`}>{lead.name}</a><span className="cell-sub">{lead.identityKey || "Identity pending"}</span></td>
                  <td><Pill value={lead.trustStatus} /></td>
                  <td><span className="score">{lead.overallConfidence}%</span></td>
                  <td>{lead.dataCompleteness}%</td>
                  <td><span className={`issue-count ${lead.qualityIssues?.some((issue: any) => issue.severity === "CRITICAL") ? "critical" : ""}`}>{lead.qualityIssues?.length || 0}</span></td>
                  <td><a className="button" href={`/leads/${lead.id}`}>Review</a></td>
                </tr>
              ))}
              {!leads.length ? <tr><td colSpan={6}><div className="empty">No leads require quality review.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Connector reliability</h2></div>
          <div className="panel-body connector-health-list">
            {sources.map((source) => (
              <div key={source.id}>
                <div><strong>{source.name || new URL(source.url).hostname}</strong><Pill value={source.status} /></div>
                <p>{source.runs?.[0]?.strategy || "No strategy recorded"} · {source._count.companies} companies</p>
                <div className="health-track"><span style={{ width: `${source.connectorHealthScore}%` }} /></div>
                <small>{source.connectorHealthScore}% connector health</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function QualitySummary({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string | number; note: string; tone: string }) {
  return <div className={`metric quality-summary ${tone}`}><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}
