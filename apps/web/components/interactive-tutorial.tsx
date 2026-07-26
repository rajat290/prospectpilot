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
    title: "Understand the money flow",
    eyebrow: "The big picture",
    icon: Sparkles,
    body: "ProspectPilot turns a public directory into a ranked sales list. It researches the business, suggests what to sell, and prepares a draft. You still verify the lead and send outreach manually.",
    tasks: ["Source supplies company records", "Enrichment finds public evidence", "Scoring tells you where to focus"],
    action: { href: "/", label: "Open command center" }
  },
  {
    title: "Add a controlled source",
    eyebrow: "Step 1",
    icon: Radar,
    body: "Open Sources, paste one public directory URL, set a small record cap, and start extraction. Begin with 25 records and review quality before increasing the limit or enabling automation.",
    tasks: ["Use a public business directory", "Start with a 25-record cap", "Keep automation off for the first sample"],
    action: { href: "/sources", label: "Configure a source" }
  },
  {
    title: "Let the pipeline prepare leads",
    eyebrow: "Step 2",
    icon: RefreshCw,
    body: "The worker extracts companies, visits available websites, collects public contacts, audits digital gaps, scores the lead, and creates outreach drafts. Automation shows whether each job completed or failed.",
    tasks: ["COMPLETE means the job finished", "FAILED jobs can be retried", "Missing websites can use provider search"],
    action: { href: "/automation", label: "Check worker health" }
  },
  {
    title: "Build a focused shortlist",
    eyebrow: "Step 3",
    icon: Filter,
    body: "Use Lead Database filters instead of reading every row. Select the real source, choose Hot or Qualified, and prefer records with a public contact. Open a company to verify its evidence.",
    tasks: ["Filter by source", "Start with Hot leads", "Prefer leads with contact details"],
    action: { href: "/leads?scoreBand=HOT&hasContact=true", label: "View Hot leads" }
  },
  {
    title: "Verify the sales angle",
    eyebrow: "Step 4",
    icon: Database,
    body: "On a lead page, confirm the website belongs to the company, check the contact, read the detected problem, and judge whether the recommended service is genuinely useful. A high score is a priority signal, not a promise.",
    tasks: ["Visit and verify the official website", "Confirm the email or phone", "Check that the pitch solves a visible problem"],
    action: { href: "/leads", label: "Choose a lead" }
  },
  {
    title: "Personalize before sending",
    eyebrow: "Step 5",
    icon: MessageSquareText,
    body: "Copy the channel-specific draft and rewrite the opening in your own voice. Mention one real observation. Never send claims that you did not verify on the business website.",
    tasks: ["Use one specific observation", "Keep the first message short", "Offer a small next step, not a hard sale"],
    action: { href: "/leads", label: "Open outreach kits" }
  },
  {
    title: "Track every conversation",
    eyebrow: "Step 6",
    icon: Send,
    body: "After manual outreach, immediately move the lead to Contacted and add a reminder. Move replies, meetings, proposals, wins, and losses through the pipeline so follow-ups never depend on memory.",
    tasks: ["Set Contacted after sending", "Add the next reminder", "Write a note with context and next action"],
    action: { href: "/pipeline", label: "Open deal pipeline" }
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
            {["Source", "Companies", "Enrichment", "Scoring", "Outreach", "CRM"].map((item, index) => (
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
