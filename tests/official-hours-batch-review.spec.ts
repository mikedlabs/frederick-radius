import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { merchantHoursBatchTemplate, reviewMerchantHoursBatch } from "../scripts/lib/review-merchant-hours-batch";
import { runOfficialHoursBatch } from "../scripts/review-official-hours-batch";
import { parseMerchantOfficialHours } from "../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "../src/lib/merchant-hours";

const now = new Date("2026-10-22T18:00:00.000Z");
const observedAt = "2026-10-22T09:32:35.900Z";
const html = readFileSync("tests/fixtures/merchant-hours/common-market.html", "utf8");
const sources = MERCHANT_HOURS_SOURCES.filter((source) => source.url === "https://www.commonmarket.coop/");
const candidates = sources.map((source) => parseMerchantOfficialHours(source, { url: source.url, html, observedAt }, now));
const artifact: MerchantHoursArtifact = { schema_version: 1, places: [], review: candidates.map((candidate) => ({ slug: candidate.slug, checked_at: observedAt, reason: "pending_acceptance", candidate })) };
const bytes = JSON.stringify(artifact);
function plan() {
  const value = merchantHoursBatchTemplate(bytes);
  for (const row of value.decisions) {
    row.decision = "accept";
    row.evidence_file = "common-market.html";
    row.review_note = "Reviewed both exact grocery addresses and shared store schedule; cafe contacts do not establish cafe hours.";
  }
  return value;
}
describe("offline atomic merchant batch review", () => {
  it("prepares held decisions without silently accepting any candidate", () => {
    const value = merchantHoursBatchTemplate(bytes);
    expect(value.decisions).toHaveLength(2);
    expect(value.decisions.every((row) => row.decision === "hold" && !row.review_note && !row.evidence_file)).toBe(true);
    const read = vi.fn(() => { throw new Error("held evidence is not read"); });
    expect(reviewMerchantHoursBatch(bytes, value, read, now)).toMatchObject({ artifact, accepted: [], held: sources.map((source) => source.slug) });
    expect(read).not.toHaveBeenCalled();
  });
  it("accepts two identities with one original evidence read and unchanged actual observations/expiry", () => {
    const read = vi.fn(() => html);
    const result = reviewMerchantHoursBatch(bytes, plan(), read, now);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.artifact.places).toEqual(candidates);
    expect(result.artifact.review).toEqual([]);
    expect(result.accepted).toEqual(sources.map((source) => source.slug));
    expect(JSON.parse(bytes)).toEqual(artifact);
  });
  it("accepts one member while retaining the other member and unselected failures verbatim", () => {
    const value = plan(); value.decisions[1].decision = "hold";
    const extra = { slug: "brewers-alley-frederick", checked_at: observedAt, reason: "source_unavailable" as const };
    const original = JSON.stringify({ ...artifact, review: [...artifact.review, extra] });
    value.artifact_sha256 = merchantHoursBatchTemplate(original).artifact_sha256;
    const result = reviewMerchantHoursBatch(original, value, () => html, now);
    expect(result.artifact.places).toEqual([candidates[0]]);
    expect(result.artifact.review).toEqual([artifact.review[1], extra]);
  });
  it.each(["artifact", "duplicate", "hash", "observation", "url", "unknown", "review", "missing-evidence", "empty"])("rejects invalid %s before writing any artifact", (failure) => {
    const value = plan();
    if (failure === "artifact") value.artifact_sha256 = "0".repeat(64);
    if (failure === "duplicate") value.decisions.push(value.decisions[0]);
    if (failure === "hash") value.decisions[1].source_sha256 = "0".repeat(64);
    if (failure === "observation") value.decisions[1].observed_at = now.toISOString();
    if (failure === "url") value.decisions[1].source_url = "https://unreviewed.example/";
    if (failure === "unknown") value.decisions[1].slug = "unknown-branch";
    if (failure === "review") value.decisions[1].review_note = "ok";
    if (failure === "missing-evidence") value.decisions[1].evidence_file = "";
    if (failure === "empty") value.decisions = [];
    expect(() => reviewMerchantHoursBatch(bytes, value, () => html, now)).toThrow();
    expect(JSON.parse(bytes)).toEqual(artifact);
  });
  it("rejects altered HTML, a changed candidate, expired proof and missing source files", () => {
    expect(() => reviewMerchantHoursBatch(bytes, plan(), () => html + " ", now)).toThrow(/hash/);
    const changed = structuredClone(artifact); changed.review[1].candidate!.hours.mon = [{ open: "09:00", close: "22:00" }];
    const changedBytes = JSON.stringify(changed), value = plan();
    value.artifact_sha256 = merchantHoursBatchTemplate(changedBytes).artifact_sha256;
    expect(() => reviewMerchantHoursBatch(changedBytes, value, () => html, now)).toThrow(/reproduce/);
    expect(() => reviewMerchantHoursBatch(bytes, plan(), () => html, new Date("2026-10-30T18:00:00Z"))).toThrow();
    expect(() => reviewMerchantHoursBatch(bytes, plan(), () => { throw new Error("missing original"); }, now)).toThrow(/missing original/);
  });
  it("dry-runs by default, applies only with the exact plan, and refuses a stale/locked/partly valid batch", () => {
    const directory = mkdtempSync(join(tmpdir(), "hours-batch-"));
    const file = join(directory, "merchant.json"), planFile = join(directory, "plan.json");
    try {
      writeFileSync(file, bytes); writeFileSync(join(directory, "common-market.html"), html); writeFileSync(planFile, JSON.stringify(plan()));
      const args = [`--artifact=${file}`, `--plan=${planFile}`];
      expect(runOfficialHoursBatch(args, now)).toMatchObject({ dry_run: true, accepted: sources.map((source) => source.slug) });
      expect(readFileSync(file, "utf8")).toBe(bytes);
      const broken = plan(); broken.decisions[1].review_note = ""; writeFileSync(planFile, JSON.stringify(broken));
      expect(() => runOfficialHoursBatch([...args, "--apply"], now)).toThrow();
      expect(readFileSync(file, "utf8")).toBe(bytes);
      expect(existsSync(`${file}.review.lock`)).toBe(false);
      writeFileSync(planFile, JSON.stringify(plan())); writeFileSync(`${file}.review.lock`, "another writer");
      expect(() => runOfficialHoursBatch([...args, "--apply"], now)).toThrow();
      expect(readFileSync(`${file}.review.lock`, "utf8")).toBe("another writer");
      rmSync(`${file}.review.lock`);
      expect(runOfficialHoursBatch([...args, "--apply"], now)).toMatchObject({ dry_run: false, remaining_review: 0 });
      expect(JSON.parse(readFileSync(file, "utf8")).places).toEqual(candidates);
      expect(() => runOfficialHoursBatch([...args, "--apply"], now)).toThrow(/exact current artifact/);
      expect(existsSync(`${file}.review.lock`)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
