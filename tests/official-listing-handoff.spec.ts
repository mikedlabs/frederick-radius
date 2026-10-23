import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stageOfficialListingHours } from "../scripts/stage-official-listing-hours";
import { reviewMerchantHoursBatch } from "../scripts/lib/review-merchant-hours-batch";
import { runOfficialHoursBatch } from "../scripts/review-official-hours-batch";

const now = new Date("2026-10-22T18:00:00.000Z");
const revision = "a".repeat(40);
const observedAt = "2026-10-22T12:00:00.000Z";
const html = readFileSync("tests/fixtures/merchant-hours/thai-meric-eatery-bar-frederick.html", "utf8");
const hash = createHash("sha256").update(html).digest("hex");
const slug = "thai-meric-eatery-bar-frederick";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "radius-offline-handoff-"));
  const artifactPath = join(root, "approved.json"), indexPath = join(root, "index.json"), originalPath = join(root, "original.html");
  const baseline = { schema_version: 1, places: [], review: [{ slug: "brewers-alley-frederick", checked_at: observedAt, reason: "source_unavailable" }] };
  const index = { schema_version: 1, source_revision: revision, collection_complete: false, evidence_capture_failed: true,
    records: [{ source_url: "https://www.thaimeric.com/", observed_at: observedAt, source_sha256: hash, bytes: Buffer.byteLength(html), content_type: "text/html; charset=utf-8", status: 200,
      source_revision: revision, identity: { slug, name: "Thai Meric Eatery & Bar", category: "restaurant", website: "https://www.thaimeric.com/", address: "1170 W Patrick St Ste E", city: "Frederick", state: "MD", postal_code: "21703", phone: "2406510998" }, evidence_file: "original.html" }] };
  writeFileSync(artifactPath, JSON.stringify(baseline, null, 4)); writeFileSync(originalPath, html); writeFileSync(indexPath, JSON.stringify(index));
  const args = [`--index=${indexPath}`, `--source-revision=${revision}`, `--select=${slug}@${hash}`, `--artifact=${artifactPath}`];
  return { root, artifactPath, indexPath, originalPath, baseline, index, args };
}
describe("offline source-to-existing-reviewer connector", () => {
  it("defaults to no writes and reviews an intact selected response despite an unrelated partial collection", () => {
    const f = fixture(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    try {
      const original = readFileSync(f.artifactPath, "utf8"), index = readFileSync(f.indexPath, "utf8");
      expect(stageOfficialListingHours(f.args, now)).toEqual({ dry_run: true, source_revision: revision, collection_complete: false, selected: [slug], staged: [slug], blocked: [], accepted: [], held_plan_decisions: 1, publication_required: false });
      expect(readFileSync(f.artifactPath, "utf8")).toBe(original); expect(readFileSync(f.indexPath, "utf8")).toBe(index);
      expect(fetch).not.toHaveBeenCalled(); expect(existsSync(join(f.root, "pending-merchant-hours.json"))).toBe(false);
    } finally { fetch.mockRestore(); rmSync(f.root, { recursive: true, force: true }); }
  });
  it("creates a private immutable handoff with original bytes and a plan consumable by the unchanged reviewer", () => {
    const f = fixture(); const output = join(f.root, "new-private-review");
    try {
      const original = readFileSync(f.artifactPath, "utf8");
      const result = stageOfficialListingHours([...f.args, `--output-dir=${output}`, "--write"], now);
      expect(result).toMatchObject({ dry_run: false, accepted: [], publication_required: false, output_directory: output });
      expect(statSync(output).mode & 0o777).toBe(0o700);
      const artifactPath = join(output, "pending-merchant-hours.json"), planPath = join(output, "review-plan.json");
      for (const path of [artifactPath, planPath, join(output, `evidence-${hash}.html`), join(output, "review-handoff.json")]) expect(statSync(path).mode & 0o777).toBe(0o600);
      const pending = readFileSync(artifactPath, "utf8"), plan = JSON.parse(readFileSync(planPath, "utf8"));
      expect(plan.decisions[0]).toMatchObject({ decision: "hold", source_sha256: hash, observed_at: observedAt, evidence_file: `evidence-${hash}.html`, review_note: "" });
      expect(readFileSync(join(output, plan.decisions[0].evidence_file), "utf8")).toBe(html);
      expect(reviewMerchantHoursBatch(pending, plan, () => { throw new Error("held plan cannot read"); }, now).accepted).toEqual([]);
      expect(runOfficialHoursBatch([`--artifact=${artifactPath}`, `--plan=${planPath}`], now)).toMatchObject({ dry_run: true, accepted: [], held: [slug] });
      plan.decisions[0].decision = "accept";
      plan.decisions[0].review_note = "Reviewed exact original restaurant identity, full visible and structured weekly schedule, source notices and split service periods.";
      const accepted = reviewMerchantHoursBatch(pending, plan, (file) => readFileSync(join(output, file), "utf8"), now);
      expect(accepted.accepted).toEqual([slug]); expect(accepted.artifact.review).toEqual(f.baseline.review);
      writeFileSync(planPath, JSON.stringify(plan));
      // Real operator entry point resolves originals from the plan directory
      // while invoked in the repository, with no custom readEvidence seam.
      expect(runOfficialHoursBatch([`--artifact=${artifactPath}`, `--plan=${planPath}`], now)).toMatchObject({ dry_run: true, accepted: [slug] });
      expect(readFileSync(artifactPath, "utf8")).toBe(pending);
      expect(readFileSync(f.artifactPath, "utf8")).toBe(original);
      expect(() => stageOfficialListingHours([...f.args, `--output-dir=${output}`, "--write"], now)).toThrow();
      expect(readFileSync(artifactPath, "utf8")).toBe(pending);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it.each(["revision", "record-revision", "hash", "ambiguous", "duplicate-selection", "other-page-same-slug", "missing-selection", "missing-write-directory", "dry-run-directory", "apply"])("rejects unsafe or ambiguous %s without modifying approved facts", (failure) => {
    const f = fixture(); let args = [...f.args];
    try {
      if (failure === "revision") args[1] = `--source-revision=${"b".repeat(40)}`;
      if (failure === "record-revision") f.index.records[0].source_revision = "b".repeat(40);
      if (failure === "hash") writeFileSync(f.originalPath, html.replace("11:00 AM", "12:00 PM"));
      if (failure === "ambiguous") f.index.records.push({ ...f.index.records[0] });
      if (failure === "duplicate-selection") args.push(args[2]);
      if (failure === "other-page-same-slug") args.push(`--select=${slug}@${"0".repeat(64)}`);
      if (failure === "missing-selection") args = args.filter((arg) => !arg.startsWith("--select="));
      if (failure === "missing-write-directory") args.push("--write");
      if (failure === "dry-run-directory") args.push(`--output-dir=${join(f.root, "unwritten")}`);
      if (failure === "apply") args.push("--apply");
      writeFileSync(f.indexPath, JSON.stringify(f.index));
      const before = readFileSync(f.artifactPath, "utf8");
      expect(() => stageOfficialListingHours(args, now)).toThrow(); expect(readFileSync(f.artifactPath, "utf8")).toBe(before);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it.each(["traversal", "absolute", "symlink"])("rejects an original-evidence %s path", (failure) => {
    const f = fixture();
    try {
      if (failure === "traversal") f.index.records[0].evidence_file = "../original.html";
      if (failure === "absolute") f.index.records[0].evidence_file = f.originalPath;
      if (failure === "symlink") { symlinkSync(f.originalPath, join(f.root, "linked.html")); f.index.records[0].evidence_file = "linked.html"; }
      writeFileSync(f.indexPath, JSON.stringify(f.index));
      expect(() => stageOfficialListingHours(f.args, now)).toThrow();
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it("cannot place original source bodies or plans under the public repository", () => {
    const f = fixture(); const output = resolve(".private-handoff-must-not-be-created");
    try {
      expect(() => stageOfficialListingHours([...f.args, `--output-dir=${output}`, "--write"], now)).toThrow(/outside the repository/);
      expect(existsSync(output)).toBe(false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it("rejects a private-looking symlink parent pointing into repository public assets before creating output", () => {
    const f = fixture(); const linkedParent = join(f.root, "linked-public");
    const output = join(linkedParent, ".intake-must-not-be-created");
    try {
      symlinkSync(resolve("public"), linkedParent, "dir");
      expect(() => stageOfficialListingHours([...f.args, `--output-dir=${output}`, "--write"], now)).toThrow(/outside the repository/);
      expect(existsSync(output)).toBe(false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it("does not inspect, erase or depend on unselected failed original records", () => {
    const f = fixture();
    try {
      f.index.records.push({ ...f.index.records[0], source_sha256: "0".repeat(64), evidence_file: "missing-unselected.html", identity: { ...f.index.records[0].identity, slug: "not-selected" } });
      writeFileSync(f.indexPath, JSON.stringify(f.index));
      expect(stageOfficialListingHours(f.args, now).staged).toEqual([slug]);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
});
