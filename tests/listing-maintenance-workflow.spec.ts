import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
const require = createRequire(import.meta.url);
const { listingMaintenanceOutcome } = require("../scripts/lib/listing-maintenance-alert.cjs");
function report() {
  return { schema_version: 1, read_model_state: "committed", as_of: "2026-10-20T11:47:00Z", git_sha: "a".repeat(40), data_version: `sha256:${"b".repeat(64)}`, scope: { inventory: "promoted_public_client", decoded_photos: "not_checked", served_deployment: "not_checked", provider_requests: 0 }, summary: { listings: 2, photos: { owned: 1, licensed_local: 0, licensed_remote: 0, provider_eligible: 0, missing: 1 }, hours: { current: 1, stale: 0, needs_review: 0, unknown: 1 } }, rows: [
    { slug: "verified-library", hours: { state: "current", source_kind: "first_party" }, photo: { eligibility: "owned", availability: "not_checked", issue: null } },
    { slug: "unknown-cafe", hours: { state: "unknown", source_kind: null }, photo: { eligibility: "missing", availability: "not_checked", issue: null } },
  ] };
}
describe("daily full-catalog upkeep and exception boundary", () => {
  it("keeps existing unknown coverage visible without falsely declaring it verified or sending a fresh failure", () => {
    const result = listingMaintenanceOutcome(report());
    expect(result.healthy).toBe(true);
    expect(result.detail).toContain("Current schedules: 1");
    expect(result.detail).toContain("unknown: 1");
    expect(result.detail).toContain("does not certify the served deployment");
  });
  it.each(["stale", "needs_review"])("alerts for accepted official evidence that becomes %s", (state) => {
    const value = report(); value.rows[0].hours.state = state;
    value.summary.hours.current = 0; value.summary.hours[state as "stale" | "needs_review"] = 1;
    expect(listingMaintenanceOutcome(value).healthy).toBe(false);
  });
  it("does not conflate old provider inventory with a broken accepted first-party update", () => {
    const value = report(); value.rows[1].hours = { state: "stale", source_kind: "google" };
    value.summary.hours.unknown = 0; value.summary.hours.stale = 1;
    expect(listingMaintenanceOutcome(value).healthy).toBe(true);
  });
  it("alerts for an approved local photo whose file is missing", () => {
    const value = report(); value.rows[0].photo.issue = "local_asset_missing" as never;
    expect(listingMaintenanceOutcome(value)).toMatchObject({ healthy: false, missingLocalPhoto: 1 });
  });
  it.each([
    (r: ReturnType<typeof report>) => { r.summary.listings = 3; },
    (r: ReturnType<typeof report>) => { r.data_version = "unknown"; },
    (r: ReturnType<typeof report>) => { r.read_model_state = "working_tree"; },
    (r: ReturnType<typeof report>) => { r.summary.photos.owned = 0; },
    (r: ReturnType<typeof report>) => { r.rows[0].photo = undefined as never; },
    (r: ReturnType<typeof report>) => { r.rows[0].photo.availability = "decoded"; },
    (r: ReturnType<typeof report>) => { r.scope.served_deployment = "ready"; },
    (r: ReturnType<typeof report>) => { r.summary.hours.current = 99; },
    (r: ReturnType<typeof report>) => { r.rows[1].slug = r.rows[0].slug; },
    (r: ReturnType<typeof report>) => { r.git_sha = "main"; },
    (r: ReturnType<typeof report>) => { r.rows[0].hours.state = "verified_probably"; },
    (r: ReturnType<typeof report>) => { r.scope.provider_requests = 1; },
    (r: ReturnType<typeof report>) => { r.rows = []; r.summary.listings = 0; },
  ])("refuses incomplete or inconsistent coverage instead of closing the tracker", (mutate) => {
    const value = report(); mutate(value);
    expect(() => listingMaintenanceOutcome(value)).toThrow();
  });
  it("uses one credential-free daily inventory and a separate bounded exception writer", () => {
    const workflow = parse(readFileSync(".github/workflows/listing-maintenance.yml", "utf8"));
    expect(workflow.on.schedule).toHaveLength(1);
    const inventory = workflow.jobs.inventory;
    expect(inventory.permissions).toEqual({ contents: "read" });
    expect(inventory["timeout-minutes"]).toBe(10);
    expect(JSON.stringify(inventory)).not.toMatch(/secrets\.|DATABASE_URL|firecrawl|ANTHROPIC|OPENAI|curl|wget/i);
    expect(inventory.steps.some((s: { run?: string }) => s.run?.includes("npm run audit:listings"))).toBe(true);
    expect(workflow.jobs.alert.permissions).toEqual({ actions: "read", contents: "read", issues: "write" });
    const alert = workflow.jobs.alert.steps.find((s: { id?: string }) => s.id === "outcome");
    expect(alert.with.script).toContain("report.git_sha !== context.sha");
    expect(alert.with.script).toContain("stat.size > 6291456");
    expect(alert.with.script).toContain("Coverage is unknown");
    expect(alert.with.script).not.toMatch(/createComment|fetch\(/);
  });
  it("adds only the four reviewed native venue output paths to both trusted check boundaries", () => {
    const expected = ["src/data/data-release.json", "src/data/venue-event-source-inventory.json", "src/data/venue-event-source-state.json", "src/data/venue-events.json"].sort();
    for (const file of ["automated-pr-checks.yml", "automated-pr-status-bridge.yml"]) {
      const text = readFileSync(`.github/workflows/${file}`, "utf8");
      const block = text.match(/'bot\/venue-native-refresh':\s*\[([^\]]+)\]/);
      expect(block).not.toBeNull();
      expect([...block![1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort()).toEqual(expected);
      if (file === "automated-pr-status-bridge.yml") {
        expect(text).toContain("trusted.exports.attachAutomatedPrStatuses");
      } else {
        expect(text).toContain("comparison.data.behind_by !== 0");
      }
    }
  });
});


describe("quiet persistent listing exceptions", () => {
  const { upsertFailure } = require("../scripts/lib/automated-data-issue.cjs");
  const context = { repo: { owner: "mikedlabs", repo: "frederick-radius" }, runId: 123 };
  it("keeps an identical exception state without another issue mutation", async () => {
    const fingerprint = "c".repeat(64);
    const existing = { number: 9, body: `<!-- automated-data-issue:listings -->\n<!-- automated-data-fingerprint:${fingerprint} -->` };
    const update = vi.fn(); const create = vi.fn();
    const github = { paginate: vi.fn(async () => [existing]), rest: { issues: { listForRepo: vi.fn(), update, create } } };
    await upsertFailure({ github, context, family: "listings", body: "Same state, later report.", fingerprint });
    expect(update).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    await upsertFailure({ github, context, family: "listings", body: "A changed failure state.", fingerprint: "d".repeat(64) });
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("ignores report timestamp changes when the actual listing exception state is unchanged", () => {
    const first = report(); const second = report(); second.as_of = "2026-10-21T11:47:00Z";
    expect(listingMaintenanceOutcome(first).fingerprint).toBe(listingMaintenanceOutcome(second).fingerprint);
    second.rows[0].photo.issue = "local_asset_missing" as never;
    expect(listingMaintenanceOutcome(first).fingerprint).not.toBe(listingMaintenanceOutcome(second).fingerprint);
  });
});
