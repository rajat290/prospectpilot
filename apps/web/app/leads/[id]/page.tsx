import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { LeadWorkspace } from "../../../components/lead-workspace";
import { Pill } from "../../../components/pill";
import { apiGet } from "../../../lib/api";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const [lead, templates, communicationStatus] = await Promise.all([
    apiGet<any | null>(`/companies/${params.id}`, null),
    apiGet<any[]>("/message-templates", []),
    apiGet<any>("/communications/status", { accounts: [] })
  ]);
  if (!lead) notFound();

  return (
    <main className="page lead-workspace-page">
      <header className="lead-profile-head">
        <div>
          <a className="back-link" href="/leads"><ArrowLeft size={14} /> Lead database</a>
          <div className="lead-title-line">
            <span className="lead-avatar"><Building2 size={22} /></span>
            <div>
              <div className="lead-kicker">
                <Pill value={lead.connectorId || "generic"} />
                <span>{lead.trustStatus.replaceAll("_", " ").toLowerCase()}</span>
              </div>
              <h1>{lead.name}</h1>
              <p><MapPin size={13} /> {[lead.industry || lead.category, lead.city, lead.region, lead.country].filter(Boolean).join(" | ") || "Business classification pending"}</p>
            </div>
          </div>
        </div>
        <div className="lead-head-meta">
          <span>Last intelligence update</span>
          <strong>{formatDate(lead.updatedAt)}</strong>
          <small>{lead.evidence?.length || 0} evidence signals</small>
        </div>
      </header>
      <LeadWorkspace lead={lead} templates={templates} accounts={communicationStatus.accounts} />
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}
