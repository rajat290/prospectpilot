"use client";

import { CheckCircle2, Clock3, FileText, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";

export function MessageComposer({
  company,
  conversation,
  recipient,
  templates,
  accounts
}: {
  company: any;
  conversation?: any;
  recipient: { id?: string; value: string };
  templates: any[];
  accounts: any[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(conversation?.subject ? normalizeReplySubject(conversation.subject) : "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const gmailAccounts = useMemo(() => accounts.filter((account) => account.provider === "GMAIL" && account.status === "CONNECTED"), [accounts]);
  const defaultAccount = gmailAccounts[0];

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSubject(fill(template.subject || subject, company));
    setBody(fill(template.body, company));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const response = await fetch(`${apiUrl}/messages/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companyId: company.id,
        contactId: recipient.id,
        connectionId: defaultAccount?.id,
        conversationId: conversation?.id,
        to: recipient.value,
        subject,
        bodyText: body,
        templateId: templateId || undefined
      })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(payload.message || "Could not save draft");
    setBody("");
    setNotice("Draft saved and sent to the approval queue.");
    router.refresh();
  }

  return (
    <form className="composer" onSubmit={save}>
      <div className="composer-head">
        <div><strong>{conversation ? "Reply with approval" : "New email draft"}</strong><span>To {recipient.value}</span></div>
        <span className={`mailbox-chip ${defaultAccount ? "live" : ""}`}>{defaultAccount ? defaultAccount.emailAddress : "No Gmail connected"}</span>
      </div>
      <div className="composer-tools">
        <FileText size={14} />
        <select className="select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
          <option value="">Start without a template</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </div>
      <input className="composer-subject" aria-label="Email subject" required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
      <textarea className="composer-body" aria-label="Email body" required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear, evidence-based message..." />
      <div className="composer-footer">
        <span><Clock3 size={13} /> Every draft requires human approval before queueing.</span>
        <button className="button primary" disabled={busy || !recipient.value} type="submit"><Send size={14} /> Save for approval</button>
      </div>
      {notice ? <div className="composer-notice">{notice.includes("saved") ? <CheckCircle2 size={14} /> : <X size={14} />}{notice}</div> : null}
    </form>
  );
}

function normalizeReplySubject(subject: string) {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function fill(value: string, company: any) {
  const opportunity = company.opportunities?.[0];
  return value
    .replaceAll("{{companyName}}", company.name || "your team")
    .replaceAll("{{firstName}}", "there")
    .replaceAll("{{observedProblem}}", opportunity?.reasoning || "an opportunity in your current workflow")
    .replaceAll("{{recommendedOffer}}", opportunity?.recommendedService || "a focused workflow improvement")
    .replaceAll("{{businessImpact}}", "faster response and clearer tracking")
    .replaceAll("{{senderName}}", "Vikas");
}
