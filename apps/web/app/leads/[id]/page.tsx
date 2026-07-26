import { ArrowLeft, ExternalLink, Mail, Phone, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { LeadActions } from "../../../components/lead-actions";
import { OutreachMessage } from "../../../components/outreach-message";
import { Pill } from "../../../components/pill";
import { apiGet } from "../../../lib/api";
import { ContextHelp } from "../../../components/context-help";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await apiGet<any | null>(`/companies/${params.id}`, null);
  if (!lead) notFound();
  const audit = lead.audits?.[0];
  const opportunity = lead.opportunities?.[0];
  const email = lead.contacts?.find((contact: any) => contact.type === "EMAIL")?.value || lead.email;
  const phone = lead.contacts?.find((contact: any) => contact.type === "PHONE")?.value || lead.phone;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <a className="subtle" href="/leads" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 9 }}><ArrowLeft size={14} /> Back to leads</a>
          <p className="eyebrow">{lead.connectorId || "Generic source"} intelligence</p>
          <h1>{lead.name}</h1>
          <p className="subtle">{[lead.industry, lead.city, lead.region].filter(Boolean).join(" · ") || "Business classification pending"}</p>
        </div>
        <div className="actions">
          {lead.websiteUrl ? <a className="button" href={lead.websiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Visit website</a> : null}
          <LeadActions companyId={lead.id} crmItem={lead.crmItem} />
        </div>
      </header>

      <ContextHelp title="Verify before outreach">
        Confirm that this is the correct business and that the contact is public. Read the opportunity reasoning, personalize one draft, then update CRM immediately after manual outreach.
      </ContextHelp>

      <section className="detail-grid">
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h2>Lead intelligence</h2><div className="actions"><Pill value={lead.crmItem?.status || lead.status} /><span className="score">{lead.leadScore?.score ?? "-"}</span></div></div>
            <div className="panel-body">
              <ContextHelp compact title="Use these as evidence signals">Missing means the crawler did not detect it; it does not always mean the feature is absent. Visit the website when the pitch depends on it.</ContextHelp>
              <div className="facts">
                <Fact label="Email" value={email || "Not found"} icon={<Mail size={14} />} />
                <Fact label="Phone" value={phone || "Not found"} icon={<Phone size={14} />} />
                <Fact label="Website confidence" value={`${lead.website?.discoveryScore ?? 0}%`} icon={<ShieldCheck size={14} />} />
                <Fact label="Discovery status" value={lead.websiteDiscoveryStatus?.replaceAll("_", " ") || "Pending"} />
                <Fact label="HTTPS" value={audit ? (audit.hasHttps ? "Secure" : "Missing") : "Pending"} />
                <Fact label="Contact form" value={audit ? (audit.hasContactForm ? "Detected" : "Missing") : "Pending"} />
                <Fact label="Analytics" value={audit ? (audit.hasAnalytics ? "Detected" : "Missing") : "Pending"} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Recommended opportunity</h2><Sparkles size={17} /></div>
            <div className="panel-body">
              <ContextHelp compact title="What to sell">This is the strongest detected service angle. Keep it only when the website evidence supports the recommendation.</ContextHelp>
              {opportunity ? <><Pill value={opportunity.category} /><h3 style={{ fontSize: 17, margin: "13px 0 7px" }}>{opportunity.title}</h3><p className="subtle" style={{ lineHeight: 1.6 }}>{opportunity.reasoning}</p><div className="notice" style={{ marginTop: 14 }}><strong>Pitch:</strong> {opportunity.recommendedService} · {opportunity.confidence}% confidence</div></> : <div className="empty">Run enrichment to generate the first opportunity.</div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Outreach kit</h2><span className="pill">{lead.outreachDrafts?.length || 0} drafts</span></div>
            <div className="panel-body stack">
              <ContextHelp compact title="How to use drafts">Copy the right channel, rewrite the opening in your voice, and mention one verified observation. Sending remains manual.</ContextHelp>
              {lead.outreachDrafts?.map((draft: any) => <OutreachMessage key={draft.id} draft={draft} />)}
              {!lead.outreachDrafts?.length ? <div className="empty">Outreach drafts appear after enrichment and scoring.</div> : null}
            </div>
          </div>
        </div>

        <div className="stack">
          <LeadActions companyId={lead.id} crmItem={lead.crmItem} mode="panel" />
          <div className="panel">
            <div className="panel-head"><h2>Technology signals</h2><RefreshCw size={15} /></div>
            <div className="panel-body">
              <div className="actions">{lead.technologies?.length ? lead.technologies.map((tech: any) => <span className="pill" key={tech.id}>{tech.name} · {tech.confidence}%</span>) : <span className="subtle">No stack detected</span>}</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Activity</h2><span className="pill">{lead.activities?.length || 0}</span></div>
            <div className="panel-body stack">
              {lead.activities?.map((activity: any) => <div className="list-row" key={activity.id}><div className="list-row-main"><strong>{activity.summary}</strong><p>{new Date(activity.createdAt).toLocaleString()}</p></div></div>)}
              {!lead.activities?.length ? <div className="empty">No activity recorded yet.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="fact"><small>{label}</small><strong style={{ display: "flex", alignItems: "center", gap: 6 }}>{icon}{value}</strong></div>;
}
