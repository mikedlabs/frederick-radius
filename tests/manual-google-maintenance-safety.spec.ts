import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  selectRotatingManualBatch,
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

  it("rejects unknown paid-scope flags instead of falling back", () => {
    expect(() =>
      assertManualGoogleArgs(
        ["--needs-enrichmnt", "--live", "--confirm", "--limit", "1"],
        { booleanFlags: ["--needs-enrichment"] },
      ),
    ).toThrow("Unknown option --needs-enrichmnt");

    expect(() =>
      assertManualGoogleArgs(
        ["input.json", "output.json", "--limit", "1"],
        { maxPositionals: 2 },
      ),
    ).not.toThrow();
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
    expect(() =>
      parseManualGoogleRun(["200", "--live", "--confirm"], {
        ...config,
        legacyLimit: "200",
      }),
    ).toThrow("positional limits are preview-only");
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

  it("rotates bounded batches so failures at the front cannot starve the catalog", () => {
    expect(selectRotatingManualBatch(["a", "b", "c", "d", "e"], 2, 0)).toEqual({
      items: ["a", "b"],
      offset: 0,
    });
    expect(selectRotatingManualBatch(["a", "b", "c", "d", "e"], 2, 1)).toEqual({
      items: ["c", "d"],
      offset: 2,
    });
    expect(selectRotatingManualBatch(["a", "b", "c", "d", "e"], 2, 2)).toEqual({
      items: ["e", "a"],
      offset: 4,
    });
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

  it("carries the same finite request ceiling into scheduled enrichment", () => {
    const source = read(".github/workflows/enrich-places.yml");

    expect(source).toContain("REQUEST_LIMIT");
    expect(source).toContain("limit must be between 1 and 500");
    expect(source).toContain("--live --confirm --limit");
    expect(source).toContain("Unknown enrichment scope");
    expect(source).toContain("Stage paid-call recovery checkpoint");
    expect(source.match(/actions\/upload-artifact@/g)).toHaveLength(1);
    expect(source).toContain("audit/google-enrichment-attempts.json");
    expect(source.indexOf("Upload paid-call recovery checkpoint")).toBeLessThan(
      source.indexOf("Rebuild public place snapshot"),
    );
    expect(source).not.toContain("--max-cost");
  });

  it("keeps capped enrichment lossless and moves failed rows out of the next batch", () => {
    const curated = read("scripts/enrich-places.ts");
    const discovered = read("scripts/enrich-discovered.ts");
    const vet = read("scripts/vet-places.ts");

    expect(curated).toContain("writeJsonAtomic(OUT, out)");
    expect(curated).toContain("google-enrichment-attempts.json");
    expect(curated).toContain("MISS_BACKOFF_MS");
    expect(curated).toContain('lookup.status === "provider_error"');
    expect(curated).toContain("stopping without recording a no-match backoff");
    expect(curated).toContain('p.source !== "manual" && p.source !== "seed"');
    expect(discovered).toContain("const mergedById = new Map(existingById)");
    expect(discovered).toContain("full artifact");
    expect(vet).toContain("selectRotatingManualBatch");
  });
});
