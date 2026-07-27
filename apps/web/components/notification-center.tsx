"use client";

import { AlertTriangle, Bell, CheckCircle2, Clock3, Database, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";

export function NotificationCenter() {
  const [alerts, setAlerts] = useState<any>({ criticalIssues: [], degradedSources: [], failedJobs: [], reminders: [] });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/alerts`)
      .then((response) => response.json())
      .then((payload) => setAlerts(payload))
      .catch(() => setAlerts({ criticalIssues: [], degradedSources: [], failedJobs: [], reminders: [] }))
      .finally(() => setLoaded(true));
  }, []);

  const count = useMemo(
    () => alerts.criticalIssues.length + alerts.degradedSources.length + alerts.failedJobs.length + alerts.reminders.length,
    [alerts]
  );

  return (
    <>
      <button className="notification-trigger" onClick={() => setOpen(true)} aria-label={`Open notifications, ${count} alerts`}>
        <Bell size={17} />
        <span>Alerts</span>
        {count ? <strong>{count > 99 ? "99+" : count}</strong> : loaded ? <CheckCircle2 size={14} /> : null}
      </button>
      {open ? (
        <div className="notification-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <aside className="notification-drawer" aria-label="Notification center">
            <header><div><p className="eyebrow">Live operations</p><h2>Attention center</h2></div><button className="button icon" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={15} /></button></header>
            <div className="notification-summary">
              <strong>{count}</strong><span>items need attention across lead quality and operations</span>
            </div>
            <AlertGroup icon={<AlertTriangle size={15} />} title="Critical lead quality" count={alerts.criticalIssues.length}>
              {alerts.criticalIssues.map((item: any) => <a href={`/leads/${item.company.id}`} key={item.id}><strong>{item.company.name}</strong><span>{item.title}</span></a>)}
            </AlertGroup>
            <AlertGroup icon={<Database size={15} />} title="Connector health" count={alerts.degradedSources.length}>
              {alerts.degradedSources.map((item: any) => <a href="/sources" key={item.id}><strong>{item.name || new URL(item.url).hostname}</strong><span>{item.errorMessage || `${item.connectorHealthScore}% health score`}</span></a>)}
            </AlertGroup>
            <AlertGroup icon={<Clock3 size={15} />} title="Follow-ups due" count={alerts.reminders.length}>
              {alerts.reminders.map((item: any) => <a href={`/leads/${item.company.id}`} key={item.id}><strong>{item.company.name}</strong><span>{formatDate(item.nextReminderAt)}</span></a>)}
            </AlertGroup>
            {!count && loaded ? <div className="notification-clear"><CheckCircle2 size={24} /><strong>Everything is clear</strong><span>No critical lead or operations alerts.</span></div> : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function AlertGroup({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <section className="alert-group"><div><span>{icon}</span><strong>{title}</strong><small>{count}</small></div><div className="alert-items">{children}</div></section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}
