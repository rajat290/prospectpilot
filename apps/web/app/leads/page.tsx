import { Download, Filter, Search } from "lucide-react";
import { Pill } from "../../components/pill";
import { WebsiteDiscoveryActions } from "../../components/website-discovery-actions";
import { ContextHelp } from "../../components/context-help";
import { apiGet, apiUrl } from "../../lib/api";

type SearchParams = {
  q?: string;
  sourceId?: string;
  connectorId?: string;
  scoreBand?: string;
  pipelineStage?: string;
  hasContact?: string;
};

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = new URLSearchParams({ limit: "250" });
  for (const [key, value] of Object.entries(searchParams)) if (value) query.set(key, value);
  const [leads, sources, providerStatus, dashboard] = await Promise.all([
    apiGet<any[]>(`/companies?${query}`, []),
    apiGet<any[]>("/sources", []),
    apiGet<any>("/providers/status", { search: { provider: "serpapi", configured: false } }),
    apiGet<any>("/dashboard", { missingWebsites: 0 })
  ]);

  return (
    <main className="page">
      <header className="page-head">
        <div><p className="eyebrow">Lead database</p><h1>Qualified prospect inventory</h1><p className="subtle">{leads.length} records in this view. Filter tightly before outreach.</p></div>
        <div className="actions"><a className="button" href={`${apiUrl}/companies/export.csv?${query}`}><Download size={15} /> Export this view</a><a className="button primary" href="/sources">Add source</a></div>
      </header>

      <ContextHelp title="Fastest way to build an outreach list">
        Select a real source, choose Hot or Qualified, and set Has contact. Open each shortlisted company to verify its website and sales angle before exporting or contacting it.
      </ContextHelp>

      <WebsiteDiscoveryActions
        configured={providerStatus.search.configured}
        provider={providerStatus.search.provider}
        missingWebsites={dashboard.missingWebsites}
        sourceId={searchParams.sourceId}
      />

      <form className="filters">
        <label style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: 12, color: "#647079" }} /><input className="field" style={{ paddingLeft: 32 }} name="q" defaultValue={searchParams.q} placeholder="Search company, city, industry" /></label>
        <select className="select" name="sourceId" defaultValue={searchParams.sourceId || ""}><option value="">All sources</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name || new URL(source.url).hostname}</option>)}</select>
        <select className="select" name="scoreBand" defaultValue={searchParams.scoreBand || ""}><option value="">Any score band</option><option value="HOT">Hot</option><option value="QUALIFIED">Qualified</option><option value="REVIEW">Needs review</option><option value="LOW">Low</option></select>
        <select className="select" name="pipelineStage" defaultValue={searchParams.pipelineStage || ""}><option value="">Any pipeline stage</option>{["NEW","RESEARCH","QUALIFIED","OUTREACH_READY","CONTACTED","REPLIED","MEETING","PROPOSAL","WON","LOST","RETAINER"].map((stage) => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select>
        <select className="select" name="hasContact" defaultValue={searchParams.hasContact || ""}><option value="">Any contact state</option><option value="true">Has contact</option><option value="false">Contact missing</option></select>
        <button className="button primary"><Filter size={14} /> Apply</button>
      </form>

      <div className="panel table-wrap">
        <ContextHelp compact title="Reading the table">Score ranks attention. Best offer is the detected service angle. Stage tells you what action has already happened.</ContextHelp>
        <table>
          <thead><tr><th>Company</th><th>Source</th><th>Primary contact</th><th>Technology</th><th>Best offer</th><th>Score</th><th>Stage</th></tr></thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td><a className="company-link" href={`/leads/${lead.id}`}>{lead.name}</a><span className="cell-sub">{lead.websiteUrl || [lead.city, lead.region].filter(Boolean).join(", ") || "Website discovery pending"}</span></td>
                <td><span className="pill">{lead.connectorId || "generic"}</span></td>
                <td>{lead.contacts?.[0]?.value || lead.email || lead.phone || "Missing"}</td>
                <td>{lead.technologies?.slice(0, 2).map((item: any) => item.name).join(", ") || "Unknown"}</td>
                <td>{lead.opportunities?.[0]?.recommendedService || "Pending analysis"}</td>
                <td><span className="score">{lead.leadScore?.score ?? "-"}</span></td>
                <td><Pill value={lead.crmItem?.status || lead.status} /></td>
              </tr>
            ))}
            {!leads.length ? <tr><td colSpan={7}><div className="empty">No leads match these filters.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
