"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { humanizeTerm, TERMINOLOGY_LIST } from "../lib/terminology";

export function Glossary() {
  const [query, setQuery] = useState("");
  const terms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return TERMINOLOGY_LIST.filter((term) => !needle || `${term.key} ${term.label} ${term.meaning} ${term.nextAction ?? ""}`.toLowerCase().includes(needle));
  }, [query]);

  return (
    <section className="glossary" id="glossary">
      <header className="glossary-head">
        <div><p className="eyebrow">Plain-language dictionary</p><h2>What every status means</h2><p className="subtle">Search the exact word you see anywhere in ProspectPilot.</p></div>
        <label className="glossary-search"><Search size={16} /><span className="sr-only">Search glossary</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search: hard bounce, verified, sequence..." /></label>
      </header>
      <div className="glossary-list">
        {terms.map((term) => (
          <article className="glossary-row" key={term.key}>
            <div><span className="glossary-group">{term.group}</span><h3>{term.label}</h3><code>{humanizeTerm(term.key)}</code></div>
            <p>{term.meaning}</p>
            <p className="glossary-next"><strong>What to do:</strong> {term.nextAction ?? "Use it as supporting information and review the surrounding context."}</p>
          </article>
        ))}
        {!terms.length ? <div className="empty">No matching term. Try a shorter word.</div> : null}
      </div>
    </section>
  );
}
