import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FCPL_BRANCHES, FCPL_HOURS_URL, FCPL_CLOSURES_URL, officialHoursForPlace, validateOfficialHoursArtifact } from "./official-hours";
import { parseFcplOfficialHours } from "../../scripts/lib/fcpl-official-hours";
import { formatFullHours, formatHoursLine, getOpenStatus, hoursForDate, shouldDimForHours } from "./hours";
import { openingHoursJsonLd, specialOpeningHoursJsonLd } from "./seo/jsonld";
import { planOpenStateForWindow } from "./integrations/planner";
import { mayPublishVisitabilityHours } from "./hours-visitability";
import type { Hours } from "@/data/places";

const NOW = new Date("2026-10-12T16:00:00Z");
const weekly = { url: FCPL_HOURS_URL, html: readFileSync("tests/fixtures/fcpl-hours-index.html", "utf8"), observedAt: "2026-10-12T09:13:00.000Z" };
const closures = { url: FCPL_CLOSURES_URL, html: readFileSync("tests/fixtures/fcpl-holiday-closings.html", "utf8"), observedAt: "2026-10-12T09:18:00.000Z" };
const artifact = parseFcplOfficialHours(weekly, closures, NOW);
function place(slug: string = FCPL_BRANCHES[1][0]) {
  const row = artifact.places.find((p) => p.slug === slug)!;
  return { slug, category: "library", website: row.source_url };
}
function hoursAt(at = NOW): Hours {
  const observed = new Date(at.getTime() - 60_000).toISOString();
  const result = structuredClone(artifact);
  result.weekly.observed_at = result.closures.observed_at = observed;
  result.expires_at = new Date(Date.parse(observed) + 7 * 86_400_000).toISOString();
  return officialHoursForPlace(place(), result, at).hours!;
}
afterEach(() => vi.unstubAllEnvs());

