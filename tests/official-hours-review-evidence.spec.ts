import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createOfficialHoursReviewEvidence } from "../scripts/lib/official-hours-review-evidence";
import { collectMerchantOfficialHours } from "../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES } from "../src/lib/merchant-hours";

const now = new Date("2026-10-22T18:00:00.000Z");
const url = "https://www.commonmarket.coop/";
const html = readFileSync("tests/fixtures/merchant-hours/common-market.html", "utf8");
const receipt = { url, html, observedAt: "2026-10-22T09:32:35.900Z" };
describe("authenticated native hours evidence bundle", () => {
  it("captures one immutable response for two independently held listings, plus failures/manual skips without false observations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hours-evidence-"));
    try {
      const path = join(directory, "capture");
      const capture = createOfficialHoursReviewEvidence(path, { now, sourceRevision: "a".repeat(40) });
      const transport = vi.fn(async (source: string) => { if (source !== url) throw new Error("source unavailable"); return receipt; });
      const result = await collectMerchantOfficialHours({ schema_version: 1, places: [], review: [] }, (source) => capture(source, transport), now);
      const index = JSON.parse(readFileSync(join(path, "index.json"), "utf8"));
      expect(index.source_revision).toBe("a".repeat(40));
      expect(index.collection_complete).toBe(true);
      const captured = index.records.filter((row: { status: string }) => row.status === "captured");
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ source_url: url, slugs: ["common-market-frederick", "common-market"], observed_at: receipt.observedAt, source_sha256: createHash("sha256").update(html).digest("hex"), bytes: Buffer.byteLength(html) });
      expect(readFileSync(join(path, captured[0].evidence_file), "utf8")).toBe(html);
      const manual = index.records.filter((row: { status: string }) => row.status === "manual_not_read");
      expect(manual).toHaveLength(2);
      for (const row of index.records.filter((row: { status: string }) => row.status !== "captured")) {
        expect(row.observed_at).toBeUndefined(); expect(row.source_sha256).toBeUndefined(); expect(row.evidence_file).toBeUndefined();
      }
      expect(transport.mock.calls.filter(([source]) => source === url)).toHaveLength(1);
      const native = MERCHANT_HOURS_SOURCES.filter((source) => !("collection" in source && source.collection === "manual"));
      expect(transport).toHaveBeenCalledTimes(new Set(native.map((source) => source.url)).size);
      expect(result.artifact.review.filter((row) => row.candidate)).toHaveLength(2);
      expect(readdirSync(path).filter((name) => name.endsWith(".html"))).toHaveLength(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("does not overwrite an older bundle or call manual, unknown or duplicate URLs", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hours-evidence-"));
    try {
      const path = join(directory, "capture");
      const capture = createOfficialHoursReviewEvidence(path, { now });
      expect(() => createOfficialHoursReviewEvidence(path, { now })).toThrow();
      const transport = vi.fn(async () => receipt);
      await expect(capture("https://www.sumittra.com/", transport)).rejects.toThrow();
      await expect(capture("https://unreviewed.example/", transport)).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
      await capture(url, transport);
      await expect(capture(url, transport)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(JSON.parse(readFileSync(join(path, "index.json"), "utf8")).source_revision).toBe("unknown");
      expect(JSON.parse(readFileSync(join(path, "index.json"), "utf8")).collection_complete).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it.each(["wrong-url", "oversized", "invalid-time"])("retains an explicit failed attempt for %s without inventing source evidence", async (failure) => {
    const directory = mkdtempSync(join(tmpdir(), "hours-evidence-"));
    try {
      const path = join(directory, "capture"), capture = createOfficialHoursReviewEvidence(path, { now });
      const page = { ...receipt };
      if (failure === "wrong-url") page.url = "https://unreviewed.example/";
      if (failure === "oversized") page.html = "a".repeat(512001);
      if (failure === "invalid-time") page.observedAt = "unknown";
      await expect(capture(url, async () => page)).rejects.toThrow(/Unusable/);
      const index = JSON.parse(readFileSync(join(path, "index.json"), "utf8"));
      expect(index.records.find((row: { source_url: string }) => row.source_url === url)).toEqual({ source_url: url, slugs: ["common-market-frederick", "common-market"], status: "unavailable", checked_at: now.toISOString() });
      expect(readdirSync(path)).toEqual(["index.json"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
