"use client";

import { Check, Link2, Loader2, Plus, RefreshCw, Send, ShieldOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiUrl } from "../lib/api";

export function GmailConnectButton({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/communications/oauth/gmail/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "/communications" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not start Gmail connection");
      window.location.assign(payload.authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection failed");
      setBusy(false);
    }
  }

  return (
    <div className="inline-action">
      <button className="button primary" disabled={!configured || busy} onClick={connect}>
        {busy ? <Loader2 className="spin" size={15} /> : <Link2 size={15} />} Connect Gmail
      </button>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

export function AccountActions({ account }: { account: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function act(action: "sync" | "disconnect") {
    setBusy(action);
    await fetch(`${apiUrl}/communications/accounts/${account.id}/${action}`, {
      method: action === "sync" ? "POST" : "PATCH"
    });
    setBusy("");
    router.refresh();
  }

  if (account.provider === "INTERNAL") return <span className="pill review">Simulation only</span>;
  return (
    <div className="actions">
      <button className="button icon" title="Sync mailbox now" disabled={Boolean(busy)} onClick={() => act("sync")}>
        <RefreshCw size={14} className={busy === "sync" ? "spin" : ""} />
      </button>
      <button className="button icon danger" title="Disconnect mailbox" disabled={Boolean(busy)} onClick={() => act("disconnect")}>
        <ShieldOff size={14} />
      </button>
    </div>
  );
}

export function ApprovalActions({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(action);
    await fetch(`${apiUrl}/messages/${messageId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    setBusy("");
    router.refresh();
  }

  return (
    <div className="actions">
      <button className="button primary" disabled={Boolean(busy)} onClick={() => act("approve")}>
        <Check size={14} /> Approve
      </button>
      <button className="button danger" disabled={Boolean(busy)} onClick={() => act("reject")}>
        <X size={14} /> Reject
      </button>
    </div>
  );
}

export function SuppressionForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/suppressions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "DESTINATION",
        normalizedDestination: form.get("destination"),
        reason: form.get("reason"),
        details: form.get("details")
      })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Could not add suppression");
    event.currentTarget.reset();
    setMessage("Address blocked from outbound messaging.");
    router.refresh();
  }

  return (
    <form className="suppression-form" onSubmit={submit}>
      <label className="label">Email address<input className="field" required name="destination" type="email" placeholder="person@company.com" /></label>
      <label className="label">Reason
        <select className="select" name="reason" defaultValue="MANUALLY_BLOCKED">
          <option value="MANUALLY_BLOCKED">Manual block</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="BOUNCED">Bounced</option>
          <option value="COMPLAINT">Complaint</option>
        </select>
      </label>
      <label className="label suppression-details">Operator note<input className="field" name="details" placeholder="Why this address must not receive messages" /></label>
      <button className="button danger" disabled={busy} type="submit"><Plus size={14} /> Add block</button>
      {message ? <span className="form-feedback">{message}</span> : null}
    </form>
  );
}

export function RevokeSuppression({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button icon"
      title="Revoke suppression"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`${apiUrl}/suppressions/${id}/revoke`, { method: "PATCH" });
        router.refresh();
      }}
    ><X size={14} /></button>
  );
}

export function SubmitApprovedMessage({ messageId, realMailbox }: { messageId: string; realMailbox: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="inline-action">
      <button
        className="button primary"
        disabled={!realMailbox || busy}
        title={realMailbox ? "Queue this approved email" : "Connect Gmail before sending"}
        onClick={async () => {
          setBusy(true);
          const response = await fetch(`${apiUrl}/messages/${messageId}/submit`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
          });
          const payload = await response.json();
          setBusy(false);
          if (!response.ok) return setError(payload.message || "Submission failed");
          router.refresh();
        }}
      ><Send size={14} /> Queue send</button>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
