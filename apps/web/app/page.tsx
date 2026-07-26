import { ArrowUpRight, AtSign, BriefcaseBusiness, Clock3, Database, Download, Plus, Radar, Sparkles } from "lucide-react";
import { apiGet, apiUrl } from "../lib/api";
import { Pill } from "../components/pill";
import { ContextHelp } from "../components/context-help";

type Stats = {
  sources: number;
  companies: number;
  contacts: number;
  audited: number;
  hotLeads: number;
  outreachReady: number;
  remindersDue: number;
  jobs: Array<{ status: string; _count: number }>;
  opportunityGroups: Array<{ category: string; _count: number }>;
};

export default async function OverviewPage() {
  const [stats, leads, sources, reports] = await Promise.all([
    apiGet<Stats>("/dashboard", {
      sources: 0, companies: 0, contacts: 0, audited: 0, hotLeads: 0, outreachReady: 0, remindersDue: 0, jobs: [], opportunityGroups: []
    }),
    apiGet<any[]>("/companies?limit=8", []),
    apiGet<any[]>("/sources", []),
    apiGet<any[]>("/reports/daily", [])
  ]);
  const report = reports[0];
  const completeJobs = stats.jobs.find((job) => job.status === "COMPLETE")?._count ?? 0;
  const failedJobs = stats.jobs.find((job) => job.status === "FAILED")?._count ?? 0;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Daily command center</p>
          <h1>Good leads, ready for action.</h1>
          <p className="subtle">Review today&apos;s intelligence, move the best prospects, and keep the pipeline honest.</p>
        </div>
        <div className="actions">
          <a className="button" href={`${apiUrl}/companies/export.csv?limit=1000`}><Download size={15} /> Export all</a>
          <a className="button primary" href="/sources"><Plus size={15} /> Add source</a>
        </div>
      </header>

      <ContextHelp title="Start your day here">
        First check Hot leads and reminders. Open one high-priority company, verify the evidence, then move it through outreach and CRM. Metrics are counts, not automatic approvals.
      </ContextHelp>

      <section className="metric-grid">
        <Metric label="Total leads" value={stats.companies} note={`${stats.audited} fully audited`} icon={<Database size={17} />} />
        <Metric label="Hot leads" value={stats.hotLeads} note="Priority score 80+" icon={<Sparkles size={17} />} />
        <Metric label="Outreach ready" value={stats.outreachReady} note="Drafts generated" icon={<AtSign size={17} />} />
        <Metric label="Reminders due" value={stats.remindersDue} note="Needs follow-up" icon={<Clock3 size={17} />} />
        <Metric label="Active sources" value={stats.sources} note={`${completeJobs} jobs completed`} icon={<Radar size={17} />} />
      </section>

      <section className="band-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Highest-priority prospects</h2>
            <a className="button" href="/leads">View database <ArrowUpRight size={14} /></a>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Company</th><th>Contact</th><th>Opportunity</th><th>Score</th><th>Pipeline</th></tr></thead>
              <tbody>
                {leads.length ? leads.map((lead) => (
                  <tr key={lead.id}>
                    <td><a className="company-link" href={`/leads/${lead.id}`}>{lead.name}</a><span className="cell-sub">{[lead.city, lead.region].filter(Boolean).join(", ") || lead.connectorId || "Unclassified"}</span></td>
                    <td>{lead.contacts?.[0]?.value || lead.email || lead.phone || "Research needed"}</td>
                    <td>{lead.opportunities?.[0]?.recommendedService || "Analysis pending"}</td>
                    <td><span className="score">{lead.leadScore?.score ?? "-"}</span></td>
                    <td><Pill value={lead.crmItem?.status || lead.status} /></td>
                  </tr>
                )) : <tr><td colSpan={5}><div className="empty">No leads yet. Seed the demo or add your first source.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h2>Today&apos;s field report</h2><BriefcaseBusiness size={17} /></div>
            <div className="panel-body">
              <ContextHelp compact title="What this report means">Today&apos;s crawl and enrichment output. Review failures on Automation before trusting the totals.</ContextHelp>
              {report ? (
                <div className="facts">
                  <Fact label="Found" value={report.leadsFound} />
                  <Fact label="Qualified" value={report.qualifiedLeads} />
                  <Fact label="Hot" value={report.hotLeads} />
                  <Fact label="Emails" value={report.emailsFound} />
                  <Fact label="Phones" value={report.phonesFound} />
                  <Fact label="Failures" value={report.failedJobs} />
                </div>
              ) : <div className="empty">Daily report will appear after the worker runs.</div>}
              {report?.bestLeadName ? <div className="notice" style={{ marginTop: 14 }}>Best lead: <strong>{report.bestLeadName}</strong> at {report.bestLeadScore}/100. Top category: {report.topOpportunity || "pending"}.</div> : null}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Source activity</h2><span className="pill">{failedJobs} failed jobs</span></div>
            <div className="panel-body stack">
              {sources.slice(0, 4).map((source) => (
                <div className="list-row" key={source.id}>
                  <span className="icon-box"><Radar size={15} /></span>
                  <div className="list-row-main"><strong>{source.name || new URL(source.url).hostname}</strong><p>{source._count.companies} companies · {source.automationEnabled ? "Daily automation on" : "Manual runs"}</p></div>
                  <Pill value={source.status} />
                </div>
              ))}
              {!sources.length ? <div className="empty">No source activity yet.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: number; note: string; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return <div className="fact"><small>{label}</small><strong>{value}</strong></div>;
}
