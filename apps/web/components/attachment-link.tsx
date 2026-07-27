"use client";

import { Download, FileWarning, Loader2 } from "lucide-react";
import { useState } from "react";
import { apiUrl } from "../lib/api";

export function AttachmentLink({ attachment }: { attachment: any }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clean = attachment.scanStatus === "CLEAN";
  async function download() {
    setBusy(true);
    setError("");
    const response = await fetch(`${apiUrl}/attachments/${attachment.id}/url`);
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setError(payload.message || "Attachment unavailable");
    window.location.assign(`${apiUrl}${payload.url}`);
  }
  return (
    <div className={`attachment-chip ${clean ? "" : "blocked"}`}>
      {clean ? <Download size={13} /> : <FileWarning size={13} />}
      <button disabled={!clean || busy} onClick={download}>{busy ? <Loader2 className="spin" size={12} /> : attachment.fileName}</button>
      <span>{formatBytes(attachment.sizeBytes)} · {attachment.scanStatus.toLowerCase()}</span>
      {error ? <small>{error}</small> : null}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 1024 * 100 ? 1 : 0)} KB`;
}
