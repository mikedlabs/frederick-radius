import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fixed, synthetic evidence is independent of future catalog refreshes. It
// establishes ordinary hours only during the actual source coverage period.
vi.mock("@/data/places-client.json", () => ({
  default: [{
    slug: "clockwork-bistro-fixture",
    name: "Clockwork Bistro",
    category: "restaurant",
    city: "Frederick",
    short_blurb: "",
    municipality: "frederick",
    geom: { lng: -77.4105, lat: 39.4143 },
    tags: [],
    feature_score: 5,
    is_operational: "operational",
    hours_verified: true,
    hours_policy_strict: true,
    hours_updated_at: "2026-10-26T09:44:04.112Z",
    hours: {
      tue: [{ open: "07:00", close: "20:00" }],
      wed: [{ open: "07:00", close: "20:00" }],
      _official: {
        slug: "clockwork-bistro-fixture",
        kind: "merchant",
        schedule_kind: "weekly",
        source_name: "Clockwork Bistro",
        source_url: "https://example.invalid/",
        observed_at: "2026-10-26T09:44:04.112Z",
        expires_at: "2026-11-02T09:44:04.112Z",
        coverage_from: "2026-10-26",
        coverage_through: "2026-11-02",
        exceptions: [],
      },
    },
  }],
}));

import { clientPlaceBySlug, clientPlaces } from "@/lib/loaders/places-client";
import { FREDERICK_CENTER } from "@/lib/geo";
import { qualifiedSearch, search } from "./search";
import { ASK_EVAL_CASES } from "@/lib/ask/evaluation";
import { runAskEvaluation } from "@/lib/ask/evaluation-runner";

const slug = "clockwork-bistro-fixture";
const during = new Date("2026-10-27T14:35:00.000Z");
const closed = new Date("2026-10-28T01:30:00.000Z");
const beforeObservation = new Date("2026-10-25T14:35:00.000Z");
const afterExpiry = new Date("2026-11-02T09:44:04.112Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-01-01T05:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("search place clocks", () => {
  it("keeps source observation and expiry tied to the requested instant", () => {
    expect(clientPlaces(during)[0]).toMatchObject({ hours_verified: true, open_status: { state: "open" } });
    expect(clientPlaces(closed)[0]).toMatchObject({ hours_verified: true, open_status: { state: "closed" } });
    for (const instant of [beforeObservation, afterExpiry]) {
      expect(clientPlaces(instant)[0]).toMatchObject({ hours_verified: false, open_status: { state: "unknown" } });
      expect(clientPlaces(instant)[0].hours).toBeUndefined();
    }
    // Existing callers without a clock continue to use the real wall clock.
    expect(clientPlaces()[0].open_status.state).toBe("unknown");
    expect(clientPlaceBySlug(slug)?.open_status.state).toBe("unknown");
  });

  it("uses the supplied instant for direct search and preserves an explicit pool", () => {
    const findPlace = (hits: ReturnType<typeof search>) => hits.find((hit) => hit.type === "place" && hit.place.slug === slug);
    expect(findPlace(search("Clockwork Bistro", 10, [], { now: during }))).toMatchObject({
      place: { hours_verified: true, open_status: { state: "open" } },
    });
    expect(findPlace(search("Clockwork Bistro", 10, [], { now: beforeObservation }))).toMatchObject({
      place: { hours_verified: false, open_status: { state: "unknown" } },
    });
    const supplied = { ...clientPlaces(during)[0], open_status: { state: "closed" as const } };
    expect(findPlace(search("Clockwork Bistro", 10, [], { now: during, placePool: [supplied] }))).toMatchObject({
      place: { open_status: { state: "closed" } },
    });
  });

  it("filters open-now results using the supplied clock rather than the wall clock", () => {
    const query = "restaurants open now near me";
    const placesAt = (now?: Date) => qualifiedSearch(query, 10, [], { origin: FREDERICK_CENTER, now }).hits
      .filter((hit) => hit.type === "place");
    expect(placesAt(during)).toMatchObject([{ place: { slug, open_status: { state: "open" } } }]);
    for (const instant of [closed, beforeObservation, afterExpiry]) expect(placesAt(instant)).toEqual([]);
    expect(placesAt()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the historical Ask fixture independent of today's wall clock", () => {
    const test = ASK_EVAL_CASES.find((item) => item.name === "restaurant open")!;
    const first = runAskEvaluation([test]);
    vi.setSystemTime(new Date("2026-10-27T14:35:00.000Z"));
    expect(runAskEvaluation([test])).toEqual(first);
    expect(first[0].failures).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
