"use client";

import { Ban, Check, FlaskConical, Loader2, Play, RefreshCw, Rocket, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";

export function CampaignBuilder({ readiness, sequences }: { readiness: any; sequences: any[] }) {
  const router = useRouter();
  const activeSequences = sequences.filter((sequence) => sequence.status === "ACTIVE" && sequence.channel === "EMAIL");
  const [sequenceId, setSequenceId] = useState(readiness.sequence?.id || activeSequences[0]?.id || "");
  const [connectionId, setConnectionId] = useState(readiness.connectedMailboxes[0]?.id || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cap = Math.min(100, readiness.launchCap || 100);
  const available = readiness.eligible.slice(0, cap);

  function toggle(contactId: string) {
    setSelected((current) => current.includes(contactId)
      ? current.filter((id) => id !== contactId)
      : current.length < cap ? [...current, contactId] : current);
  }

  async function prepare() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/campaigns/launches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sequenceId, connectionId, contactIds: selected, confirmation })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Campaign preparation failed.");
    setSelected([]);
    setConfirmation("");
    setMessage("Campaign selection created. Review and approve it below.");
    router.refresh();
  }

  const canPrepare = Boolean(sequenceId && connectionId && selected.length && confirmation === `PREPARE ${selected.length}`);
  return (
    <div className="campaign-builder">
      <div className="campaign-config">
        <label className="label">Sequence
          <select className="select" value={sequenceId} onChange={(event) => setSequenceId(event.target.value)}>
            <option value="">Select active sequence</option>
            {activeSequences.map((sequence) => <option value={sequence.id} key={sequence.id}>{sequence.name}</option>)}
          </select>
        </label>
        <label className="label">Sending mailbox
          <select className="select" value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
            <option value="">Select real Gmail mailbox</option>
            {readiness.connectedMailboxes.map((account: any) => <option value={account.id} key={account.id}>{account.emailAddress}</option>)}
          </select>
        </label>
        <div className="campaign-selection-summary">
          <span>Selected</span><strong>{selected.length}/{cap}</strong>
          <button
            className="text-button"
            type="button"
            disabled={!available.length}
            onClick={() => setSelected(selected.length === available.length ? [] : available.map((item: any) => item.contactId))}
          >{selected.length === available.length ? "Clear" : `Select ${available.length}`}</button>
        </div>
      </div>

      <div className="campaign-targets">
        {available.length ? available.map((candidate: any) => (
          <label className={selected.includes(candidate.contactId) ? "campaign-target selected" : "campaign-target"} key={candidate.contactId}>
            <input type="checkbox" checked={selected.includes(candidate.contactId)} onChange={() => toggle(candidate.contactId)} />
            <span><strong>{candidate.companyName}</strong><small>{candidate.destination} · {candidate.country || "Country unknown"}</small></span>
            <b>{candidate.leadScore}</b>
          </label>
        )) : <div className="empty-state">No verified, unsuppressed and unused email contacts are currently eligible.</div>}
      </div>

      <div className="typed-confirmation">
        <label className="label">Typed confirmation
          <input
            className="field"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={selected.length ? `PREPARE ${selected.length}` : "Select recipients first"}
          />
        </label>
        <button className="button primary" disabled={!canPrepare || busy} onClick={prepare}>
          {busy ? <Loader2 className="spin" size={15} /> : <Rocket size={15} />} Prepare campaign
        </button>
      </div>
      {message ? <span className="form-feedback">{message}</span> : null}
    </div>
  );
}

export function CampaignLaunchActions({ launch }: { launch: any }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const draftCount = useMemo(
    () => launch.enrollments.filter((item: any) => item.messages?.[0]?.status === "PENDING_APPROVAL").length,
    [launch.enrollments]
  );

  async function act(action: "approve" | "launch" | "cancel") {
    setBusy(action);
    setMessage("");
    const response = await fetch(`${apiUrl}/campaigns/launches/${launch.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "cancel"
        ? { confirmation: "CANCEL" }
        : action === "launch"
          ? { confirmation, startAt: startAt ? new Date(startAt).toISOString() : undefined }
          : { confirmation })
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setMessage(payload.message || `${action} failed.`);
    setConfirmation("");
    setMessage(action === "launch" ? `${payload.scheduled} messages scheduled safely.` : `${action} completed.`);
    router.refresh();
  }

  const expectedConfirmation = launch.status === "AWAITING_APPROVAL"
    ? `APPROVE ${launch.enrolledCount}`
    : `LAUNCH ${draftCount}`;
  const actionable = ["AWAITING_APPROVAL", "PREPARING", "READY_TO_SEND"].includes(launch.status);
  return (
    <div className="campaign-launch-actions">
      {actionable ? (
        <>
          <input
            className="field"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={expectedConfirmation}
          />
          {launch.status === "AWAITING_APPROVAL" ? (
            <button className="button primary" disabled={busy !== "" || confirmation !== expectedConfirmation} onClick={() => act("approve")}>
              <Check size={14} /> Approve enrollments
            </button>
          ) : (
            <>
              <input className="field" aria-label="Optional campaign start time" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              <button className="button primary" disabled={busy !== "" || confirmation !== expectedConfirmation || launch.status !== "READY_TO_SEND"} onClick={() => act("launch")}>
                <Play size={14} /> Schedule launch
              </button>
            </>
          )}
        </>
      ) : null}
      {!["CANCELLED", "COMPLETED"].includes(launch.status) ? (
        <button className="button danger" disabled={busy !== ""} onClick={() => act("cancel")}><Ban size={14} /> Cancel</button>
      ) : null}
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  );
}

export function GmailAcceptanceActions({ account }: { account: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [revokeConfirmation, setRevokeConfirmation] = useState("");
  const [message, setMessage] = useState("");

  async function post(action: "refresh-test" | "reconcile-test" | "revoke") {
    setBusy(action);
    setMessage("");
    const response = await fetch(`${apiUrl}/communications/accounts/${account.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "revoke" ? { confirmation: revokeConfirmation } : {})
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setMessage(payload.message || `${action} failed.`);
    setMessage(action === "revoke" ? "Google access revoked and local tokens removed." : `${action.replace("-", " ")} passed or queued.`);
    router.refresh();
  }

  return (
    <div className="acceptance-actions">
      <button className="button" disabled={Boolean(busy) || account.status !== "CONNECTED"} onClick={() => post("refresh-test")}>
        <FlaskConical size={14} /> Test token refresh
      </button>
      <button className="button" disabled={Boolean(busy) || account.status !== "CONNECTED"} onClick={() => post("reconcile-test")}>
        <RefreshCw size={14} /> Reconcile now
      </button>
      <input className="field" value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} placeholder="Type REVOKE" />
      <button className="button danger" disabled={Boolean(busy) || revokeConfirmation !== "REVOKE"} onClick={() => post("revoke")}>
        <ShieldOff size={14} /> Revoke Google access
      </button>
      {message ? <span className="form-feedback">{message}</span> : null}
    </div>
  );
}
