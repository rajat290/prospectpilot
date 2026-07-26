import { BriefcaseBusiness } from "lucide-react";
import { PipelineBoard } from "../../components/pipeline-board";
import { apiGet } from "../../lib/api";
import { ContextHelp } from "../../components/context-help";

export default async function PipelinePage() {
  const leads = await apiGet<any[]>("/pipeline", []);
  return (
    <main className="page">
      <header className="page-head">
        <div><p className="eyebrow">CRM-lite</p><h1>Freelance deal pipeline</h1><p className="subtle">Move prospects as the conversation develops. Every change lands in the lead timeline.</p></div>
        <div className="actions"><span className="button"><BriefcaseBusiness size={15} /> {leads.length} tracked deals</span></div>
      </header>
      <ContextHelp title="Keep every conversation moving">
        Drag a card to another stage or use its dropdown. After sending a message choose Contacted; after a reply choose Replied; add reminders and notes from the lead page.
      </ContextHelp>
      <PipelineBoard initialLeads={leads} />
    </main>
  );
}
