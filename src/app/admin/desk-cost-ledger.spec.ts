import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin desk cost ledger", () => {
  it("does not present internal claim and lease rows as paid providers", () => {
    const source = readFileSync("src/app/admin/desk.tsx", "utf8");
    expect(source).toContain("upstream not like 'idempotency:%'");
    expect(source).toContain("upstream not like 'lease:%'");
    expect(source).toContain("upstream not like 'daily-cap:%'");
  });
});
