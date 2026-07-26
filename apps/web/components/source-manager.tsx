"use client";

import { Pause, Play, Radar, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";
import { Pill } from "./pill";
import { FieldHelp } from "./context-help";

function formatRunTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

export function SourceManager({ mode, source }: { mode: "create" | "row"; source?: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(path: string, init: RequestInit) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${apiUrl}${path}`, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Request failed");
      setMessage(
        data.reused
          ? data.queued
            ? "Existing source reused. A fresh crawl has been queued."
            : "This source is already running, so no duplicate job was created."
          : "Source saved. Worker will update progress automatically."
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally { setBusy(false); }
  }

  if (mode === "create") {
    return (
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void call("/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name") || undefined, url: form.get("url"), maxRecords: form.get("maxRecords"), requestDelayMs: form.get("requestDelayMs") }) });
      }}>
        <label className="label">Source name<input className="field" name="name" placeholder="US automotive recyclers" /><FieldHelp>A recognizable label for filters and reports.</FieldHelp></label>
        <label className="label">Public directory URL<input className="field" required type="url" name="url" defaultValue="https://www.car-part.com/Services/dealers.htm" /><FieldHelp>The page that lists multiple public businesses, not one company website.</FieldHelp></label>
        <div className="form-grid">
          <label className="label">Record limit<input className="field" name="maxRecords" type="number" min="1" max="1000" defaultValue="25" /><FieldHelp>Use 25 for a first quality check; increase only after review.</FieldHelp></label>
          <label className="label">Batch delay (ms)<input className="field" name="requestDelayMs" type="number" min="250" max="10000" step="250" defaultValue="750" /><FieldHelp>750-1000 ms is a responsible starting pace.</FieldHelp></label>
        </div>
        <button className="button primary" disabled={busy}><Play size={14} /> {busy ? "Queueing..." : "Start extraction"}</button>
        {message ? <p className="subtle">{message}</p> : null}
      </form>
    );
  }

  const automated = Boolean(source.automationEnabled);
  return (
    <div className="list-row">
      <span className="icon-box"><Radar size={15} /></span>
      <div className="list-row-main">
        <div className="split-status"><strong>{source.name || new URL(source.url).hostname}</strong><Pill value={source.status} /></div>
        <p style={{ overflowWrap: "anywhere" }}>{source.url}</p>
        <p>{source._count.companies} companies | Cap {source.maxRecords} | {source.requestDelayMs}ms pacing<br />Last run {source.lastRunAt ? formatRunTime(source.lastRunAt) : "never"}{automated && source.nextRunAt ? ` | Next ${formatRunTime(source.nextRunAt)}` : ""}</p>
        {source.errorMessage ? <p style={{ color: "#b7443f" }}>{source.errorMessage}</p> : null}
      </div>
      <div className="actions">
        <button aria-label={`Run ${source.name || "source"} now`} title="Run this source now" className="button icon" disabled={busy} onClick={() => call(`/sources/${source.id}/run`, { method: "POST" })}><RefreshCw size={14} /></button>
        <button title={automated ? "Pause daily automation" : "Enable daily automation"} className="button icon" disabled={busy} onClick={() => call(`/sources/${source.id}/automation`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !automated, scheduleCron: source.scheduleCron, scheduleTimezone: source.scheduleTimezone }) })}>{automated ? <Pause size={14} /> : <Play size={14} />}</button>
      </div>
    </div>
  );
}
