import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { refreshOfficialHours } from "../scripts/refresh-official-hours";
import { parseFcplOfficialHours } from "../scripts/lib/fcpl-official-hours";
import { parseMerchantOfficialHours } from "../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES } from "../src/lib/merchant-hours";
import { FCPL_CLOSURES_URL, FCPL_HOURS_URL } from "../src/lib/official-hours";

const before = new Date("2026-10-19T23:30:00Z");
const now = new Date("2026-10-20T05:00:00Z");
const fixtures = ["brewers-alley", "gravel-and-grind", "beans-in-the-belfry", "dublin-roasters"];
const nativeSources = MERCHANT_HOURS_SOURCES.filter((source) => !("collection" in source && source.collection === "manual"));
// This historical isolation scenario has actual source pages for the original
// four only. Later native sources fail explicitly; manual evidence is untouched.
const legacySources = MERCHANT_HOURS_SOURCES.filter((source) => ["brewers-alley-frederick", "gravel-and-grind-frederick", "beans-in-the-belfry-brunswick", "dublin-roasters-frederick"].includes(source.slug));
const merchants = legacySources.map((source, index) => ({
  url: source.url,
  html: readFileSync(`tests/fixtures/merchant-hours/${fixtures[index]}.html`, "utf8"),
  observedAt: "2026-10-19T23:24:49.283Z",
}));
const libraries = [FCPL_HOURS_URL, FCPL_CLOSURES_URL].map((url, index) => ({
  url,
  html: readFileSync(`tests/fixtures/${index ? "fcpl-holiday-closings" : "fcpl-hours-index"}.html`, "utf8"),
  observedAt: "2026-10-19T23:24:00.000Z",
}));
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "official-hours-isolation-"));
  const outputPath = join(directory, "library.json");
  const merchantOutputPath = join(directory, "merchant.json");
  const libraryBytes = JSON.stringify(parseFcplOfficialHours(libraries[0], libraries[1], before));
  const merchantBytes = JSON.stringify({ schema_version: 1, places: legacySources.map((source, index) => parseMerchantOfficialHours(source, merchants[index], before)), review: [] });
  writeFileSync(outputPath, libraryBytes);
  writeFileSync(merchantOutputPath, merchantBytes);
  const fetchMerchantPage = vi.fn(async (url: string) => {
    const page = merchants.find((page) => page.url === url);
    if (!page) throw new Error("Source is outside the declared legacy fixture cohort.");
    return { ...page, observedAt: now.toISOString() };
  });
  return { directory, outputPath, merchantOutputPath, libraryBytes, merchantBytes, fetchMerchantPage };
}

describe("independent official-hours cohorts", () => {
  it.each(["weekly-failure", "closure-failure", "closure-conflict"])("continues merchant refresh after %s without rewriting library evidence", async (failure) => {
    const t = setup();
    try {
      const fetchPage = vi.fn(async (url: string) => {
        if (failure === "weekly-failure" || (failure === "closure-failure" && url === FCPL_CLOSURES_URL)) throw new Error("source unavailable");
        const page = libraries.find((entry) => entry.url === url)!;
        return { ...page, observedAt: now.toISOString(), html: failure === "closure-conflict" && url === FCPL_CLOSURES_URL ? "Conflicting source response" : page.html };
      });
      const result = await refreshOfficialHours([], { ...t, fetchPage, now });
      expect(result.libraryStatus).toBe("source_unavailable");
      expect(result.libraryError).toBeTruthy();
      expect(result.reviewRequired).toBe(false);
      expect(readFileSync(t.outputPath, "utf8")).toBe(t.libraryBytes);
      expect(result.artifact.weekly.observed_at).toBe(libraries[0].observedAt);
      expect(t.fetchMerchantPage.mock.calls.map(([url]) => url)).toEqual([...new Set(nativeSources.map((source) => source.url))]);
      const published = JSON.parse(readFileSync(t.merchantOutputPath, "utf8"));
      expect(published.review).toEqual(nativeSources.filter((source) => !legacySources.some((legacy) => legacy.slug === source.slug)).map((source) => ({ slug: source.slug, checked_at: now.toISOString(), reason: "source_unavailable" })));
      expect(published.places).toHaveLength(legacySources.length);
      expect(published.places.every((row: { observed_at: string }) => row.observed_at === now.toISOString())).toBe(true);
    } finally { rmSync(t.directory, { recursive: true, force: true }); }
  });

  it("refuses a corrupt library baseline before collecting unrelated candidates", async () => {
    const t = setup();
    try {
      writeFileSync(t.outputPath, '{"corrupt":true}');
      await expect(refreshOfficialHours([], { ...t, fetchPage: vi.fn(async () => { throw new Error("source unavailable"); }), now })).rejects.toThrow(/official hours/);
      expect(t.fetchMerchantPage).not.toHaveBeenCalled();
      expect(readFileSync(t.outputPath, "utf8")).toBe('{"corrupt":true}');
      expect(readFileSync(t.merchantOutputPath, "utf8")).toBe(t.merchantBytes);
    } finally { rmSync(t.directory, { recursive: true, force: true }); }
  });

  it("a partial dry run makes no file changes", async () => {
    const t = setup();
    try {
      const result = await refreshOfficialHours(["--dry-run"], { ...t, fetchPage: vi.fn(async () => { throw new Error("source unavailable"); }), now });
      expect(result.libraryStatus).toBe("source_unavailable");
      expect(t.fetchMerchantPage).toHaveBeenCalledTimes(new Set(nativeSources.map((source) => source.url)).size);
      expect(readFileSync(t.outputPath, "utf8")).toBe(t.libraryBytes);
      expect(readFileSync(t.merchantOutputPath, "utf8")).toBe(t.merchantBytes);
    } finally { rmSync(t.directory, { recursive: true, force: true }); }
  });
});
