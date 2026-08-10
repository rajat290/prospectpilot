"use client";

import { Globe2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "../lib/api";

export function WebsiteDiscoveryActions({
  configured,
  provider,
  missingWebsites,
  sourceId
}: {
  configured: boolean;
  provider: string;
  missingWebsites: number;
  sourceId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function discover() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/companies/discover-websites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: sourceId || undefined, limit: 25 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Discovery could not be queued");
      setMessage(`${data.queued} missing-website leads queued for discovery.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discovery could not be queued");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-body" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="icon-box"><Globe2 size={16} /></span>
        <div style={{ flex: "1 1 260px" }}>
          <strong style={{ fontSize: 13 }}>Official website discovery</strong>
          <p className="subtle">
            {configured
              ? `${provider} connected · ${missingWebsites} leads still need an official website`
              : "Website discovery is not connected yet. Ask the workspace admin to enable the search provider."}
          </p>
          {message ? <p className="subtle" style={{ color: message.includes("queued") ? "#16815f" : "#b7443f" }}>{message}</p> : null}
        </div>
        <span className={`pill ${configured ? "complete" : "review"}`}>{configured ? "Connected" : "Setup needed"}</span>
        <button className="button primary" disabled={!configured || busy || missingWebsites === 0} onClick={discover}>
          <Search size={14} /> {busy ? "Queueing..." : "Discover 25 websites"}
        </button>
      </div>
    </div>
  );
}
