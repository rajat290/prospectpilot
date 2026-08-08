import { ArrowLeft, Radar } from "lucide-react";
import { redirect } from "next/navigation";
import { ContextHelp, FieldHelp } from "../../../components/context-help";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function createSource(formData: FormData) {
  "use server";

  const url = String(formData.get("url") ?? "");
  const name = String(formData.get("name") ?? "");
  const response = await fetch(`${apiUrl}/sources`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, name: name || undefined })
  });

  if (!response.ok) throw new Error((await response.text()) || "The source could not be added.");
  redirect("/sources");
}

export default function NewSourcePage() {
  return (
    <main className="page narrow-page">
      <header className="page-head">
        <div><p className="eyebrow">Find leads</p><h1>Add a public business directory</h1><p className="subtle">Create a controlled source first. You choose when to start extraction.</p></div>
        <a className="button" href="/sources"><ArrowLeft size={15} /> Back to sources</a>
      </header>

      <ContextHelp title="Use a directory page, not a search homepage">
        Paste the page that actually lists businesses. Start with a small record limit from the Sources page and review quality before increasing it.
      </ContextHelp>

      <section className="panel source-form-panel">
        <div className="panel-head"><h2><Radar size={18} /> Source details</h2></div>
        <form action={createSource} className="panel-body source-form">
          <label>
            <span>Source name <FieldHelp>A short label you will recognize in filters and reports. It does not affect extraction.</FieldHelp></span>
            <input name="name" placeholder="Example: US auto recyclers" />
          </label>
          <label>
            <span>Directory page URL <FieldHelp>The public page containing business listings. ProspectPilot respects source rules and configured request limits.</FieldHelp></span>
            <input required name="url" type="url" placeholder="https://example.com/business-directory" />
          </label>
          <div className="notice">Adding a source does not send email. Extraction and campaigns remain separate, reviewed actions.</div>
          <div className="actions"><a className="button" href="/sources">Cancel</a><button className="button primary">Add source</button></div>
        </form>
      </section>
    </main>
  );
}
