import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MANUAL_PLACE_STATUS_OVERRIDES } from "@/lib/place-status-overrides";
import { clientPlaceOperationalState, compactOperationalCorrection } from "@/lib/place-operational-policy";

const fixtures = vi.hoisted(() => {
  const base = { name: "Declared status fixture", category: "coffee", municipality: "frederick",
    geom: { lng: -77.41, lat: 39.414 }, is_operational: "operational" as const,
    hours: { mon: [{ open: "00:00", close: "24:00" }] }, hours_verified: true,
    hours_policy_strict: false, last_verified_at: "2026-10-01T12:00:00Z" };
  return [
    { ...base, slug: "dependent-status-fixture", operational_correction: { fallback_status: "closed_permanently", review_after: "2026-11-01" } },
    { ...base, slug: "independent-status-fixture", operational_correction: { fallback_status: "operational" } },
    { ...base, slug: "legacy-status-fixture" },
    { ...base, slug: "safety-closure-fixture" },
  ];
});
vi.mock("@/data/places-client.json", () => ({ default: fixtures }));
import { clientPlaceBySlug, clientPlaces, clientPlacesWithinRadius } from "./places-client";
const BEFORE = new Date("2026-11-02T04:59:59Z");
const AFTER = new Date("2026-11-02T05:00:00Z");
beforeEach(() => {
  for (const { slug } of fixtures) {
    MANUAL_PLACE_STATUS_OVERRIDES[slug] = {
      status: slug === "safety-closure-fixture" ? "closed_temporarily" : "operational",
      effective_at: "2026-10-01", review_after: "2026-11-01",
      source: "https://example.com/declared-status-fixture", note: "Declared test evidence.",
    };
  }
});
afterEach(() => { for (const { slug } of fixtures) delete MANUAL_PLACE_STATUS_OVERRIDES[slug]; });

describe("client operational-correction expiry", () => {
  it("rechecks the inclusive Eastern review day on every discovery and radius read", () => {
    expect(clientPlaces(BEFORE).some(p => p.slug === fixtures[0].slug)).toBe(true);
    expect(clientPlaces(AFTER).some(p => p.slug === fixtures[0].slug)).toBe(false);
    const distances = new Map(fixtures.map(p => [p.slug, 10]));
    expect(clientPlacesWithinRadius(fixtures[0].geom, 500, distances, BEFORE).some(p => p.slug === fixtures[0].slug)).toBe(true);
    expect(clientPlacesWithinRadius(fixtures[0].geom, 500, distances, AFTER).map(p => p.slug)).toEqual([fixtures[1].slug]);
  });
  it("retains saved/detail identity as unknown without asserting a new closure or fresh hours", () => {
    const row = clientPlaceBySlug(fixtures[0].slug, AFTER);
    expect(row).toMatchObject({ slug: fixtures[0].slug, is_operational: "needs_verification", hours_verified: false,
      open_status: { state: "unknown" }, last_verified_at: "2026-10-01T12:00:00Z" });
    expect(row?.hours).toBeUndefined();
  });
  it("does not expire an independently accepted operational base verdict", () => {
    expect(clientPlaceBySlug(fixtures[1].slug, AFTER)?.is_operational).toBe("operational");
    expect(clientPlaces(AFTER).some(p => p.slug === fixtures[1].slug)).toBe(true);
    expect(compactOperationalCorrection(fixtures[1].slug, "operational", BEFORE)).toEqual({ fallback_status: "operational" });
    expect(compactOperationalCorrection(fixtures[0].slug, "closed_permanently", BEFORE)).toEqual({
      fallback_status: "closed_permanently", review_after: "2026-11-01",
    });
  });
  it("fails conservatively for legacy dependent rows without compact fallback metadata", () => {
    expect(clientPlaces(BEFORE).some(p => p.slug === fixtures[2].slug)).toBe(true);
    expect(clientPlaces(AFTER).some(p => p.slug === fixtures[2].slug)).toBe(false);
    expect(clientPlaceBySlug(fixtures[2].slug, AFTER)?.is_operational).toBe("needs_verification");
  });
  it("keeps a safety closure active after its review deadline", () => {
    expect(clientPlaces(BEFORE).some(p => p.slug === fixtures[3].slug)).toBe(false);
    expect(clientPlaces(AFTER).some(p => p.slug === fixtures[3].slug)).toBe(false);
    expect(clientPlaceBySlug(fixtures[3].slug, AFTER)?.is_operational).toBe("closed_temporarily");
  });
  it.each([
    null,
    { fallback_status: "closed_permanently" },
    { fallback_status: "closed_permanently", review_after: "2026-02-30" },
    { fallback_status: "maybe_open", review_after: "2026-11-01" },
  ])("does not publish an expired correction with malformed metadata: %j", operational_correction => {
    const row = { ...fixtures[0], operational_correction } as unknown as Parameters<typeof clientPlaceOperationalState>[0];
    expect(clientPlaceOperationalState(row, AFTER)).toEqual({ status: "needs_verification", discoverable: false, mayAssertHours: false });
  });
  it("keeps accepted unknown base status discoverable without asserting hours", () => {
    const row = { ...fixtures[0], operational_correction: { fallback_status: "needs_verification" as const, review_after: "2026-11-01" } };
    expect(clientPlaceOperationalState(row, AFTER)).toEqual({ status: "needs_verification", discoverable: true, mayAssertHours: false });
  });
});
