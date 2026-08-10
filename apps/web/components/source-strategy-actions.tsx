"use client";

import { Check, Loader2, Plus, Search, Send, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";

export function First100MissionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createMission() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/source-strategy/missions/first-100`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Mission creation failed.");
    setMessage(payload.reused ? "Mission already exists. Continue collecting." : "First 100 lead mission created.");
    router.refresh();
  }

  return (
    <div className="source-engine-action">
      <button className="button primary" disabled={busy} onClick={createMission}>
        {busy ? <Loader2 className="spin" size={15} /> : <Target size={15} />} Start 100-lead mission
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function GlobalIntakeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createGlobalIntake() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/source-strategy/missions/global-intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Global intake setup failed.");
    const added = (payload.missions || []).reduce((total: number, mission: any) => total + (mission.addedTaskCount || 0), 0);
    setMessage(`Global intake ready: ${payload.missionCount} missions, ${added} new lanes added.`);
    router.refresh();
  }

  return (
    <div className="source-engine-action">
      <button className="button" disabled={busy} onClick={createGlobalIntake}>
        {busy ? <Loader2 className="spin" size={15} /> : <GlobeIcon />} Multi-source intake
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function MissionBatchDiscoveryButton({ mission }: { mission: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runBatch() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/source-strategy/missions/${mission.id}/discover-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskLimit: 4, patternsPerTask: 1, resultLimit: 5 })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Batch discovery failed.");
    setMessage(`Batch pulled ${payload.totals?.created || 0}; rejected ${payload.totals?.rejected || 0}; skipped ${payload.totals?.skipped || 0}.`);
    router.refresh();
  }

  return (
    <div className="source-engine-action compact-action">
      <button className="button primary" disabled={busy} onClick={runBatch}>
        {busy ? <Loader2 className="spin" size={14} /> : <Search size={14} />} Run mission batch
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function TaskStatusButton({ task }: { task: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function updateStatus(status: string) {
    setBusy(true);
    await fetch(`${apiUrl}/source-strategy/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    setBusy(false);
    router.refresh();
  }

  const next = task.status === "OPEN" ? "IN_PROGRESS" : task.status === "IN_PROGRESS" ? "DONE" : "IN_PROGRESS";
  return (
    <button className="button" disabled={busy} onClick={() => updateStatus(next)}>
      {busy ? <Loader2 className="spin" size={14} /> : <Check size={14} />} {next === "DONE" ? "Mark done" : "Work lane"}
    </button>
  );
}

export function DiscoverTaskLeadsButton({ task }: { task: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState(task.searchPatterns?.[0] || "");

  async function discover() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/source-strategy/tasks/${task.id}/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 5 })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Discovery failed.");
    setMessage(`Pulled ${payload.createdCount} candidates. ${payload.skippedCount} duplicates skipped.`);
    router.refresh();
  }

  return (
    <div className="task-discovery">
      <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search query" />
      <button className="button primary" disabled={busy || !query} onClick={discover}>
        {busy ? <Loader2 className="spin" size={14} /> : <Search size={14} />} Discover leads
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function CandidateCaptureForm({ task, offer }: { task: any; offer?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const payload: Record<string, FormDataEntryValue> = {};
    formData.forEach((value, key) => {
      payload[key] = value;
    });
    const response = await fetch(`${apiUrl}/source-strategy/tasks/${task.id}/candidates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.message || "Lead capture failed.");
    setMessage(`Captured ${data.companyName} with score ${data.qualityScore}.`);
    router.refresh();
  }

  return (
    <form action={submit} className="candidate-capture-form">
      <input className="field" name="companyName" placeholder="Company name" required />
      <input className="field" name="websiteUrl" placeholder="https://company.com" />
      <input className="field" name="email" placeholder="email@company.com" />
      <input className="field" name="phone" placeholder="Phone" />
      <input className="field" name="country" placeholder="Country" />
      <input className="field" name="industry" placeholder="Industry" />
      <input className="field" name="sourceUrl" placeholder="Source URL" />
      <input className="field" name="recommendedOffer" placeholder="Recommended offer" defaultValue={offer || ""} />
      <textarea className="field" name="painEvidence" placeholder="Visible pain/evidence: weak quote form, no booking, old website, manual follow-up..." />
      <button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Capture lead</button>
      {message ? <span className="form-feedback">{message}</span> : null}
    </form>
  );
}

export function PromoteCandidateButton({ candidate }: { candidate: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function promote() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/source-strategy/candidates/${candidate.id}/promote`, { method: "POST" });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Promotion failed.");
    setMessage(payload.reused ? "Linked to existing lead." : "Promoted to Leads.");
    router.refresh();
  }

  if (candidate.status === "PROMOTED" || candidate.companyId) return <a className="button" href={`/leads/${candidate.companyId}`}><Send size={14} /> Open lead</a>;
  return (
    <div className="candidate-action">
      <button className="button" disabled={busy || !candidate.email || !candidate.websiteUrl} onClick={promote}>
        {busy ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Promote to Leads
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

function GlobeIcon() {
  return <Target size={15} />;
}
