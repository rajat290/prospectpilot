"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Database,
  ExternalLink,
  Filter,
  MessageSquareText,
  Radar,
  RefreshCw,
  Send,
  Sparkles
} from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  {
    title: "Understand the revenue flow",
    eyebrow: "The big picture",
    icon: Sparkles,
    body: "ProspectPilot finds public businesses, verifies what it can, recommends a useful service, sends only approved Gmail outreach, captures replies, and keeps the deal history together. You remain in control of claims, pricing, and send approval.",
    tasks: ["Find leads from public sources", "Verify evidence and choose the right opportunity", "Approve outreach and handle replies from one workspace"],
    action: { href: "/", label: "Open command center" }
  },
  {
    title: "Find a small lead sample",
    eyebrow: "Step 1",
    icon: Radar,
    body: "Open Sources, paste one public directory URL, set a small record cap, and start extraction. Begin with 25 records and review quality before increasing the limit or enabling automation.",
    tasks: ["Use a public business directory", "Start with a 25-record cap", "Keep automation off for the first sample"],
    action: { href: "/sources", label: "Open Find leads" }
  },
  {
    title: "Let the system research them",
    eyebrow: "Step 2",
    icon: RefreshCw,
    body: "The system extracts companies, discovers available websites, collects public contacts, checks digital gaps, scores opportunities, and keeps evidence. New records may need research before they are safe to contact.",
    tasks: ["Complete means research finished", "Needs research means important data is missing", "Verified and probable describe data confidence"],
    action: { href: "/quality", label: "Review data quality" }
  },
  {
    title: "Choose a focused shortlist",
    eyebrow: "Step 3",
    icon: Filter,
    body: "Use Lead Database filters instead of reading every row. Select the real source, choose Hot or Qualified, and prefer records with a public contact. Open a company to verify its evidence.",
    tasks: ["Filter by source", "Start with Hot leads", "Prefer leads with contact details"],
    action: { href: "/leads?scoreBand=HOT&hasContact=true", label: "View contactable leads" }
  },
  {
    title: "Verify the lead and offer",
    eyebrow: "Step 4",
    icon: Database,
    body: "On a lead page, confirm the website belongs to the company, check the contact, read the detected problem, and judge whether the recommended service is genuinely useful. A high score is a priority signal, not a promise.",
    tasks: ["Visit and verify the official website", "Confirm the email or phone", "Check that the pitch solves a visible problem"],
    action: { href: "/leads", label: "Choose a lead" }
  },
  {
    title: "Prepare and approve outreach",
    eyebrow: "Step 5",
    icon: MessageSquareText,
    body: "Create a controlled campaign or open a lead conversation. Review the recipient, evidence, message, offer, and sender name before approval. ProspectPilot then sends through the connected Gmail account and records the result.",
    tasks: ["Use one verified observation", "Approve each new campaign batch", "Never invent capability, pricing, or proof"],
    action: { href: "/campaigns", label: "Prepare a campaign" }
  },
  {
    title: "Handle replies from Inbox",
    eyebrow: "Step 6",
    icon: Send,
    body: "Gmail replies sync into Inbox and the correct lead timeline. A real reply stops its active follow-up sequence. Review AI analysis, answer the prospect, and resolve any unmatched reply instead of guessing its company.",
    tasks: ["Needs reply means your response is pending", "Unmatched replies require manual linking", "Delivery failed means research a replacement address"],
    action: { href: "/inbox", label: "Open Inbox" }
  },
  {
    title: "Move the deal forward",
    eyebrow: "Step 7",
    icon: Send,
    body: "Keep the CRM stage honest as the conversation moves through qualified, meeting, proposal, negotiation, won, or lost. Add the next action so no opportunity depends on memory.",
    tasks: ["Use stages to describe reality", "Record a follow-up date", "Keep pricing and delivery promises approved"],
    action: { href: "/pipeline", label: "Open Deals" }
  },
  {
    title: "Learn any unfamiliar word",
    eyebrow: "Step 8",
    icon: Database,
    body: "Status badges explain themselves when you hover or focus them. The glossary below gives the plain meaning and tells you what to do next for every important operational term.",
    tasks: ["Hover a status for instant help", "Search the glossary by technical word", "Use Email settings or Automation only when operating or diagnosing the system"],
    action: { href: "/guide#glossary", label: "Open glossary" }
  }
];

const storageKey = "prospectpilot-guide-progress";

export function InteractiveTutorial() {
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);

  useEffect(() => {
    try {
      setCompleted(JSON.parse(localStorage.getItem(storageKey) || "[]"));
    } catch {
      setCompleted([]);
    }
  }, []);

  const step = steps[current]!;
  const Icon = step.icon;
  const progress = Math.round((completed.length / steps.length) * 100);

  function markComplete(index: number) {
    const next = Array.from(new Set([...completed, index])).sort((a, b) => a - b);
    setCompleted(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function advance() {
    markComplete(current);
    if (current < steps.length - 1) setCurrent(current + 1);
  }

  function reset() {
    setCurrent(0);
    setCompleted([]);
    localStorage.removeItem(storageKey);
  }

  return (
    <div className="guide-layout">
      <aside className="guide-index">
        <div className="guide-progress-head">
          <div><strong>{progress}% complete</strong><span>{completed.length} of {steps.length} lessons</span></div>
          <button className="text-button" onClick={reset}>Reset</button>
        </div>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="guide-step-list">
          {steps.map((item, index) => {
            const done = completed.includes(index);
            return (
              <button
                key={item.title}
                className={`guide-step${current === index ? " active" : ""}${done ? " done" : ""}`}
                onClick={() => setCurrent(index)}
              >
                {done ? <CheckCircle2 size={17} /> : <CircleDot size={17} />}
                <span><small>{item.eyebrow}</small><strong>{item.title}</strong></span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="guide-content">
        <div className="guide-content-icon"><Icon size={24} /></div>
        <p className="eyebrow">{step.eyebrow}</p>
        <h2>{step.title}</h2>
        <p className="guide-copy">{step.body}</p>

        {current === 0 ? (
          <div className="flow-strip" aria-label="ProspectPilot workflow">
            {["Find", "Research", "Verify", "Contact", "Reply", "Close"].map((item, index) => (
              <div key={item}><span>{index + 1}</span><strong>{item}</strong>{index < 5 ? <ArrowRight size={14} /> : null}</div>
            ))}
          </div>
        ) : null}

        <div className="lesson-checklist">
          {step.tasks.map((task) => <div key={task}><Check size={15} /><span>{task}</span></div>)}
        </div>

        <div className="tutorial-actions">
          <button className="button" disabled={current === 0} onClick={() => setCurrent(current - 1)}><ArrowLeft size={14} /> Previous</button>
          <a className="button" href={step.action.href}>{step.action.label} <ExternalLink size={13} /></a>
          <button className="button primary" onClick={advance}>
            {current === steps.length - 1 ? "Finish tutorial" : "Mark done and continue"}
            {current === steps.length - 1 ? <Check size={14} /> : <ArrowRight size={14} />}
          </button>
        </div>
      </section>
    </div>
  );
}
