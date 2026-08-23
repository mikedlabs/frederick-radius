import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
} from "../scripts/lib/manual-google-run";

const config = { defaultLimit: 100, maxLimit: 500 };
const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("manual Google maintenance safety", () => {
  it("defaults to a finite zero-cost plan", () => {
    expect(parseManualGoogleRun([], config)).toEqual({
      live: false,
      confirmed: false,
      dryRun: true,
      limit: 100,
      limitWasExplicit: false,
    });
    expect(parseManualGoogleRun(["--limit", "25"], config)).toMatchObject({
      dryRun: true,
      limit: 25,
      limitWasExplicit: true,
    });
  });

  it("requires live, confirmation, and an explicit finite ceiling together", () => {
    expect(
      parseManualGoogleRun(
        ["--live", "--confirm", "--limit", "25"],
        config,
      ),
    ).toMatchObject({ live: true, confirmed: true, dryRun: false, limit: 25 });

    for (const args of [
      ["--live"],
      ["--confirm"],
      ["--live", "--confirm"],
      ["--live", "--confirm", "--dry-run", "--limit", "1"],
      ["--run", "--limit", "1"],
      ["--limit"],
      ["--limit", "0"],
      ["--limit", "1.5"],
      ["--limit", "501"],
      ["--limit", "1", "--limit", "2"],
    ]) {
      expect(() => parseManualGoogleRun(args, config)).toThrow();
    }
  });

  it("keeps the amenities positional cap as a dry-run-compatible limit", () => {
    expect(
      parseManualGoogleRun(["200"], {
        ...config,
        legacyLimit: "200",
      }),
    ).toMatchObject({ dryRun: true, limit: 200, limitWasExplicit: true });
    expect(() =>
      parseManualGoogleRun(["200", "--limit", "25"], {
        ...config,
        legacyLimit: "200",
      }),
    ).toThrow("either the positional limit or --limit");
  });

  it("prints an exact list-price exposure without implying a provider bill", () => {
    expect(
      googleCostPreview({
        calls: 100,
        pricePerThousandUsd: 25,
        sku: "Place Details Enterprise + Atmosphere",
      }),
    ).toBe(
      "Cost preview: 100 call(s) × $25.00/1,000 (Place Details Enterprise + Atmosphere) = up to $2.50 at list price before free-tier or volume discounts.",
    );
  });

  it("uses one non-resetting request budget across sequential input groups", () => {
    const budget = createManualGoogleCallBudget(3);
    const firstFile = Array.from({ length: 2 }, () => budget.reserve());
    const secondFile = Array.from({ length: 3 }, () => budget.reserve());

    expect(firstFile).toEqual([true, true]);
    expect(secondFile).toEqual([true, false, false]);
    expect(budget.used).toBe(3);
    expect(budget.remaining).toBe(0);
  });

  it("keeps every manually invoked paid maintenance script on the shared planning contract", () => {
    for (const path of [
      "scripts/enrich-amenities.ts",
      "scripts/enrich-curated-adds.ts",
      "scripts/refresh-business-status.ts",
      "scripts/backfill-chij-ids.ts",
      "scripts/audit-dfp-mash.ts",
      "scripts/audit-dfp-mash-followup.ts",
      "scripts/audit-dfp-sample.ts",
      "scripts/backfill-google-photo-attributions.ts",
      "scripts/discover-places.ts",
      "scripts/enrich-discovered.ts",
      "scripts/enrich-places.ts",
      "scripts/vet-places.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("parseManualGoogleRun");
      expect(source, path).toContain("googleCostPreview");
      expect(source, path).toContain("run.dryRun");
      expect(source, path).toContain("--live --confirm --limit");
    }
  });

  it("creates the ChIJ budget once and carries it across both source files", () => {
    const source = read("scripts/backfill-chij-ids.ts");
    const budget = source.indexOf(
      "const callBudget = createManualGoogleCallBudget(run.limit)",
    );
    const fileLoop = source.indexOf("for (const path of paths)");

    expect(budget).toBeGreaterThan(-1);
    expect(fileLoop).toBeGreaterThan(budget);
    expect(source).toContain(
      "patchFile(resolve(path), run, callBudget)",
    );
    expect(source).not.toContain("LIMIT === Infinity");
  });
});
