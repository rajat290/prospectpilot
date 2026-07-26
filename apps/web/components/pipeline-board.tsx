"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { Pill } from "./pill";

const columns = [
  { key: "RESEARCH", label: "Research" },
  { key: "OUTREACH_READY", label: "Outreach ready" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "REPLIED", label: "Replied" },
  { key: "MEETING", label: "Meeting" },
  { key: "PROPOSAL", label: "Proposal" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" }
];

export function PipelineBoard({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const grouped = useMemo(() => Object.fromEntries(columns.map((column) => [column.key, leads.filter((lead) => (lead.crmItem?.status || "RESEARCH") === column.key)])), [leads]);

  async function move(companyId: string, status: string) {
    const previous = leads;
    setLeads((items) => items.map((lead) => lead.id === companyId ? { ...lead, crmItem: { ...lead.crmItem, status } } : lead));
    const response = await fetch(`${apiUrl}/companies/${companyId}/crm`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) setLeads(previous);
  }

  return (
    <div className="kanban">
      {columns.map((column) => (
        <section className="kanban-column" key={column.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event.dataTransfer.getData("companyId"), column.key)}>
          <header className="kanban-head"><span>{column.label}</span><span>{(grouped[column.key] ?? []).length}</span></header>
          <div className="kanban-body">
            {(grouped[column.key] ?? []).map((lead: any) => (
              <article className="lead-card" draggable onDragStart={(event) => event.dataTransfer.setData("companyId", lead.id)} key={lead.id}>
                <div className="split-status"><a className="company-link" href={`/leads/${lead.id}`}>{lead.name}</a><span className="score">{lead.leadScore?.score ?? "-"}</span></div>
                <p>{lead.opportunities?.[0]?.recommendedService || "Opportunity pending"}</p>
                <div className="split-status"><Pill value={lead.leadScore?.band || "REVIEW"} /><select className="select" style={{ width: 105, height: 30, fontSize: 10 }} value={lead.crmItem?.status || "RESEARCH"} onChange={(event) => move(lead.id, event.target.value)}>{columns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
