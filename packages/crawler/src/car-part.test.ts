import { strict as assert } from "node:assert";
import { extractCompaniesFromHtml } from "./index.js";

const fixture = `
  <html>
    <body>
      <h3>Auto Recyclers on Car-Part.com - Alphabetically</h3>
      <ul>
        <li><a href="http://www.AandDTruckAutoParts.com">A & D Truck and Auto Parts:</a> Milwaukee, WI</li>
        <li><a href="http://www.AandJAutoSalvage.com">A & J Salvage:</a> Winston-Salem, NC</li>
        <li><a href="http://www.BellCityAuto.com">Bell City Auto Center:</a> Brantford, ON</li>
      </ul>
    </body>
  </html>
`;

const result = extractCompaniesFromHtml({
  url: "https://www.car-part.com/Services/dealers.htm",
  html: fixture
});

assert.equal(result.diagnostics.connectorId, "car-part");
assert.equal(result.diagnostics.extractionStrategy, "car-part-dealer-list");
assert.equal(result.companies.length, 3);
assert.equal(result.companies[0]?.name, "A & D Truck and Auto Parts");
assert.equal(result.companies[0]?.websiteUrl, "http://www.aanddtruckautoparts.com/");
assert.equal(result.companies[0]?.city, "Milwaukee");
assert.equal(result.companies[0]?.region, "WI");
assert.equal(result.companies[0]?.industry, "Automotive Recycling");
assert.equal(result.companies[2]?.country, "Canada");

console.log("Car-Part connector test passed.");
