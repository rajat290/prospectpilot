"use client";

import { FileBarChart, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";

export function AutomationActions({ mode, jobId }: { mode: "report" | "retry"; jobId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const path = mode === "report" ? "/reports/daily/generate" : `/jobs/${jobId}/retry`;
      await fetch(`${apiUrl}${path}`, { method: "POST" });
      router.refresh();
    } finally { setBusy(false); }
  }
  return <button className={mode === "report" ? "button primary" : "button"} disabled={busy} onClick={run}>{mode === "report" ? <FileBarChart size={14} /> : <RotateCcw size={13} />}{busy ? "Working..." : mode === "report" ? "Refresh daily report" : "Retry"}</button>;
}
