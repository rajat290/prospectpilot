"use client";

import { Check, Clock3, Link2, Loader2, Pause, Play, Plus, RefreshCw, RotateCcw, Send, ShieldOff, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiUrl } from "../lib/api";
import { displayTerm } from "../lib/terminology";

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
        body: JSON.stringify({ returnUrl: "/email-settings" })
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
  const [scheduledAt, setScheduledAt] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
            body: JSON.stringify({
              scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
              recipientTimezone: timezone
            })
          });
          const payload = await response.json();
          setBusy(false);
          if (!response.ok) return setError(payload.message || "Submission failed");
          router.refresh();
        }}
      >{scheduledAt ? <Clock3 size={14} /> : <Send size={14} />} {scheduledAt ? "Schedule" : "Queue send"}</button>
      <input
        className="field compact-date"
        type="datetime-local"
        aria-label="Optional scheduled send time"
        min={toLocalInput(new Date(Date.now() + 60_000))}
        value={scheduledAt}
        onChange={(event) => setScheduledAt(event.target.value)}
      />
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

export function ScheduledMessageActions({ schedule }: { schedule: any }) {
  const router = useRouter();
  const [dueAt, setDueAt] = useState(toLocalInput(new Date(schedule.dueAt)));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || schedule.recipientTimezone || "UTC";

  async function reschedule() {
    setBusy("reschedule");
    setError("");
    const response = await fetch(`${apiUrl}/scheduled-messages/${schedule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueAt: new Date(dueAt).toISOString(), recipientTimezone: timezone })
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setError(payload.message || "Reschedule failed");
    router.refresh();
  }

  async function cancel() {
    setBusy("cancel");
    const response = await fetch(`${apiUrl}/scheduled-messages/${schedule.id}`, { method: "DELETE" });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setError(payload.message || "Cancellation failed");
    router.refresh();
  }

  return (
    <div className="schedule-actions">
      <input className="field" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      <button className="button icon" title="Reschedule" disabled={Boolean(busy)} onClick={reschedule}><RotateCcw size={14} /></button>
      <button className="button icon danger" title="Cancel schedule" disabled={Boolean(busy)} onClick={cancel}><X size={14} /></button>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

export function InboundReviewActions({ review, leads }: { review: any; leads: any[] }) {
  const router = useRouter();
  const candidates = Array.isArray(review.possibleMatches) ? review.possibleMatches : [];
  const [companyId, setCompanyId] = useState(candidates[0]?.companyId || "");
  const [newLeadName, setNewLeadName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function resolve(action: "ATTACH" | "CREATE_CONTACT" | "CREATE_LEAD" | "IGNORE" | "SPAM") {
    setBusy(action);
    setError("");
    const response = await fetch(`${apiUrl}/inbound-reviews/${review.id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, companyId: companyId || undefined, companyName: newLeadName || undefined })
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setError(payload.message || "Review action failed");
    router.refresh();
  }

  return (
    <div className="review-actions">
      <div className="review-match-row">
        <select className="select" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">Choose a lead</option>
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
        </select>
        <button className="button primary" disabled={!companyId || Boolean(busy)} onClick={() => resolve("CREATE_CONTACT")}><Link2 size={14} /> Attach + contact</button>
      </div>
      <div className="review-match-row">
        <input className="field" value={newLeadName} onChange={(event) => setNewLeadName(event.target.value)} placeholder="New lead company name" />
        <button className="button" disabled={!newLeadName || Boolean(busy)} onClick={() => resolve("CREATE_LEAD")}><Plus size={14} /> Create lead</button>
      </div>
      <div className="actions">
        <button className="text-button" disabled={Boolean(busy)} onClick={() => resolve("IGNORE")}>Ignore</button>
        <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => resolve("SPAM")}>Mark spam</button>
      </div>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

export function SequenceActions({ sequence, leads }: { sequence: any; leads: any[] }) {
  const router = useRouter();
  const eligibleContacts = leads.flatMap((lead) => (lead.contacts || [])
    .filter((contact: any) =>
      contact.type === "EMAIL" &&
      ["VERIFIED", "PROBABLE"].includes(contact.trustStatus) &&
      !contact.doNotContact &&
      !["BOUNCED", "INVALID", "UNSUBSCRIBED", "DO_NOT_CONTACT"].includes(contact.contactabilityState)
    )
    .map((contact: any) => ({ companyId: lead.id, contactId: contact.id, label: `${lead.name} · ${contact.value}` })));
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function post(path: string, body: object = {}) {
    setBusy(path);
    setError("");
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setError(payload.message || "Sequence action failed");
    router.refresh();
  }

  async function enroll() {
    const target = eligibleContacts.find((item) => item.contactId === selection);
    if (target) await post(`/sequences/${sequence.id}/enroll`, target);
  }

  return (
    <div className="sequence-operations">
      {sequence.status !== "ACTIVE"
        ? <button className="button primary" disabled={Boolean(busy)} onClick={() => post(`/sequences/${sequence.id}/activate`)}><Play size={14} /> Activate sequence</button>
        : (
          <div className="review-match-row">
            <select className="select" value={selection} onChange={(event) => setSelection(event.target.value)}>
              <option value="">Enroll a verified email contact</option>
              {eligibleContacts.map((item) => <option key={item.contactId} value={item.contactId}>{item.label}</option>)}
            </select>
            <button className="button" disabled={!selection || Boolean(busy)} onClick={enroll}><Plus size={14} /> Enroll</button>
          </div>
        )}
      {sequence.enrollments?.map((enrollment: any) => (
        <div className="enrollment-row" key={enrollment.id}>
          <div><strong>{enrollment.company.name}</strong><span>{enrollment.contact?.value} · step {enrollment.currentStep} · {displayTerm(enrollment.status)}</span></div>
          <div className="actions">
            {enrollment.status === "PENDING_APPROVAL" ? <button className="button icon" title="Approve enrollment" onClick={() => post(`/sequence-enrollments/${enrollment.id}/approve`)}><Check size={14} /></button> : null}
            {["ACTIVE", "AWAITING_MESSAGE_APPROVAL"].includes(enrollment.status) ? <button className="button icon" title="Pause enrollment" onClick={() => post(`/sequence-enrollments/${enrollment.id}/pause`)}><Pause size={14} /></button> : null}
            {enrollment.status === "PAUSED" ? <button className="button icon" title="Resume enrollment" onClick={() => post(`/sequence-enrollments/${enrollment.id}/resume`)}><Play size={14} /></button> : null}
            {["PENDING_APPROVAL", "ACTIVE", "AWAITING_MESSAGE_APPROVAL", "PAUSED"].includes(enrollment.status) ? <button className="button icon danger" title="Stop enrollment" onClick={() => post(`/sequence-enrollments/${enrollment.id}/stop`)}><Square size={13} /></button> : null}
          </div>
        </div>
      ))}
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

export function DeliveryEventActions({ messageId, status }: { messageId: string; status?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  async function record(type: "SENT" | "BOUNCED") {
    setBusy(type);
    await fetch(`${apiUrl}/messages/${messageId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(type === "BOUNCED" ? { type, bounceCategory: "HARD", reason: "Operator-confirmed hard bounce" } : { type })
    });
    setBusy("");
    router.refresh();
  }
  return (
    <div className="actions">
      {status !== "BOUNCED" ? <button className="button" disabled={Boolean(busy)} onClick={() => record("SENT")}><Check size={14} /> Mark sent</button> : null}
      <button className="button danger" disabled={Boolean(busy)} onClick={() => record("BOUNCED")}><ShieldOff size={14} /> Hard bounce</button>
    </div>
  );
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
