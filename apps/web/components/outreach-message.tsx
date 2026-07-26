"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function OutreachMessage({ draft }: { draft: any }) {
  const [copied, setCopied] = useState(false);
  const content = `${draft.subject ? `${draft.subject}\n\n` : ""}${draft.body}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return <div className="message"><div className="message-head"><strong>{draft.channel.replaceAll("_", " ")}</strong><button className="button" onClick={copy} type="button">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button></div>{draft.subject ? <strong style={{ display: "block", marginBottom: 8 }}>{draft.subject}</strong> : null}{draft.body}</div>;
}
