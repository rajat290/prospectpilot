"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { Pill } from "./pill";
import { displayTerm } from "../lib/terminology";

const columns = [
  "NEW",
  "RESEARCH",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
  "RETAINER"
];

export function PipelineBoard({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const grouped = useMemo(() => Object.fromEntries(columns.map((column) => [column, leads.filter((lead) => (lead.crmItem?.status || "RESEARCH") === column)])), [leads]);

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
        <section className="kanban-column" key={column} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event.dataTransfer.getData("companyId"), column)}>
          <header className="kanban-head"><span>{displayTerm(column)}</span><span>{(grouped[column] ?? []).length}</span></header>
          <div className="kanban-body">
            {(grouped[column] ?? []).map((lead: any) => (
              <article className="lead-card" draggable onDragStart={(event) => event.dataTransfer.setData("companyId", lead.id)} key={lead.id}>
                <div className="split-status"><a className="company-link" href={`/leads/${lead.id}`}>{lead.name}</a><span className="score">{lead.leadScore?.score ?? "-"}</span></div>
                <p>{lead.opportunities?.[0]?.recommendedService || "Opportunity pending"}</p>
                <div className="split-status"><Pill value={lead.leadScore?.band || "REVIEW"} /><select className="select" style={{ width: 120, height: 30, fontSize: 10 }} value={lead.crmItem?.status || "RESEARCH"} onChange={(event) => move(lead.id, event.target.value)}>{columns.map((item) => <option key={item} value={item}>{displayTerm(item)}</option>)}</select></div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
