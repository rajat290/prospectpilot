"use client";

import { Check, CheckCircle2, FileCheck2, RefreshCw, Sparkles, ThumbsDown, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";

const modes = [
  ["ANSWER_QUESTIONS", "Answer questions"],
  ["CONVERSATIONAL", "More conversational"],
  ["SHORTEN", "Shorten"],
  ["HANDLE_OBJECTION", "Handle objection"],
  ["SUGGEST_MEETING", "Suggest meeting"],
  ["ADD_PRICING", "Add approved pricing"],
  ["CREATE_FOLLOW_UP", "Create follow-up"]
] as const;

export function SalesCopilotActions({
  conversationId,
  inboundMessageId,
  recommendation,
  suggestion,
  tasks = [],
  intelligence
}: {
  conversationId: string;
  inboundMessageId?: string;
  recommendation?: any;
  suggestion?: any;
  tasks?: any[];
  intelligence?: any;
}) {
  const router = useRouter();
  const [mode, setMode] = useState("ANSWER_QUESTIONS");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function act(key: string, path: string, method = "POST", body?: object) {
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : "{}"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Action failed");
      setNotice(key === "generate" ? "Suggested reply generated for review." : "Sales Copilot updated.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="copilot-controls">
      {!intelligence && inboundMessageId ? (
        <button className="button" disabled={Boolean(busy)} onClick={() => act("analyze", `/messages/${inboundMessageId}/analyze`)}>
          <RefreshCw size={14} className={busy === "analyze" ? "spin" : ""} /> Analyze reply
        </button>
      ) : null}

      {recommendation?.status === "PENDING" ? (
        <div className="copilot-approval-row">
          <button className="button primary" disabled={Boolean(busy)} onClick={() => act("approve", `/recommended-actions/${recommendation.id}/approve`)}>
            <Check size={14} /> Approve action{recommendation.recommendedCrmStage ? ` + ${recommendation.recommendedCrmStage.replaceAll("_", " ")}` : ""}
          </button>
          <button className="button" disabled={Boolean(busy)} onClick={() => act("dismiss", `/recommended-actions/${recommendation.id}/dismiss`)}>
            <ThumbsDown size={14} /> Dismiss
          </button>
        </div>
      ) : null}

      <div className="copilot-generate-row">
        <select className="select" aria-label="Suggested reply mode" value={mode} onChange={(event) => setMode(event.target.value)}>
          {modes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button className="button primary" disabled={Boolean(busy) || !inboundMessageId} onClick={() => act("generate", `/conversations/${conversationId}/suggested-replies`, "POST", { mode })}>
          <WandSparkles size={14} /> Generate reply
        </button>
      </div>

      {suggestion?.status === "DRAFT" ? (
        <button className="button" disabled={Boolean(busy)} onClick={() => act("use", `/suggested-replies/${suggestion.id}/use`)}>
          <FileCheck2 size={14} /> Move draft to approval queue
        </button>
      ) : null}

      {tasks.map((task) => (
        <button className="copilot-task-button" disabled={Boolean(busy)} key={task.id} onClick={() => act(`task-${task.id}`, `/sales-tasks/${task.id}`, "PATCH", { status: "COMPLETED" })}>
          <CheckCircle2 size={14} /> <span><strong>{task.title}</strong><small>Mark complete</small></span>
        </button>
      ))}

      {notice ? <div className={`copilot-inline-notice ${/failed|error|could|unavailable/i.test(notice) ? "error" : ""}`}>{/failed|error|could|unavailable/i.test(notice) ? <X size={14} /> : <Sparkles size={14} />}{notice}</div> : null}
    </div>
  );
}
