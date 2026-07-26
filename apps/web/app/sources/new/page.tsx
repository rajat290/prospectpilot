const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function createSource(formData: FormData) {
  "use server";

  const url = String(formData.get("url") ?? "");
  const name = String(formData.get("name") ?? "");

  await fetch(`${apiUrl}/sources`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, name: name || undefined })
  });
}

export default function NewSourcePage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <a href="/" className="text-sm font-semibold text-steel hover:text-ink">
            Back
          </a>
          <h1 className="mt-3 text-2xl font-semibold text-ink">Add lead source</h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={createSource} className="rounded-md border border-black/10 bg-white p-5">
          <label className="block">
            <span className="text-sm font-semibold text-ink">Source name</span>
            <input
              name="name"
              placeholder="Example: Local dentists directory"
              className="mt-2 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-mint"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-ink">Directory URL</span>
            <input
              required
              name="url"
              type="url"
              placeholder="https://example.com/directory"
              className="mt-2 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-mint"
            />
          </label>

          <button className="mt-6 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-mint">
            Start Crawl
          </button>
        </form>
      </section>
    </main>
  );
}