describe("official library hours and dated closure precedence", () => {
  it.each(FCPL_BRANCHES)("closes %s for the actual October 12 staff day and restores its own Tuesday schedule", (slug) => {
    const hours = officialHoursForPlace(place(slug), artifact, NOW).hours!;
    expect(getOpenStatus(hours, { verified: true }, NOW)).toMatchObject({ state: "closed", opensAt: "10:00", opensDay: "tue" });
    const normal = new Date("2026-10-13T16:00:00Z");
    expect(getOpenStatus(hours, { verified: true }, normal).state).toBe("open");
    expect(hoursForDate(hours, NOW)).toEqual([]);
    expect(formatFullHours(hours).find((row) => row.day === "mon")!.windows.length).toBe(1);
    const row = artifact.places.find((p) => p.slug === slug)!;
    expect(getOpenStatus(hours, { verified: true }, normal)).toMatchObject({ closesAt: row.hours.tue![0].close });
  });
  it("clips an actual early closing at 5 pm without changing the normal Wednesday table", () => {
    const at = new Date("2026-11-25T21:30:00Z");
    const hours = hoursAt(at);
    expect(getOpenStatus(hours, { verified: true }, at)).toEqual({ state: "closing-soon", closesAt: "17:00" });
    expect(hoursForDate(hours, at)).toEqual([{ open: "10:00", close: "17:00" }]);
    expect(hours.wed).toEqual([{ open: "10:00", close: "21:00" }]);
    expect(formatHoursLine(getOpenStatus(hours, { verified: true }, new Date("2026-11-25T22:00:00Z")))).toBe("Closed · Opens Sat 10am");
    const p = { hours, hours_verified: true, hours_updated_at: hours._official!.observed_at };
    expect(planOpenStateForWindow(p, new Date("2026-11-25T21:30:00Z"), 30)).toBe("open");
    expect(planOpenStateForWindow(p, new Date("2026-11-25T21:30:00Z"), 31)).toBe("closed");
  });
  it("does not let last night's ordinary opening spill into a closed date", () => {
    const at = new Date("2026-10-12T05:00:00Z");
    const hours = hoursAt(at);
    hours.sun = [{ open: "18:00", close: "02:00" }];
    expect(getOpenStatus(hours, { verified: true }, at).state).toBe("closed");
    expect(hoursForDate(hours, at)).toEqual([]);
  });
  it("an early closure prevents that date's overnight spill into tomorrow", () => {
    const at = new Date("2026-11-25T16:00:00Z");
    const hours = hoursAt(at);
    hours.wed = [{ open: "10:00", close: "02:00" }];
    hours._official!.exceptions = [{ date: "2026-11-25", reason: "Early closing", closes_at: "17:00" }];
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-11-26T06:00:00Z")).state).toBe("closed");
  });
  it("preserves independent closed weekdays and never invents an early-close opening", () => {
    const point = officialHoursForPlace(place(FCPL_BRANCHES[2][0]), artifact, NOW).hours!;
    expect(getOpenStatus(point, { verified: true }, new Date("2026-10-14T16:00:00Z"))).toMatchObject({ state: "closed", opensAt: "15:00", opensToday: true });
    const at = new Date("2026-11-25T17:00:00Z");
    const hours = hoursAt(at); hours.wed = [];
    expect(hoursForDate(hours, at)).toEqual([]);
  });
  it("handles the year boundary and both sides of Eastern daylight saving", () => {
    const at = new Date("2026-12-31T21:30:00Z");
    const hours = hoursAt(at);
    expect(getOpenStatus(hours, { verified: true }, at)).toMatchObject({ state: "closing-soon", closesAt: "17:00" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2027-01-01T17:00:00Z"))).toMatchObject({ state: "closed", opensDay: "sat" });
    for (const [instant, state] of [["2026-11-01T17:30:00Z", "closed"], ["2026-11-01T18:00:00Z", "open"], ["2027-03-14T16:30:00Z", "closed"], ["2027-03-14T17:00:00Z", "open"]] as const) {
      const moment = new Date(instant);
      expect(getOpenStatus(hoursAt(moment), { verified: true }, moment).state).toBe(state);
    }
  });
  it("expires during a long-lived session and at a future visit horizon even with provider rollback", () => {
    const hours = officialHoursForPlace(place(), artifact, NOW).hours!;
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "0");
    const expired = new Date("2026-10-19T09:13:00.001Z");
    expect(getOpenStatus(hours, { verified: true }, expired).state).toBe("unknown");
    expect(hoursForDate(hours, expired)).toBeUndefined();
    expect(planOpenStateForWindow({ hours, hours_verified: true, hours_updated_at: hours._official!.observed_at }, expired, 30)).toBe("unknown");
    expect(officialHoursForPlace(place(), artifact, expired)).toEqual({ enrolled: true });
  });
  it("never labels a next opening beyond the evidence expiry or uncovered holiday year", () => {
    const hours = hoursAt(new Date("2026-12-31T23:00:00Z"));
    hours._official!.coverage_through = "2026-12-31";
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-12-31T23:00:00Z"))).toEqual({ state: "closed" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2027-01-01T17:00:00Z"))).toEqual({ state: "unknown" });
  });
  it("rejects future observations, mismatched identities and malformed expiry without provider fallback", () => {
    const future = structuredClone(artifact);
    future.weekly.observed_at = future.closures.observed_at = "2026-10-13T09:00:00.000Z";
    future.expires_at = "2026-10-20T09:00:00.000Z";
    expect(officialHoursForPlace(place(), future, NOW)).toEqual({ enrolled: true });
    expect(officialHoursForPlace({ ...place(), website: "https://example.org/" }, artifact, NOW)).toEqual({ enrolled: true });
    expect(officialHoursForPlace({ ...place(), category: "market" }, artifact, NOW)).toEqual({ enrolled: true });
    expect(officialHoursForPlace({ ...place(), slug: "urbana-library-farmers-market-new-market" }, artifact, NOW)).toEqual({ enrolled: false });
    const invalid = structuredClone(artifact); invalid.expires_at = "2027-01-01T00:00:00Z";
    expect(() => validateOfficialHoursArtifact(invalid)).toThrow(/seven-day/);
  });
  it("keeps the extended-hours public-visitability guard when schedule metadata exists", () => {
    const hours = officialHoursForPlace(place(), artifact, NOW).hours!;
    hours.mon = [{ open: "00:00", close: "24:00" }];
    expect(mayPublishVisitabilityHours(place().slug, hours, NOW)).toBe(false);
  });
  it("the map dims a fresh dated closure but leaves unknown/unverified/expired hours bright", () => {
    const hours = officialHoursForPlace(place(), artifact, NOW).hours!;
    expect(shouldDimForHours(getOpenStatus(hours, { verified: true }, NOW))).toBe(true);
    expect(shouldDimForHours(getOpenStatus(hours, { verified: true }, new Date("2026-10-20T16:00:00Z")))).toBe(false);
    expect(shouldDimForHours(getOpenStatus(hours, { verified: false }, NOW))).toBe(false);
    expect(shouldDimForHours(getOpenStatus(undefined, { verified: true }, NOW))).toBe(false);
  });

  it("publishes dated structured exceptions without claiming normal hours past closure coverage", () => {
    const today = officialHoursForPlace(place(), artifact, NOW).hours!;
    expect(specialOpeningHoursJsonLd(today)).toContainEqual({ "@type": "OpeningHoursSpecification", validFrom: "2026-10-12", validThrough: "2026-10-12", opens: "00:00", closes: "00:00" });
    const early = hoursAt(new Date("2026-11-25T16:00:00Z"));
    expect(specialOpeningHoursJsonLd(early)).toContainEqual({ "@type": "OpeningHoursSpecification", validFrom: "2026-11-25", validThrough: "2026-11-25", opens: "10:00", closes: "17:00" });
    early._official!.coverage_through = "2026-11-25";
    expect(openingHoursJsonLd(early)?.every((row) => row.validThrough === "2026-11-25")).toBe(true);
  });

});
