import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import MERCHANT from "@/data/places-merchant-hours.json";
import OFFICIAL from "@/data/places-official-hours.json";
import CLIENT from "@/data/places-client.json";
import { merchantHoursForPlace } from "@/lib/merchant-hours";
import { officialHoursForPlace } from "@/lib/official-hours";
import type { PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import {
  buildListingMaintenanceReport, renderListingMaintenanceMarkdown,
  HOURS_STATES, PHOTO_STATES, type MaintenanceInput, type MaintenancePlace,
} from "../scripts/lib/listing-maintenance";
import { parseMaintenanceArguments, runListingMaintenanceReport } from "../scripts/listing-maintenance-report";

const AS_OF = new Date("2026-10-20T12:00:00.000Z");
const SHA = "a".repeat(40);
const VERSION = `sha256:${"b".repeat(64)}`;
const WEEK = { mon: [{ open: "09:00", close: "17:00" }] };
const base = (patch: Partial<MaintenancePlace> = {}): MaintenancePlace => ({
  slug: "declared-coffee", name: "Declared Coffee", category: "coffee", municipality: "frederick", ...patch,
});
const report = (place: MaintenancePlace, patch: Partial<MaintenanceInput> = {}) => buildListingMaintenanceReport({
  places: [place], asOf: AS_OF, gitSha: SHA, dataVersion: VERSION, ...patch,
});
const firstHours = (place: MaintenancePlace, patch: Partial<MaintenanceInput> = {}) => report(place, patch).rows[0].hours;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("listing maintenance hours truth", () => {
  it("counts only actual publishable current hours, independent of emergency policy rollback", () => {
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "0");
    expect(firstHours(base({ hours: WEEK, hours_verified: true, hours_updated_at: "2026-10-19T12:00:00Z" })).state).toBe("current");
    expect(firstHours(base({ hours: WEEK, hours_verified: true, hours_updated_at: "2026-08-19T12:00:00Z" })).state).toBe("stale");
    vi.unstubAllEnvs();
  });
  it.each([undefined, "not-a-date", "2026-10-21T12:00:00Z"])("rejects missing, invalid or future schedule observation %s", (hours_updated_at) => {
    expect(firstHours(base({ hours: WEEK, hours_verified: true, hours_updated_at })).state).toBe("needs_review");
  });
  it("distinguishes withheld historical schedules from unknown or unverified schedules", () => {
    const p = base();
    expect(firstHours(p).state).toBe("unknown");
    expect(firstHours(p, { hoursInventory: { [p.slug]: { hasSchedule: true, observedAt: "2026-08-19T12:00:00Z", identityAccepted: true } } })).toMatchObject({ state: "stale", reason: "historical_schedule_withheld" });
    expect(firstHours(p, { hoursInventory: { [p.slug]: { hasSchedule: true } } })).toMatchObject({ state: "unknown", reason: "stored_schedule_without_current_publication" });
    expect(firstHours(base({ hours: WEEK, hours_updated_at: "2026-10-19T12:00:00Z" })).state).toBe("unknown");
  });
  it("does not use a rejected provider identity as historical hours", () => {
    const p = base();
    expect(firstHours(p, { hoursInventory: { [p.slug]: { hasSchedule: true, observedAt: "2026-08-19T12:00:00Z", identityAccepted: false } } })).toMatchObject({ state: "needs_review", reason: "historical_identity_rejected" });
  });
  it("does not infer not-applicable hours from a park category", () => {
    const p = base({ category: "park" });
    expect(firstHours(p)).toMatchObject({ state: "unknown", applicability: "unknown" });
    const reviewed = report(p, { hoursNotApplicable: { [p.slug]: { reason: "Reviewed path, no opening schedule applies." } } });
    expect(reviewed.rows[0].hours).toMatchObject({ state: "unknown", applicability: "not_applicable" });
    expect(reviewed.summary.hours).toEqual({ current: 0, stale: 0, needs_review: 0, unknown: 1 });
    expect(reviewed.summary.hours_not_applicable_reviewed).toBe(1);
    expect(reviewed.candidate_queue).toEqual([]);
  });
  it("requires coherent schedule identity and a real schedule behind verification flags", () => {
    expect(firstHours(base({ hours_verified: true })).reason).toBe("verified_flag_without_schedule");
    const wrong = { ...WEEK, _official: { slug: "wrong", source_url: "https://declaredcoffee.com/", observed_at: "2026-10-19T12:00:00Z", expires_at: "2026-10-26T12:00:00Z", coverage_from: "2026-10-19", coverage_through: "2026-10-26", exceptions: [] } };
    expect(firstHours(base({ hours: wrong, hours_verified: true, hours_updated_at: wrong._official.observed_at })).reason).toBe("schedule_identity_mismatch");
  });
  it("retains the merchant source horizon rather than extending a dated week", () => {
    const raw = MERCHANT.places.find((p) => p.slug === "brewers-alley-frederick")!;
    const p = base({ slug: raw.slug, name: "Brewer's Alley", category: "restaurant", website: raw.source_url });
    const approved = merchantHoursForPlace(p, MERCHANT, AS_OF);
    const shipped = { ...p, hours: approved.hours, hours_verified: true, hours_updated_at: approved.observedAt };
    expect(firstHours(shipped, { merchantHours: MERCHANT })).toMatchObject({ state: "current", expires_at: "2026-10-26T04:00:00.000Z", source_url: raw.source_url });
    expect(firstHours(shipped, { merchantHours: MERCHANT, asOf: new Date(raw.expires_at) })).toMatchObject({ state: "stale", reason: "first_party_evidence_expired" });
    expect(firstHours(shipped, { merchantHours: MERCHANT, asOf: new Date("2026-10-25T12:00:00Z") }).expiring_within_48h).toBe(true);
  });
  it.each(["source_unavailable", "unparseable_or_conflicted", "changed_facts", "pending_acceptance"])("keeps merchant %s as a hold even while approved old evidence is young", (reason) => {
    const raw = MERCHANT.places[0];
    const p = base({ slug: raw.slug, name: raw.source_name, category: "restaurant", website: raw.source_url, hours: raw.hours, hours_verified: true, hours_updated_at: raw.observed_at });
    const artifact = { ...MERCHANT, review: [{ slug: p.slug, checked_at: AS_OF.toISOString(), reason }] };
    expect(firstHours(p, { merchantHours: artifact })).toMatchObject({ state: "needs_review", reason: `merchant_${reason}`, observed_at: raw.observed_at });
  });
  it("does not let a mismatched historical provider row override current first-party proof", () => {
    const raw = MERCHANT.places[1];
    const p = base({ slug: raw.slug, name: raw.source_name, category: "coffee", website: raw.source_url });
    const approved = merchantHoursForPlace(p, MERCHANT, AS_OF);
    const shipped = { ...p, hours: approved.hours, hours_verified: true, hours_updated_at: approved.observedAt };
    expect(firstHours(shipped, { merchantHours: MERCHANT, hoursInventory: { [p.slug]: { hasSchedule: true, identityAccepted: false } } }).state).toBe("current");
    expect(firstHours({ ...shipped, hours: { ...shipped.hours, mon: [{ open: "01:00", close: "02:00" }] } }, { merchantHours: MERCHANT })).toMatchObject({ state: "needs_review", reason: "first_party_snapshot_evidence_mismatch" });
  });
  it("does not claim accepted source hours were published when the promoted client omits them", () => {
    const raw = MERCHANT.places[1];
    expect(firstHours(base({ slug: raw.slug, name: raw.source_name, website: raw.source_url }), { merchantHours: MERCHANT })).toMatchObject({ state: "needs_review", reason: "source_current_not_in_promoted_snapshot" });
  });
  it("requires both library artifacts and suppresses expired or identity-mismatched library evidence", () => {
    const raw = OFFICIAL.places[0];
    const p = base({ slug: raw.slug, name: raw.source_name, category: "library", website: raw.source_url });
    const approved = officialHoursForPlace(p, OFFICIAL, AS_OF);
    const shipped = { ...p, hours: approved.hours, hours_verified: true, hours_updated_at: approved.observedAt };
    expect(firstHours(shipped, { officialHours: OFFICIAL }).state).toBe("current");
    expect(firstHours(shipped, { officialHours: { ...OFFICIAL, closures: {} } }).state).toBe("needs_review");
    expect(firstHours(shipped, { officialHours: OFFICIAL, asOf: new Date("2026-10-26T12:00:00Z") }).state).toBe("stale");
    expect(firstHours({ ...shipped, website: "https://different.org/" }, { officialHours: OFFICIAL }).state).toBe("needs_review");
  });
});

