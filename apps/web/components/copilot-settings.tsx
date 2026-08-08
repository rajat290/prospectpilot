"use client";

import { Check, History, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiUrl } from "../lib/api";

export function IntelligenceReviewActions({ item }: { item: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function review(decision: "APPROVED" | "REJECTED") {
    setBusy(true);
    await fetch(`${apiUrl}/reply-intelligence/${item.id}/review`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    setBusy(false);
    router.refresh();
  }
  return <div className="actions"><button className="button primary" disabled={busy} onClick={() => review("APPROVED")}><Check size={14} /> Approve</button><button className="button" disabled={busy} onClick={() => review("REJECTED")}><X size={14} /> Reject</button></div>;
}

export function IntelligenceBackfillControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  async function run(dryRun: boolean) {
    setBusy(true);
    setNotice("");
    const response = await fetch(`${apiUrl}/intelligence/backfill`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun, limit: 200 })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(payload.message || "Backlog scan failed.");
    if (dryRun) {
      setCandidates(payload.candidates);
      return setNotice(payload.candidates ? `${payload.candidates} historical replies are ready to analyze.` : "No historical reply is waiting for analysis.");
    }
    setCandidates(0);
    setNotice(`${payload.queued} historical replies queued. Automatic AI privacy settings remain enforced.`);
    router.refresh();
  }

  const queueReady = candidates != null && candidates > 0;
  return <div className="backfill-control"><button className="button" disabled={busy} onClick={() => run(!queueReady)}><History size={15} />{busy ? "Working..." : queueReady ? `Queue ${candidates} replies` : "Scan reply backlog"}</button>{notice ? <span className="subtle">{notice}</span> : null}</div>;
}

export function ServicePackageManager({ packages }: { packages: any[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/service-packages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        currency: form.get("currency"),
        minimumPrice: Number(form.get("minimumPrice")),
        maximumPrice: Number(form.get("maximumPrice")),
        deliveryMinDays: Number(form.get("deliveryMinDays")),
        deliveryMaxDays: Number(form.get("deliveryMaxDays")),
        capabilities: String(form.get("capabilities") || "").split(",").map((item) => item.trim()).filter(Boolean),
        exclusions: String(form.get("exclusions") || "").split(",").map((item) => item.trim()).filter(Boolean),
        approved: false
      })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(payload.message || "Could not create package.");
    event.currentTarget.reset();
    setNotice("Package saved in unapproved state. Review it before activation.");
    router.refresh();
  }

  async function toggle(item: any) {
    setBusy(true);
    const response = await fetch(`${apiUrl}/service-packages/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ approved: !item.approved }) });
    setBusy(false);
    if (!response.ok) return setNotice("Could not update package approval.");
    router.refresh();
  }

  return (
    <div className="package-manager">
      <div className="package-list">
        {packages.map((item) => (
          <article className={item.approved ? "approved" : ""} key={item.id}>
            <header><div><strong>{item.name}</strong><span>{item.currency} {item.minimumPrice?.toLocaleString()}-{item.maximumPrice?.toLocaleString()} / {item.deliveryMinDays}-{item.deliveryMaxDays} days</span></div><button className="button" disabled={busy} onClick={() => toggle(item)}>{item.approved ? <><ShieldCheck size={14} /> Approved</> : <><Check size={14} /> Approve</>}</button></header>
            <p>{item.description}</p>
            <small>{item.capabilities.join(" / ") || "No capabilities listed"}</small>
          </article>
        ))}
        {!packages.length ? <div className="empty">No approved pricing boundaries exist yet.</div> : null}
      </div>
      <form className="package-form" onSubmit={create}>
        <h3>Add service package</h3>
        <div className="form-grid">
          <label className="label">Name<input className="field" name="name" required /></label>
          <label className="label">Currency<input className="field" name="currency" defaultValue="USD" maxLength={3} required /></label>
          <label className="label span-2">Description<textarea className="textarea" name="description" required /></label>
          <label className="label">Minimum price<input className="field" name="minimumPrice" type="number" min="0" required /></label>
          <label className="label">Maximum price<input className="field" name="maximumPrice" type="number" min="0" required /></label>
          <label className="label">Minimum delivery days<input className="field" name="deliveryMinDays" type="number" min="1" required /></label>
          <label className="label">Maximum delivery days<input className="field" name="deliveryMaxDays" type="number" min="1" required /></label>
          <label className="label span-2">Approved capabilities<input className="field" name="capabilities" placeholder="CRM routing, quote workflow, dashboard" /></label>
          <label className="label span-2">Explicit exclusions<input className="field" name="exclusions" placeholder="ERP migration, native mobile app" /></label>
        </div>
        <button className="button primary" disabled={busy} type="submit"><Plus size={14} /> Save unapproved package</button>
        {notice ? <p className="subtle">{notice}</p> : null}
      </form>
    </div>
  );
}
