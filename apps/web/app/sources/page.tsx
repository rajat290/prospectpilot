import { Crosshair, Plus, Radar } from "lucide-react";
import { SourceManager } from "../../components/source-manager";
import { apiGet } from "../../lib/api";
import { ContextHelp } from "../../components/context-help";

export default async function SourcesPage() {
  const sources = await apiGet<any[]>("/sources", []);
  return (
    <main className="page">
      <header className="page-head">
        <div><p className="eyebrow">Find leads</p><h1>Find leads</h1><p className="subtle">Choose where leads come from, run controlled discovery, and review candidates before they enter outreach.</p></div>
        <div className="actions"><span className="button"><Radar size={15} /> {sources.length} configured sources</span></div>
      </header>
      <ContextHelp title="One source, one controlled sample">
        Paste a public directory URL, start with 25 records, and inspect the resulting leads before scaling. Run now repeats a source; the play/pause icon controls its daily schedule.
      </ContextHelp>
      <div className="source-grid">
        <div className="panel">
          <div className="panel-head"><h2><Plus size={15} style={{ display: "inline", marginRight: 7 }} />Add a public source</h2></div>
          <div className="panel-body">
            <SourceManager mode="create" />
            <div className="notice" style={{ marginTop: 16 }}>Start with Car-Part&apos;s dealer directory for the tuned connector. Generic public directory pages are also accepted. Respect each source&apos;s terms, robots rules, and reasonable request rates.</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Configured sources</h2><span className="pill">{sources.filter((source) => source.automationEnabled).length} automated</span></div>
          <div className="panel-body stack">
            <ContextHelp compact title="Source statuses">Crawling extracts companies, Enriching researches websites, Complete is ready for review, and Failed includes a retryable error.</ContextHelp>
            {sources.map((source) => <SourceManager key={source.id} mode="row" source={source} />)}
            {!sources.length ? <div className="empty">No source configured. Add one to queue the first crawl.</div> : null}
          </div>
        </div>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2><Crosshair size={15} style={{ display: "inline", marginRight: 7 }} />Lead source strategy</h2><a className="button" href="/source-strategy">Open strategy engine</a></div>
        <div className="panel-body">
          <ContextHelp compact title="Multi-source intake">Use the strategy engine to create regional missions across Google search, trade shows, associations, chambers, Car-Part, Thomasnet, Europages, hospitality directories, and IndiaMART-style lanes.</ContextHelp>
        </div>
      </section>
    </main>
  );
}
