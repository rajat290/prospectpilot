import { ArrowUpRight, Building2, Clock3, Inbox, Mail, MessageSquareReply, ShieldCheck } from "lucide-react";
import { ContextHelp } from "../../components/context-help";
import { MessageComposer } from "../../components/message-composer";
import { Pill } from "../../components/pill";
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
  const recipient = selected?.participants?.[0]
    ? { id: selected.participants[0].contactId, value: selected.participants[0].address }
    : { value: "" };

  return (
    <main className="page inbox-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Unified communication hub</p>
          <h1>One inbox, every lead in context.</h1>
          <p className="subtle">Read, draft, approve, and track outreach without losing the evidence behind the conversation.</p>
        </div>
        <div className="actions">
          <a className="button" href="/communications"><ShieldCheck size={15} /> Mailbox controls</a>
          <a className="button primary" href="/leads"><Mail size={15} /> Start from a lead</a>
        </div>
      </header>

      <ContextHelp title="Safe workflow">
        New outbound messages are drafts first. Review them in Communications, then queue them through a connected Gmail mailbox. Demo conversations below never send real email.
      </ContextHelp>

      <section className="inbox-shell">
        <aside className="inbox-list">
          <div className="inbox-list-head">
            <div><strong>Conversations</strong><span>{conversations.length} visible</span></div>
            <div className="inbox-filter">
              <a className={!searchParams.status ? "active" : ""} href="/inbox">All</a>
              <a className={searchParams.status === "NEEDS_REPLY" ? "active" : ""} href="/inbox?status=NEEDS_REPLY">Needs reply</a>
            </div>
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => {
              const latest = conversation.messages?.[0];
              return (
                <a className={conversation.id === selectedId ? "active" : ""} href={`/inbox?conversation=${conversation.id}${searchParams.status ? `&status=${searchParams.status}` : ""}`} key={conversation.id}>
                  <span className="conversation-avatar">{conversation.company?.name?.slice(0, 1) || "?"}</span>
                  <div>
                    <div><strong>{conversation.company?.name || "Unmatched conversation"}</strong><time>{relativeTime(conversation.latestMessageAt)}</time></div>
                    <p>{conversation.subject || "No subject"}</p>
                    <span>{latest?.bodyText || conversation.nextAction || "No preview available"}</span>
                    <div><Pill value={conversation.status} />{conversation.unreadCount ? <b>{conversation.unreadCount}</b> : null}</div>
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
              <header className="thread-head">
                <div><span className="lead-avatar compact"><Building2 size={17} /></span><div><h2>{selected.subject || "Conversation"}</h2><p>{selected.company?.name} · {selected.participants?.map((item: any) => item.address).join(", ")}</p></div></div>
                <a className="button icon" href={`/leads/${selected.company?.id}`} title="Open Lead 360"><ArrowUpRight size={15} /></a>
              </header>
              {selected.aiClassification ? (
                <div className="reply-intelligence">
                  <MessageSquareReply size={16} />
                  <div><strong>{selected.aiClassification.replaceAll("_", " ")}</strong><span>{selected.nextAction || "Review and respond"} · {selected.classificationConfidence}% confidence</span></div>
                </div>
              ) : null}
              <div className="message-thread">
                {selected.messages.map((message: any) => (
                  <article className={`thread-message ${message.direction.toLowerCase()}`} key={message.id}>
                    <div className="thread-message-head">
                      <strong>{message.direction === "INBOUND" ? recipient.value : selected.connection?.emailAddress || "You"}</strong>
                      <span><Pill value={message.status} /><time>{formatDate(message.receivedAt || message.sentAt || message.createdAt)}</time></span>
                    </div>
                    <p>{message.bodyText}</p>
                    {message.events?.length ? <footer><Clock3 size={12} /> {message.events.at(-1)?.type.replaceAll("_", " ").toLowerCase()}</footer> : null}
                  </article>
                ))}
              </div>
              <MessageComposer company={selected.company} conversation={selected} recipient={recipient} templates={templates} accounts={communicationStatus.accounts} />
            </>
          ) : <div className="empty thread-empty"><Inbox size={28} /><strong>Select a conversation</strong><span>The lead context and complete history will appear here.</span></div>}
        </div>

        <aside className="conversation-context">
          {selected ? (
            <>
              <div className="context-company"><span className="conversation-avatar large">{selected.company?.name?.slice(0, 1)}</span><h3>{selected.company?.name}</h3><a href={`/leads/${selected.company?.id}`}>Open full Lead 360</a></div>
              <div className="context-fact"><span>Revenue score</span><strong>{selected.company?.leadScore?.score ?? "Pending"}</strong></div>
              <div className="context-fact"><span>Deal stage</span><strong>{selected.company?.crmItem?.status?.replaceAll("_", " ") || "Research"}</strong></div>
              <div className="context-fact"><span>Mailbox</span><strong>{selected.connection?.emailAddress || "Unassigned"}</strong></div>
              <div className="context-fact"><span>Thread state</span><Pill value={selected.status} /></div>
              <div className="context-note"><ShieldCheck size={15} /><p>Messages attach by exact contact address or provider thread ID. Weak domain matches stay unassigned for review.</p></div>
            </>
          ) : null}
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