describe("photo eligibility and bounded source candidates", () => {
  it("uses the actual exact-owned resolver without claiming decoded image success", () => {
    const r = report(base({ slug: "carroll-creek-linear-park-frederick" }));
    expect(r.rows[0].photo).toMatchObject({ eligibility: "owned", availability: "not_checked", selected_src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg" });
    expect(r.scope.decoded_photos).toBe("not_checked");
    expect(r.scope.served_deployment).toBe("not_checked");
  });
  it("keeps eligible photo categories exhaustive, including no-plan and missing local bytes", () => {
    const curated = { file: "Declared.jpg", alt: "Declared", author: "Declared", license: "CC0", source_url: "https://commons.wikimedia.org/wiki/File:Declared.jpg", verified: true };
    const plans: PlaceCardPhotoPlan[] = [
      { key: "owned", sources: [{ kind: "owned", src: "/images/declared.jpg", alt: "Declared" }] },
      { key: "local", sources: [{ kind: "curated", src: "/history-photos/declared.jpg", alt: "Declared", photo: curated }] },
      { key: "remote", sources: [{ kind: "curated", src: "https://upload.wikimedia.org/declared.jpg", alt: "Declared", photo: curated }] },
      { key: "provider", sources: [{ kind: "google", src: "/api/place-photo?name=declared", alt: "", attribution: { photo_name: "declared", authors: [], google_maps_uri: "https://www.google.com/maps/photospot/declared" } }] },
      { key: "none", sources: [] },
    ];
    const r = buildListingMaintenanceReport({ places: plans.map((p) => base({ slug: p.key })), asOf: AS_OF, gitSha: SHA, dataVersion: VERSION,
      photoPlanFor: (p) => plans.find((plan) => plan.key === p.slug)!, localAssetExists: () => false });
    expect(r.summary.photos).toEqual(Object.fromEntries(PHOTO_STATES.map((s) => [s, 1])));
    expect(r.summary.local_photo_missing_bytes).toBe(2);
    expect(r.rows.every((p) => p.photo.availability === "not_checked")).toBe(true);
  });
  it("counts contact absence but never calls stored contact destinations live-verified", () => {
    const r = report(base({ website: "https://www.yelp.com/biz/declared", phone: " " }));
    expect(r.rows[0].contact).toEqual({ website: null, phone: null, missing: ["website", "phone"], verification: "not_checked" });
    expect(r.summary.missing_all_contact).toBe(1);
    expect(r.rows[0].source_candidate).toBeNull();
  });
  it("offers only policy-matched public primary-source candidates, without fetching or approving them", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const yes = report(base({ website: "https://declaredcoffee.com/" })).rows[0];
    expect(yes.source_candidate).toMatchObject({ url: "https://declaredcoffee.com/", kind: "business_website", status: "candidate_only", approval: "requires_identity_and_fact_review" });
    for (const website of ["http://declaredcoffee.com/", "https://unrelated-domain.com/", "https://127.0.0.1/", "https://declaredcoffee.local/", "https://user:pass@declaredcoffee.com/", "https://www.tripadvisor.com/declared"]) expect(report(base({ website })).rows[0].source_candidate).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("makes the queue bounded and deterministic, with review/stale before unknown", () => {
    const r = buildListingMaintenanceReport({ places: [base({ slug: "z", website: "https://declaredcoffee.com/" }), base({ slug: "a", website: "https://declaredcoffee.com/", hours: WEEK, hours_verified: true, hours_updated_at: "2026-08-19T12:00:00Z" })], asOf: AS_OF, gitSha: SHA, dataVersion: VERSION, candidateLimit: 1 });
    expect(r.candidate_queue.map((p) => p.slug)).toEqual(["a"]);
    expect(r.candidate_queue[0]).toMatchObject({ hours_state: "stale", status: "candidate_only" });
  });
});

describe("complete catalog and CLI contract", () => {
  it("rejects duplicate or missing listing IDs rather than silently deduplicating", () => {
    expect(() => buildListingMaintenanceReport({ places: [base(), base()], asOf: AS_OF, gitSha: SHA, dataVersion: VERSION })).toThrow("duplicate");
    expect(() => report(base({ slug: "" }))).toThrow("Missing");
  });
  it.each([
    { asOf: new Date("invalid") }, { gitSha: "main" }, { gitSha: "$(bad)" }, { dataVersion: "unversioned" }, { candidateLimit: 101 },
  ])("rejects invalid report provenance or an unbounded queue %j", (patch) => {
    expect(() => report(base(), patch)).toThrow();
  });
  it("reconciles every town/category and exclusive state count to the full input", () => {
    const places = [base({ slug: "a" }), base({ slug: "b", municipality: "brunswick", category: "park" }), base({ slug: "c", municipality: undefined, hours: WEEK, hours_verified: true, hours_updated_at: "2026-10-19T12:00:00Z" })];
    const r = buildListingMaintenanceReport({ places, asOf: AS_OF, gitSha: SHA, dataVersion: VERSION });
    expect(r.summary.listings).toBe(3);
    expect(Object.values(r.summary.hours).reduce((a, b) => a + b, 0)).toBe(3);
    expect(Object.values(r.summary.photos).reduce((a, b) => a + b, 0)).toBe(3);
    for (const groups of [r.by_town, r.by_category]) expect(Object.values(groups).reduce((n, x) => n + x.listings, 0)).toBe(3);
    expect(r.by_town.unknown.listings).toBe(1);
    expect(renderListingMaintenanceMarkdown(r)).toContain("eligible plans, not decoded");
    expect(buildListingMaintenanceReport({ places: [...places].reverse(), asOf: AS_OF, gitSha: SHA, dataVersion: VERSION })).toEqual(r);
  });
  it("rejects unsupported/duplicate CLI flags and unsafe supplied revision strings", () => {
    expect(parseMaintenanceArguments(["--git-sha", SHA, "--candidate-limit", "0"])).toEqual({ gitSha: SHA, candidateLimit: 0 });
    for (const args of [["--live"], ["--as-of", "2027-01-01"], ["--git-sha", "main"], ["--candidate-limit", "101"], ["--output-dir", "/tmp/a", "--output-dir", "/tmp/b"]]) expect(() => parseMaintenanceArguments(args)).toThrow();
  });
  it("writes exactly the real promoted public catalog offline with actual clock and input version", () => {
    const dir = mkdtempSync(join(tmpdir(), "radius-listing-maintenance-"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); vi.spyOn(console, "log").mockImplementation(() => {});
    const start = Date.now();
    try {
      const r = runListingMaintenanceReport(["--output-dir", dir, "--candidate-limit", "5"]);
      expect(r.rows.length).toBe(CLIENT.length);
      expect(new Set(r.rows.map((p) => p.slug)).size).toBe(CLIENT.length);
      expect(r.summary.listings).toBe(CLIENT.length);
      expect(r.git_sha).toMatch(/^[a-f0-9]{40}$/);
      expect(Date.parse(r.as_of)).toBeGreaterThanOrEqual(start);
      expect(Date.parse(r.as_of)).toBeLessThanOrEqual(Date.now());
      expect(HOURS_STATES.reduce((n, s) => n + r.summary.hours[s], 0)).toBe(CLIENT.length);
      expect(PHOTO_STATES.reduce((n, s) => n + r.summary.photos[s], 0)).toBe(CLIENT.length);
      expect(r.candidate_queue.length).toBeLessThanOrEqual(5);
      expect(JSON.parse(readFileSync(join(dir, "listing-maintenance.json"), "utf8"))).toEqual(r);
      expect(readFileSync(join(dir, "listing-maintenance.md"), "utf8")).toContain("All 1571");
      expect(fetch).not.toHaveBeenCalled();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
