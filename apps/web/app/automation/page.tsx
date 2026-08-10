import { AlertTriangle, Bot, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { AutomationActions } from "../../components/automation-actions";
import { Pill } from "../../components/pill";
import { apiGet } from "../../lib/api";
import { ContextHelp } from "../../components/context-help";
import { displayTerm } from "../../lib/terminology";

export default async function AutomationPage() {
  const [sources, jobs, reports] = await Promise.all([
    apiGet<any[]>("/sources", []),
    apiGet<any[]>("/jobs?limit=75", []),
    apiGet<any[]>("/reports/daily", [])
  ]);
  const active = sources.filter((source) => source.automationEnabled);
  const failed = jobs.filter((job) => job.status === "FAILED");
  const running = jobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status));
  const report = reports[0];

  return (
    <main className="page">
      <header className="page-head">
        <div><p className="eyebrow">Automation</p><h1>Automation</h1><p className="subtle">Scheduled lead collection and follow-up work stay visible, retryable, and easy to monitor.</p></div>
        <AutomationActions mode="report" />
      </header>
      <ContextHelp title="Operational health, not lead review">
        Use this page to confirm scheduled work is running. Retry failed work after reading the error; refresh the daily report after a crawl finishes.
      </ContextHelp>
      <section className="attention-list">
        <strong>What needs attention</strong>
        {failed.length ? <a href="#job-history"><AlertTriangle size={15} /> Review {failed.length} failed {failed.length === 1 ? "job" : "jobs"}</a> : null}
        {running.length ? <span><Clock3 size={15} /> {running.length} work items currently in flight</span> : null}
        {!active.length ? <a href="/sources"><Bot size={15} /> Enable daily collection on at least one source</a> : null}
        {!failed.length && !running.length && active.length ? <span><CheckCircle2 size={15} /> Automation looks clear right now</span> : null}
      </section>
      <section className="metric-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Metric label="Automated sources" value={active.length} icon={<Bot size={17} />} />
        <Metric label="In flight" value={running.length} icon={<Clock3 size={17} />} />
        <Metric label="Completed jobs" value={jobs.filter((job) => job.status === "COMPLETE").length} icon={<CheckCircle2 size={17} />} />
        <Metric label="Failed jobs" value={failed.length} icon={<AlertTriangle size={17} />} />
      </section>

      <section className="band-grid">
        <div className="panel" id="job-history">
          <div className="panel-head"><h2>Job history</h2><RefreshCw size={15} /></div>
          <div className="table-wrap">
            <ContextHelp compact title="Job lifecycle">Queued is waiting, Running is active, Complete succeeded, and Failed can be retried from the Action column.</ContextHelp>
            <table>
              <thead><tr><th>Job</th><th>Source</th><th>Status</th><th>Attempts</th><th>Started</th><th>Action</th></tr></thead>
              <tbody>
                {jobs.map((job) => <tr key={job.id}><td>{displayTerm(job.type)}</td><td>{job.leadSource?.name || job.leadSource?.url || "System"}</td><td><Pill value={job.status} /></td><td>{job.attempts}</td><td>{new Date(job.startedAt || job.createdAt).toLocaleString()}</td><td>{job.status === "FAILED" ? <AutomationActions mode="retry" jobId={job.id} /> : <span className="cell-sub">{job.completedAt ? `${Math.max(0, Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt || job.createdAt).getTime()) / 1000))}s` : "—"}</span>}</td></tr>)}
                {!jobs.length ? <tr><td colSpan={6}><div className="empty">No jobs recorded yet.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h2>Today&apos;s report</h2><Pill value={report ? "COMPLETE" : "PENDING"} /></div>
            <div className="panel-body">
              <ContextHelp compact title="Daily summary">Counts cover today&apos;s records and contacts. They change when you refresh the report.</ContextHelp>
              {report ? <div className="facts">
                <Fact label="Leads found" value={report.leadsFound} />
                <Fact label="Qualified" value={report.qualifiedLeads} />
                <Fact label="Hot" value={report.hotLeads} />
                <Fact label="Emails" value={report.emailsFound} />
                <Fact label="Phones" value={report.phonesFound} />
                <Fact label="Failures" value={report.failedJobs} />
              </div> : <div className="empty">Generate the first report after seeding or crawling.</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Active schedules</h2><span className="pill">{active.length}</span></div>
            <div className="panel-body stack">
              <ContextHelp compact title="When automation runs">Schedules are processed while the automation service is running.</ContextHelp>
              {active.map((source) => <div className="list-row" key={source.id}><span className="icon-box"><Bot size={15} /></span><div className="list-row-main"><strong>{source.name || new URL(source.url).hostname}</strong><p>{describeSchedule(source.scheduleCron)} · {source.scheduleTimezone}<br />Next run: {source.nextRunAt ? new Date(source.nextRunAt).toLocaleString() : "calculating"}</p></div></div>)}
              {!active.length ? <div className="empty">Enable automation from the Sources page.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div></div>;
}
function Fact({ label, value }: { label: string; value: number }) {
  return <div className="fact"><small>{label}</small><strong>{value}</strong></div>;
}

function describeSchedule(cron?: string) {
  if (cron === "0 8 * * *") return "Every day at 8:00 AM";
  if (cron === "0 9 * * *") return "Every day at 9:00 AM";
  if (cron === "0 18 * * *") return "Every day at 6:00 PM";
  return "Custom schedule";
}
