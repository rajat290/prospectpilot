import { ArrowUpRight, BrainCircuit, Building2, CalendarClock, Gauge, Inbox, Mail, MessageSquareReply, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { AttachmentLink } from "../../components/attachment-link";
import { ContextHelp } from "../../components/context-help";
import { MessageComposer } from "../../components/message-composer";
import { Pill } from "../../components/pill";
import { SalesCopilotActions } from "../../components/sales-copilot-actions";
import { apiGet } from "../../lib/api";

export default async function InboxPage({ searchParams }: { searchParams: { conversation?: string; status?: string } }) {
  const filter = searchParams.status ? `?status=${encodeURIComponent(searchParams.status)}` : "";
  const [conversations, templates, communicationStatus] = await Promise.all([
    apiGet<any[]>(`/conversations${filter}`, []),
    apiGet<any[]>("/message-templates", []),
    apiGet<any>("/communications/status", { accounts: [], counts: {} })
  ]);
  const selectedId = searchParams.conversation || conversations[0]?.id;
  const selected = selectedId ? await apiGet<any | null>(`/conversations/${selectedId}`, null) : null;
  const recipient = selected?.participants?.[0] ? { id: selected.participants[0].contactId, value: selected.participants[0].address } : { value: "" };
  const latestIntelligence = selected?.intelligence?.[0];
  const recommendation = selected?.recommendedActions?.find((item: any) => item.status === "PENDING");
  const suggestion = selected?.suggestedReplies?.find((item: any) => item.status === "DRAFT");
  const latestInbound = selected?.messages?.slice().reverse().find((item: any) => item.direction === "INBOUND");

  return (
    <main className="page inbox-page">
      <header className="page-head">
        <div><p className="eyebrow">Intelligent communication hub</p><h1>Inbox ordered by revenue action.</h1><p className="subtle">Understand each reply, approve the next move, and respond with the complete lead context beside you.</p></div>
        <div className="actions"><a className="button" href="/copilot"><BrainCircuit size={15} /> Copilot controls</a><a className="button" href="/communications"><ShieldCheck size={15} /> Mailbox controls</a><a className="button primary" href="/leads"><Mail size={15} /> Start from a lead</a></div>
      </header>

      <ContextHelp title="Assisted, not autonomous">
        Reply classification and summaries may run automatically. CRM recommendations and generated replies remain pending until you approve them; sending still uses the Gmail approval queue.
      </ContextHelp>

      <section className="inbox-shell">
        <aside className="inbox-list">
          <div className="inbox-list-head"><div><strong>Action queue</strong><span>{conversations.length} visible</span></div><div className="inbox-filter"><a className={!searchParams.status ? "active" : ""} href="/inbox">All</a><a className={searchParams.status === "NEEDS_REPLY" ? "active" : ""} href="/inbox?status=NEEDS_REPLY">Needs reply</a></div></div>
          <div className="conversation-list">
            {conversations.map((conversation) => {
              const latest = conversation.messages?.[0];
              const intelligence = conversation.intelligence?.[0];
              return (
                <a className={conversation.id === selectedId ? "active" : ""} href={`/inbox?conversation=${conversation.id}${searchParams.status ? `&status=${searchParams.status}` : ""}`} key={conversation.id}>
                  <span className="conversation-avatar">{conversation.company?.name?.slice(0, 1) || "?"}</span>
                  <div>
                    <div><strong>{conversation.company?.name || "Unmatched conversation"}</strong><time>{relativeTime(conversation.latestMessageAt)}</time></div>
                    <p>{conversation.subject || "No subject"}</p>
                    <span>{latest?.bodyText || conversation.nextAction || "No preview available"}</span>
                    <div><Pill value={conversation.status} />{intelligence ? <Pill value={intelligence.commercialIntent} /> : null}{conversation.unreadCount ? <b>{conversation.unreadCount}</b> : null}</div>
                  </div>
                </a>
              );
            })}
            {!conversations.length ? <div className="empty"><Inbox size={22} /><p>No conversations match this view.</p></div> : null}
          </div>
        </aside>

        <div className="thread-pane">
          {selected ? (
            <>
              <header className="thread-head"><div><span className="lead-avatar compact"><Building2 size={17} /></span><div><h2>{selected.subject || "Conversation"}</h2><p>{selected.company?.name} · {selected.participants?.map((item: any) => item.address).join(", ")}</p></div></div><a className="button icon" href={`/leads/${selected.company?.id}`} title="Open Lead 360"><ArrowUpRight size={15} /></a></header>
              {latestIntelligence ? (
                <div className={`reply-intelligence intelligence-${latestIntelligence.urgency.toLowerCase()}`}><MessageSquareReply size={16} /><div><strong>{latestIntelligence.category.replaceAll("_", " ")}</strong><span>{latestIntelligence.commercialIntent.toLowerCase()} intent · {latestIntelligence.sentiment.toLowerCase()} · {latestIntelligence.confidence}% confidence</span></div><Pill value={latestIntelligence.reviewStatus} /></div>
              ) : latestInbound ? <div className="reply-intelligence pending"><BrainCircuit size={16} /><div><strong>Analysis pending</strong><span>Run the copilot to calculate intent and the next action.</span></div></div> : null}

              {selected.intelligenceSummary ? (
                <section className="conversation-summary"><header><div><Sparkles size={15} /><strong>Living conversation summary</strong></div><span>v{selected.intelligenceSummary.version} · {selected.intelligenceSummary.messageCount} messages</span></header><p>{selected.intelligenceSummary.summary}</p><div><strong>{selected.intelligenceSummary.currentState}</strong>{selected.intelligenceSummary.pendingItems.map((item: string) => <span key={item}>{item}</span>)}</div></section>
              ) : null}

              <div className="message-thread">
                {selected.messages.map((message: any) => (
                  <article className={`thread-message ${message.direction.toLowerCase()}`} key={message.id}>
                    <div className="thread-message-head"><strong>{message.direction === "INBOUND" ? recipient.value : selected.connection?.emailAddress || "You"}</strong><span><Pill value={message.status} /><time>{formatDate(message.receivedAt || message.sentAt || message.createdAt)}</time></span></div>
                    <p>{message.bodyText}</p>
                    {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((attachment: any) => <AttachmentLink attachment={attachment} key={attachment.id} />)}</div> : null}
                  </article>
                ))}
              </div>

              {recommendation ? <section className="next-action-card"><div className="next-action-icon"><Gauge size={17} /></div><div><span>Next best action</span><strong>{recommendation.action.replaceAll("_", " ")}</strong><p>{recommendation.reason}</p><small>{recommendation.priority.toLowerCase()} priority · {recommendation.confidence}% confidence{recommendation.deadlineAt ? ` · due ${formatDate(recommendation.deadlineAt)}` : ""}</small></div></section> : null}
              {selected.objections?.[0] ? <section className="objection-strip"><ShieldAlert size={16} /><div><span>Current objection</span><strong>{selected.objections[0].type.replaceAll("_", " ")}</strong><p>“{selected.objections[0].evidenceQuote}”</p><small>{selected.objections[0].recommendedHandling}</small></div></section> : null}
              {selected.meetingIntents?.[0] ? <section className="meeting-signal"><CalendarClock size={16} /><div><strong>Meeting intent detected</strong><span>{[selected.meetingIntents[0].dateText, selected.meetingIntents[0].timeText, selected.meetingIntents[0].timezone].filter(Boolean).join(" · ") || "Exact slot not confirmed"}</span></div></section> : null}
              {suggestion ? <section className="suggested-reply-card"><header><div><Sparkles size={15} /><strong>Suggested reply</strong></div><span>{suggestion.confidence}% grounded confidence</span></header><p>{suggestion.bodyText}</p>{suggestion.warnings?.length ? <div className="draft-warnings">{suggestion.warnings.map((warning: string) => <span key={warning}><ShieldAlert size={12} /> {warning}</span>)}</div> : null}</section> : null}

              <SalesCopilotActions conversationId={selected.id} inboundMessageId={latestInbound?.id} intelligence={latestIntelligence} recommendation={recommendation} suggestion={suggestion} tasks={selected.salesTasks} />
              <MessageComposer company={selected.company} conversation={selected} recipient={recipient} templates={templates} accounts={communicationStatus.accounts} />
            </>
          ) : <div className="empty thread-empty"><Inbox size={28} /><strong>Select a conversation</strong><span>The lead context and complete history will appear here.</span></div>}
        </div>

        <aside className="conversation-context">
          {selected ? <><div className="context-company"><span className="conversation-avatar large">{selected.company?.name?.slice(0, 1)}</span><h3>{selected.company?.name}</h3><a href={`/leads/${selected.company?.id}`}>Open full Lead 360</a></div><div className="context-fact"><span>Revenue score</span><strong>{selected.company?.leadScore?.score ?? "Pending"}</strong></div><div className="context-fact"><span>Deal stage</span><strong>{selected.company?.crmItem?.status?.replaceAll("_", " ") || "Research"}</strong></div><div className="context-fact"><span>Thread state</span><Pill value={selected.status} /></div><div className="context-fact"><span>Commercial intent</span><strong>{latestIntelligence?.commercialIntent?.replaceAll("_", " ") || "Pending"}</strong></div><div className="context-fact"><span>Reply urgency</span><strong>{latestIntelligence?.urgency || "Pending"}</strong></div><div className="context-fact"><span>Questions waiting</span><strong>{latestIntelligence?.extractedQuestions?.length || 0}</strong></div>{recommendation?.recommendedCrmStage ? <div className="context-fact"><span>Recommended CRM</span><strong>{recommendation.recommendedCrmStage.replaceAll("_", " ")}</strong></div> : null}<div className="context-note"><ShieldCheck size={15} /><p>Exact contact and provider-thread matching protect lead attribution. Commercial recommendations remain operator-controlled.</p></div></> : null}
        </aside>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function relativeTime(value?: string) {
  if (!value) return "";
  const hours = Math.round((Date.now() - new Date(value).getTime()) / 3_600_000);
  return hours < 24 ? `${Math.max(1, hours)}h` : `${Math.round(hours / 24)}d`;
}
