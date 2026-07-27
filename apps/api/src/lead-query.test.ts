import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyWhere, leadQuerySchema } from "./lead-query.js";

test("parses false query values without boolean coercion inversion", () => {
  const query = leadQuerySchema.parse({ hasContact: "false", hasIssues: "false" });
  assert.equal(query.hasContact, false);
  assert.equal(query.hasIssues, false);
  const where = buildCompanyWhere(query);
  assert.deepEqual(where.contacts, { none: {} });
  assert.deepEqual(where.qualityIssues, { none: { status: "OPEN" } });
});

test("adds trust and quarantine filters to the Prisma query", () => {
  const query = leadQuerySchema.parse({ trustStatus: "VERIFIED", quarantined: "true" });
  const where = buildCompanyWhere(query);
  assert.equal(where.trustStatus, "VERIFIED");
  assert.deepEqual(where.quarantinedAt, { not: null });
});
