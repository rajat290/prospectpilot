"use client";

import { RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";
import { FieldHelp } from "./context-help";

const stages = ["NEW","RESEARCH","QUALIFIED","OUTREACH_READY","CONTACTED","REPLIED","MEETING","PROPOSAL","WON","LOST","RETAINER"];

export function LeadActions({ companyId, crmItem, mode = "compact" }: { companyId: string; crmItem?: any; mode?: "compact" | "panel" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(crmItem?.status || "NEW");
  const [reminder, setReminder] = useState(crmItem?.nextReminderAt?.slice(0, 16) || "");
  const [note, setNote] = useState("");

  async function request(path: string, init: RequestInit) {
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}${path}`, init);
      if (!response.ok) throw new Error("Action failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "compact") {
    return <button className="button primary" disabled={busy} onClick={() => request(`/companies/${companyId}/enrich`, { method: "POST" })}><RefreshCw size={14} /> {busy ? "Queued" : "Re-run intelligence"}</button>;
  }

  return (
    <div className="panel">
      <div className="panel-head"><h2>CRM control</h2></div>
      <div className="panel-body stack">
        <label className="label">Pipeline stage<select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><FieldHelp>Choose the last real action that happened with this prospect.</FieldHelp></label>
        <label className="label">Next reminder<input className="field" type="datetime-local" value={reminder} onChange={(event) => setReminder(event.target.value)} /><FieldHelp>Set the next follow-up time before leaving this lead.</FieldHelp></label>
        <button className="button primary" disabled={busy} onClick={() => request(`/companies/${companyId}/crm`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, nextReminderAt: reminder ? new Date(reminder).toISOString() : null }) })}><Save size={14} /> Save CRM state</button>
        <label className="label">Add a note<textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Call context, objection, next move..." /><FieldHelp>Record what was said and the next commitment, not general research.</FieldHelp></label>
        <button className="button" disabled={busy || !note.trim()} onClick={async () => { await request(`/companies/${companyId}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: note }) }); setNote(""); }}>Add note</button>
      </div>
    </div>
  );
}
