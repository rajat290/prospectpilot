import { strict as assert } from "node:assert";
import { extractCompaniesFromHtml } from "./index.js";

const fixture = `
  <main>
    <article class="listing">
      <h2 class="company-name">Bright Dental Studio</h2>
      <p class="category">Dental Clinic</p>
      <p class="address">MG Road, Pune</p>
      <a href="/members/bright-dental">View profile</a>
      <a href="https://brightdental.example">Website</a>
      <a href="mailto:hello@brightdental.example">Email</a>
      <a href="tel:+91 98765 43210">Call</a>
    </article>
    <article class="listing">
      <h3 class="business-name">Northstar Components</h3>
      <p class="description">Industrial components manufacturer.</p>
      <a href="https://northstar-components.example">Official website</a>
    </article>
    <article class="listing">
      <h3>Home</h3>
      <a href="https://directory.example">Return home</a>
    </article>
    <article class="listing">
      <h3>Northstar Components LLC</h3>
      <a href="https://northstar-components.example/about">Duplicate official website</a>
    </article>
  </main>
`;

const result = extractCompaniesFromHtml({
  url: "https://directory.example/members",
  html: fixture
});

assert.equal(result.companies.length, 2);
assert.equal(result.companies[0]?.name, "Bright Dental Studio");
assert.equal(result.companies[0]?.category, "Dental Clinic");
assert.equal(result.companies[0]?.websiteUrl, "https://brightdental.example/");
assert.equal(result.companies[0]?.email, "hello@brightdental.example");
assert.equal(result.companies[0]?.sourceUrl, "https://directory.example/members/bright-dental");
assert.equal(result.companies[1]?.name, "Northstar Components");
assert.ok(result.diagnostics.rejectedCount >= 2);

console.log("Crawler fixture test passed.");
