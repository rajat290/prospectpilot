import assert from "node:assert/strict";
import test from "node:test";
import { extractContactsFromHtml, filterOfficialWebsiteCandidates, searchOfficialWebsite } from "./index.js";

test("filters directories and social profiles from official website candidates", () => {
  const candidates = filterOfficialWebsiteCandidates([
    { link: "https://www.facebook.com/northstar", title: "Northstar" },
    { link: "https://www.yelp.com/biz/northstar", title: "Northstar Reviews" },
    { link: "https://northstarauto.com/", title: "Northstar Auto Recyclers" }
  ]);
  assert.deepEqual(candidates.map((candidate) => candidate.url), ["https://northstarauto.com/"]);
});

test("returns provider missing without making a network request", async () => {
  const result = await searchOfficialWebsite(
    { companyName: "Northstar Auto Recyclers", city: "Toronto" },
    { apiKey: "" }
  );
  assert.equal(result.status, "PROVIDER_MISSING");
  assert.equal(result.confidence, 0);
});

test("selects the strongest official result from SerpAPI data", async () => {
  const result = await searchOfficialWebsite(
    { companyName: "Northstar Auto Recyclers", city: "Toronto" },
    {
      apiKey: "test",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            organic_results: [
              { link: "https://www.yellowpages.com/northstar", title: "Listing" },
              {
                link: "https://northstarauto.com/",
                title: "Northstar Auto Recyclers",
                snippet: "Northstar Auto Recyclers in Toronto"
              }
            ]
          }),
          { status: 200 }
        )
    }
  );
  assert.equal(result.status, "DISCOVERED");
  assert.equal(result.websiteUrl, "https://northstarauto.com/");
  assert.ok(result.confidence >= 45);
});

test("rejects analytics IDs and IP addresses while keeping public phones", () => {
  const result = extractContactsFromHtml(
    `<p>Tracking 1785016792-1.2.1.1-3 and server 103.6.157.214</p>
     <p>Call us at 804-746-5251</p>
     <a href="tel:+1-312-621-1950">Phone</a>`,
    "https://example.com"
  );
  assert.deepEqual(result.phones.map((phone) => phone.value), ["804-746-5251", "+1-312-621-1950"]);
});
