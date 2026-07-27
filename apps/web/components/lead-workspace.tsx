"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Globe2,
  History,
  Linkedin,
  Mail,
  MapPin,
  MessageSquareText,
  MessagesSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { LeadActions } from "./lead-actions";
import { AttachmentLink } from "./attachment-link";
import { MessageComposer } from "./message-composer";
import { OutreachMessage } from "./outreach-message";
import { Pill } from "./pill";

const tabs = [
  { id: "overview", label: "Overview", icon: Target },
  { id: "contacts", label: "Contacts & social", icon: Mail },
  { id: "evidence", label: "Evidence ledger", icon: FileSearch },
  { id: "intelligence", label: "Intelligence", icon: Sparkles },
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "history", label: "History", icon: History }
] as const;

type TabId = (typeof tabs)[number]["id"];

export function LeadWorkspace({ lead, templates = [], accounts = [] }: { lead: any; templates?: any[]; accounts?: any[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [evidenceFilter, setEvidenceFilter] = useState("ALL");
  const [busyKey, setBusyKey] = useState("");
  const [toast, setToast] = useState("");
  const audit = lead.audits?.[0];
  const opportunity = lead.opportunities?.[0];
  const openIssues = lead.qualityIssues?.filter((issue: any) => issue.status === "OPEN") ?? [];
  const evidence = useMemo(
    () => lead.evidence?.filter((item: any) => evidenceFilter === "ALL" || item.trustStatus === evidenceFilter) ?? [],
    [evidenceFilter, lead.evidence]
  );

  async function mutate(key: string, path: string, body?: object) {
    setBusyKey(key);
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Action failed");
      setToast("Lead intelligence updated");
      router.refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyKey("");
    }
  }

  async function enrich() {
    setBusyKey("enrich");
    try {
      const response = await fetch(`${apiUrl}/companies/${lead.id}/enrich`, { method: "POST" });
      if (!response.ok) throw new Error("Could not queue enrichment");
      setToast("Fresh enrichment queued. The timeline will update when it completes.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <>
      {openIssues.length || lead.quarantinedAt ? (
        <div className={`quality-alert ${lead.quarantinedAt ? "critical" : ""}`}>
          <ShieldAlert size={19} />
          <div>
            <strong>{lead.quarantinedAt ? "Lead is in quality quarantine" : `${openIssues.length} quality checks need attention`}</strong>
            <span>{lead.quarantineReason || "Review the flagged evidence before using this lead for outreach."}</span>
          </div>
          <button className="button" onClick={() => setActiveTab("overview")}>Review issues</button>
        </div>
      ) : (
        <div className="quality-alert verified">
          <ShieldCheck size={19} />
          <div><strong>No blocking quality issues</strong><span>This lead is ready for final human verification.</span></div>
        </div>
      )}

      <section className="lead-command-strip">
        <div className="lead-score-cluster">
          <QualityMetric label="Trust" value={lead.overallConfidence || 0} tone="green" />
          <QualityMetric label="Complete" value={lead.dataCompleteness || 0} tone="blue" />
          <QualityMetric label="Sales score" value={lead.leadScore?.score || 0} tone="yellow" />
        </div>
        <div className="lead-command-actions">
          <button className="button" disabled={busyKey === "enrich"} onClick={enrich}>
            <RefreshCw size={14} className={busyKey === "enrich" ? "spin" : ""} /> Refresh intelligence
          </button>
          {lead.websiteUrl ? <a className="button" href={lead.websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={14} /> Website</a> : null}
          <button
            className="button primary"
            disabled={busyKey === "verify"}
            onClick={() => mutate("verify", `/companies/${lead.id}/verification`, { trustStatus: "VERIFIED" })}
          >
            <ShieldCheck size={14} /> Verify lead
          </button>
        </div>
      </section>

      <nav className="workspace-tabs" aria-label="Lead workspace sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              <Icon size={15} /> {tab.label}
              {tab.id === "evidence" ? <span>{lead.evidence?.length || 0}</span> : null}
              {tab.id === "conversations" ? <span>{lead.conversations?.length || 0}</span> : null}
              {tab.id === "overview" && openIssues.length ? <span className="warning-count">{openIssues.length}</span> : null}
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <div className="workspace-grid">
          <div className="stack">
            <Section title="Business identity" meta={<TrustBadge status={lead.trustStatus} />}>
              <div className="identity-grid">
                <IdentityFact icon={<Globe2 size={15} />} label="Official website" value={lead.websiteUrl || lead.website?.url || "Not confirmed"} />
                <IdentityFact icon={<MapPin size={15} />} label="Location" value={[lead.address, lead.city, lead.region, lead.country].filter(Boolean).join(", ") || "Not found"} />
                <IdentityFact icon={<Target size={15} />} label="Industry" value={lead.industry || lead.category || "Not classified"} />
                <IdentityFact icon={<ShieldCheck size={15} />} label="Identity fingerprint" value={lead.identityKey || "Pending"} mono />
              </div>
            </Section>

            <Section title="Quality control" meta={<span className="section-meta">{openIssues.length} open</span>}>
              <div className="issue-list">
                {openIssues.map((issue: any) => (
                  <div className={`quality-issue ${issue.severity.toLowerCase()}`} key={issue.id}>
                    {issue.severity === "CRITICAL" ? <AlertTriangle size={16} /> : <ShieldAlert size={16} />}
                    <div><strong>{issue.title}</strong><p>{issue.description}</p></div>
                    <div className="actions">
                      <button
                        className="button icon"
                        title="Mark resolved"
                        aria-label={`Resolve ${issue.title}`}
                        disabled={busyKey === issue.id}
                        onClick={() => mutate(issue.id, `/quality-issues/${issue.id}`, { status: "RESOLVED" })}
                      ><Check size={14} /></button>
                      <button
                        className="button icon"
                        title="Ignore this check"
                        aria-label={`Ignore ${issue.title}`}
                        disabled={busyKey === issue.id}
                        onClick={() => mutate(issue.id, `/quality-issues/${issue.id}`, { status: "IGNORED" })}
                      ><X size={14} /></button>
                    </div>
                  </div>
                ))}
                {!openIssues.length ? <div className="empty-state-compact"><CheckCircle2 size={18} /> All automated quality checks passed.</div> : null}
              </div>
            </Section>
          </div>

          <div className="stack">
            <Section title="Source cross-check" meta={<span className="section-meta">{lead.sourceObservations?.length || 0} sources</span>}>
              <div className="source-evidence-list">
                {lead.sourceObservations?.map((observation: any) => (
                  <div key={observation.id}>
                    <span className="source-health" style={{ "--health": `${observation.leadSource.connectorHealthScore}%` } as React.CSSProperties} />
                    <div><strong>{observation.leadSource.name || new URL(observation.leadSource.url).hostname}</strong><p>{observation.confidence}% extraction confidence</p></div>
                    <a href={observation.sourceUrl || observation.leadSource.url} target="_blank" rel="noreferrer" title="Open source"><ExternalLink size={14} /></a>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Next best action" meta={<Sparkles size={16} />}>
              <NextBestAction lead={lead} opportunity={opportunity} openIssues={openIssues} onTab={setActiveTab} />
            </Section>
            <LeadActions companyId={lead.id} crmItem={lead.crmItem} mode="panel" />
          </div>
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <div className="workspace-grid">
          <Section title="Public contact channels" meta={<span className="section-meta">{lead.contacts?.length || 0} found</span>}>
            <div className="contact-grid">
              {lead.contacts?.map((contact: any) => {
                const contactEvidence = lead.evidence?.find((item: any) => item.value === contact.value);
                return (
                  <div className="contact-card" key={contact.id}>
                    <div className="contact-icon">{contact.type === "EMAIL" ? <Mail size={18} /> : contact.type === "PHONE" ? <Phone size={18} /> : <MessageSquareText size={18} />}</div>
                    <div className="contact-main">
                      <span>{contact.type}{contact.isPrimary ? " · Primary" : ""}</span>
                      <strong>{contact.value}</strong>
                      <p>{contact.confidence}% confidence · {contact.trustStatus.toLowerCase()}</p>
                    </div>
                    <div className="actions">
                      {contact.type === "EMAIL" ? <a className="button icon" href={`mailto:${contact.value}`} title="Compose email"><Mail size={14} /></a> : null}
                      {contact.type === "PHONE" ? <a className="button icon" href={`tel:${contact.value}`} title="Call number"><Phone size={14} /></a> : null}
                      {contactEvidence ? <button className="button icon" title="Verify evidence" onClick={() => mutate(contactEvidence.id, `/evidence/${contactEvidence.id}`, { trustStatus: "VERIFIED" })}><ShieldCheck size={14} /></button> : null}
                    </div>
                  </div>
                );
              })}
              {!lead.contacts?.length ? <div className="empty">No public contact details have passed extraction yet.</div> : null}
            </div>
          </Section>
          <Section title="Social presence" meta={<span className="section-meta">{lead.socials?.length || 0} profiles</span>}>
            <div className="social-list">
              {lead.socials?.map((social: any) => (
                <a href={social.url} target="_blank" rel="noreferrer" key={social.id}>
                  {social.platform === "LINKEDIN" ? <Linkedin size={17} /> : <Globe2 size={17} />}
                  <div><strong>{social.platform.replaceAll("_", " ")}</strong><p>{social.confidence}% confidence</p></div>
                  <ArrowUpRight size={14} />
                </a>
              ))}
              {!lead.socials?.length ? <div className="empty">No social profiles detected on the official website.</div> : null}
            </div>
          </Section>
        </div>
      ) : null}

      {activeTab === "evidence" ? (
        <Section
          title="Evidence ledger"
          meta={
            <select className="select compact-select" value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value)}>
              <option value="ALL">All evidence</option>
              <option value="VERIFIED">Verified</option>
              <option value="PROBABLE">Probable</option>
              <option value="UNVERIFIED">Unverified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          }
        >
          <div className="evidence-table-wrap">
            <table className="evidence-table">
              <thead><tr><th>Field and value</th><th>Origin</th><th>Confidence</th><th>Status</th><th>Observed</th><th>Review</th></tr></thead>
              <tbody>
                {evidence.map((item: any) => (
                  <tr key={item.id}>
                    <td><strong>{item.field.replaceAll(".", " / ")}</strong><span>{item.value}</span></td>
                    <td><span className="pill">{item.sourceType.replaceAll("_", " ")}</span>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="Open evidence source"><ExternalLink size={13} /></a> : null}</td>
                    <td><ConfidenceBar value={item.confidence} /></td>
                    <td><TrustBadge status={item.trustStatus} /></td>
                    <td>{formatDate(item.observedAt)}</td>
                    <td><div className="actions">
                      <button className="button icon" title="Verify" disabled={busyKey === item.id} onClick={() => mutate(item.id, `/evidence/${item.id}`, { trustStatus: "VERIFIED" })}><Check size={14} /></button>
                      <button className="button icon danger" title="Reject" disabled={busyKey === item.id} onClick={() => mutate(item.id, `/evidence/${item.id}`, { trustStatus: "REJECTED" })}><X size={14} /></button>
                    </div></td>
                  </tr>
                ))}
                {!evidence.length ? <tr><td colSpan={6}><div className="empty">No evidence matches this filter.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {activeTab === "intelligence" ? (
        <div className="workspace-grid">
          <div className="stack">
            <Section title="Recommended opportunity" meta={opportunity ? <TrustBadge status={opportunity.confidence >= 75 ? "PROBABLE" : "UNVERIFIED"} /> : null}>
              {opportunity ? (
                <div className="opportunity-focus">
                  <Pill value={opportunity.category} />
                  <h2>{opportunity.title}</h2>
                  <p>{opportunity.reasoning}</p>
                  <div><strong>Propose</strong><span>{opportunity.recommendedService}</span></div>
                </div>
              ) : <div className="empty">Run enrichment to generate an evidence-based opportunity.</div>}
            </Section>
            <Section title="Outreach preparation" meta={<span className="section-meta">{lead.outreachDrafts?.length || 0} drafts</span>}>
              <div className="stack">
                {lead.outreachDrafts?.map((draft: any) => <OutreachMessage key={draft.id} draft={draft} />)}
                {!lead.outreachDrafts?.length ? <div className="empty">Drafts appear after opportunity analysis.</div> : null}
              </div>
            </Section>
          </div>
          <div className="stack">
            <Section title="Intelligence pulse" meta={<Activity size={16} />}>
              <div className="pulse-chart">
                <PulseBar label="Trust confidence" value={lead.overallConfidence || 0} />
                <PulseBar label="Data completeness" value={lead.dataCompleteness || 0} />
                <PulseBar label="Commercial score" value={lead.leadScore?.score || 0} />
                <PulseBar label="Website confidence" value={lead.website?.discoveryScore || 0} />
              </div>
            </Section>
            <Section title="Website signals" meta={audit ? <Pill value={audit.loadStatus} /> : null}>
              <div className="signal-grid">
                <Signal label="HTTPS" active={audit?.hasHttps} />
                <Signal label="Mobile viewport" active={audit?.hasMobileViewport} />
                <Signal label="Contact form" active={audit?.hasContactForm} />
                <Signal label="Live chat" active={audit?.hasLiveChat} />
                <Signal label="Analytics" active={audit?.hasAnalytics} />
                <Signal label="Cookie consent" active={audit?.hasCookieBanner} />
              </div>
            </Section>
            <Section title="Technology signals" meta={<span className="section-meta">{lead.technologies?.length || 0} detected</span>}>
              <div className="technology-list">
                {lead.technologies?.map((tech: any) => <div key={tech.id}><strong>{tech.name}</strong><span>{tech.category || "Technology"} · {tech.confidence}%</span><ConfidenceBar value={tech.confidence} /></div>)}
                {!lead.technologies?.length ? <div className="empty">No technology signatures detected.</div> : null}
              </div>
            </Section>
          </div>
        </div>
      ) : null}

      {activeTab === "conversations" ? (
        <div className="workspace-grid">
          <Section title="Communication timeline" meta={<a className="button" href={`/inbox${lead.conversations?.[0] ? `?conversation=${lead.conversations[0].id}` : ""}`}>Open inbox <ArrowUpRight size={14} /></a>}>
            <div className="lead-conversations">
              {lead.conversations?.map((conversation: any) => (
                <article key={conversation.id}>
                  <header><div><strong>{conversation.subject || "No subject"}</strong><span>{conversation.status.replaceAll("_", " ").toLowerCase()}</span></div><Pill value={conversation.status} /></header>
                  {conversation.messages?.map((message: any) => (
                    <div className={message.direction.toLowerCase()} key={message.id}>
                      <span>{message.direction === "INBOUND" ? "Prospect" : "You"} · {formatDate(message.receivedAt || message.sentAt || message.createdAt)}</span>
                      <p>{message.bodyText}</p>
                      {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((attachment: any) => <AttachmentLink attachment={attachment} key={attachment.id} />)}</div> : null}
                    </div>
                  ))}
                </article>
              ))}
              {!lead.conversations?.length ? <div className="empty">No conversation has been linked to this lead yet.</div> : null}
            </div>
          </Section>
          <div className="stack">
            {lead.contacts?.find((contact: any) => contact.type === "EMAIL") ? (
              <MessageComposer
                company={lead}
                conversation={lead.conversations?.[0]}
                recipient={{
                  id: lead.contacts.find((contact: any) => contact.type === "EMAIL").id,
                  value: lead.contacts.find((contact: any) => contact.type === "EMAIL").value
                }}
                templates={templates}
                accounts={accounts}
              />
            ) : (
              <Section title="Compose email"><div className="empty">A public email address is required before a safe draft can be created.</div></Section>
            )}
            <Section title="Channel policy" meta={<ShieldCheck size={15} />}>
              <div className="context-note"><ShieldCheck size={15} /><p>Email sends through connected Gmail. WhatsApp will use the official Cloud API, LinkedIn stays assisted, and calls begin with click-to-call.</p></div>
            </Section>
          </div>
        </div>
      ) : null}

      {activeTab === "history" ? (
        <div className="workspace-grid">
          <Section title="Activity timeline" meta={<span className="section-meta">{lead.activities?.length || 0} events</span>}>
            <div className="activity-timeline">
              {lead.activities?.map((event: any) => (
                <div key={event.id}>
                  <span><Clock3 size={13} /></span>
                  <div><strong>{event.summary}</strong><p>{event.type.replaceAll("_", " ")} · {formatDate(event.createdAt)}</p></div>
                </div>
              ))}
              {!lead.activities?.length ? <div className="empty">No activity recorded yet.</div> : null}
            </div>
          </Section>
          <div className="stack">
            <LeadActions companyId={lead.id} crmItem={lead.crmItem} mode="panel" />
            <Section title="Research notes" meta={<span className="section-meta">{lead.notes?.length || 0} notes</span>}>
              <div className="notes-list">
                {lead.notes?.map((note: any) => <div key={note.id}><p>{note.body}</p><span>{formatDate(note.createdAt)}</span></div>)}
                {!lead.notes?.length ? <div className="empty">Notes you add will appear here.</div> : null}
              </div>
            </Section>
          </div>
        </div>
      ) : null}

      {toast ? <div className="app-toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div> : null}
    </>
  );
}

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel workspace-section"><div className="panel-head"><h2>{title}</h2>{meta}</div><div className="panel-body">{children}</div></section>;
}

function QualityMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`quality-metric ${tone}`}><div><span>{label}</span><strong>{value}%</strong></div><div className="quality-track"><span style={{ width: `${value}%` }} /></div></div>;
}

function IdentityFact({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return <div className="identity-fact"><span>{icon}</span><div><small>{label}</small><strong className={mono ? "mono" : ""}>{value}</strong></div></div>;
}

function TrustBadge({ status }: { status: string }) {
  return <span className={`trust-badge ${status.toLowerCase()}`}><span />{status.replaceAll("_", " ")}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  return <div className="confidence-cell"><div><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>;
}

function PulseBar({ label, value }: { label: string; value: number }) {
  return <div><div><span>{label}</span><strong>{value}</strong></div><div className="pulse-track"><span style={{ width: `${value}%` }} /></div></div>;
}

function Signal({ label, active }: { label: string; active?: boolean }) {
  return <div className={active ? "active" : ""}>{active ? <Check size={14} /> : <X size={14} />}<span>{label}</span></div>;
}

function NextBestAction({ lead, opportunity, openIssues, onTab }: { lead: any; opportunity: any; openIssues: any[]; onTab: (tab: TabId) => void }) {
  if (openIssues.length) return <div className="next-action"><span>1</span><div><strong>Resolve quality blockers</strong><p>Review {openIssues.length} open checks before relying on this lead.</p><button className="text-button" onClick={() => onTab("evidence")}>Open evidence ledger</button></div></div>;
  if (!lead.contacts?.length) return <div className="next-action"><span>2</span><div><strong>Find a public contact</strong><p>The company identity is usable, but outreach has no verified destination.</p><button className="text-button" onClick={() => onTab("contacts")}>Review contacts</button></div></div>;
  if (!opportunity) return <div className="next-action"><span>3</span><div><strong>Generate opportunity intelligence</strong><p>Run enrichment to detect the strongest commercially relevant angle.</p></div></div>;
  return <div className="next-action"><span>4</span><div><strong>Prepare personalized outreach</strong><p>{opportunity.recommendedService}</p><button className="text-button" onClick={() => onTab("intelligence")}>Open intelligence</button></div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}
