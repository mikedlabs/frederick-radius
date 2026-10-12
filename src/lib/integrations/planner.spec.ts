import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREDERICK_CENTER } from "@/lib/geo";
import * as placesClient from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Event } from "@/data/events";
import {
  buildPlan,
  decodeSpec,
  planOpenStateForWindow,
  reconstructPlan,
  eventPlanSpec,
  addStopToSpec,
  setStopInSpec,
  type PlanInputs,
  type PlanSpec,
} from "@/lib/integrations/planner";

describe("buildPlan", () => {
  it("keeps an hours-unconfirmed food draft out of daytime errand categories", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 3,
      start_at: "2026-07-16T22:00:00.000Z",
      start_near: FREDERICK_CENTER,
      max_distance_m: 2_400,
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("market");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("coffee");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("bakery");
  });

  it("applies date quality and category floors to a general draft", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "easy",
      duration_hours: 3,
      start_at: "2026-07-23T03:54:00.000Z",
      start_near: FREDERICK_CENTER,
      municipality: "frederick",
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(
      plan.stops.every(
        (stop) =>
          !["shopping", "market", "park", "coffee", "bakery"].includes(
            stop.place?.category ?? "",
          ),
      ),
    ).toBe(true);
    expect(
      plan.stops.every((stop) => {
        const rating = (stop.place as (typeof stop.place & { google_rating?: number }))?.google_rating;
        return rating == null || rating >= 4;
      }),
    ).toBe(true);
  });

  it("returns no late-night stops when fresh schedules cannot prove them open", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "easy",
      duration_hours: 3,
      // 4:30 AM Eastern, and the date must postdate the newest
      // hours_updated_at in the snapshot: a start before the data's own
      // timestamps makes every schedule unverifiable, and the planner then
      // falls back to rating listings instead of exercising the
      // provably-closed refusal this fixture is about.
      start_at: "2026-08-08T08:30:00.000Z",
      start_near: FREDERICK_CENTER,
      municipality: "frederick",
    });

    expect(plan.stops).toEqual([]);
  });

  it("keeps every stop inside a deliberately selected town", () => {
    const plan = buildPlan({
      audience: "family",
      vibe: "easy",
      duration_hours: 3,
      start_at: "2026-07-17T14:00:00.000Z",
      start_near: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      // This test isolates the hard municipality boundary. Hours freshness
      // has its own coverage below and should not make the town fixture empty
      // as verified schedules age.
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(
      plan.stops.every(
        (stop) =>
          stop.place?.municipality === "urbana" ||
          stop.event?.municipality === "urbana",
      ),
    ).toBe(true);
  });

  it("keeps a general draft inside the time budget without a known-closed stop", () => {
    const start = new Date("2026-07-17T22:00:00.000Z");
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 4,
      start_at: start.toISOString(),
      municipality: "frederick",
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(plan.stops.every((stop) => stop.open !== "closed")).toBe(true);
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("shopping");
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("playground");

    const last = plan.stops[plan.stops.length - 1];
    const end = new Date(last.at).getTime() + last.duration_min * 60_000;
    expect(end - start.getTime()).toBeLessThanOrEqual(4 * 60 * 60_000);
  });

  it("keeps an unconfirmed schedule visibly unknown", () => {
    expect(
      planOpenStateForWindow(
        { hours: undefined, hours_verified: false },
        new Date("2026-07-17T22:00:00.000Z"),
        80,
      ),
    ).toBe("unknown");
  });

  it("does not use stale hours for a dated plan", () => {
    // Keep this independent of the rolling production artifact. Advancing the
    // clock well beyond every shipped verification timestamp creates the stale
    // condition the test is meant to exercise even after a fresh data pull.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-07-17T22:00:00.000Z"));
    try {
      const plan = buildPlan({
        audience: "date",
        vibe: "food",
        duration_hours: 4,
        start_at: "2035-07-17T22:00:00.000Z",
        municipality: "frederick",
        require_verified_hours: true,
      });

      expect(plan.stops).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes the start time but removes exact coordinates from share links", () => {
    const plan = buildPlan({
      audience: "solo",
      vibe: "easy",
      duration_hours: 2,
      start_near: { lng: -77.412345, lat: 39.412345 },
    });
    const shared = decodeSpec(plan.share);

    expect(shared?.i.start_at).toBeTruthy();
    expect(shared?.i.start_near).toBeUndefined();
  });

  it("rejects malformed shared plans instead of passing them to reconstruction", () => {
    const token = Buffer.from(JSON.stringify({ v: 1, s: [{ p: "missing-inputs" }] }))
      .toString("base64url");
    expect(decodeSpec(token)).toBeNull();
  });
});


const visitStart = new Date("2026-10-12T17:00:00.000Z");
const verifiedHours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [{ open: "10:00", close: "22:00" }]]));
function savedPlace(slug: string, overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug, name: slug, category: "museum", short_blurb: "A recorded local destination.",
    address: "24 W Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick",
    geom: FREDERICK_CENTER, feature_score: 5, source: "manual", is_verified: true, is_operational: "operational",
    updated_at: visitStart.toISOString(), hours_updated_at: visitStart.toISOString(),
    hours_verified: true, hours: verifiedHours, open_status: { state: "open" },
    ...overrides,
  } as PlaceCardData;
}
function savedSpec(slugs: string[], overrides: Partial<PlanInputs> = {}): PlanSpec {
  return { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 6, start_at: visitStart.toISOString(), municipality: "frederick", ...overrides }, s: slugs.map((p) => ({ p })) };
}

describe("reopened and edited plan constraints", () => {
  let places: PlaceCardData[];
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(visitStart);
    places = [];
    vi.spyOn(placesClient, "clientPlaces").mockImplementation(() => places);
    vi.spyOn(placesClient, "clientPlaceBySlug").mockImplementation((slug) => places.find((place) => place.slug === slug));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each([
    ["free budget", { budget: "free" }, {}, "not recorded as free"],
    ["value budget", { budget: "value" }, { price_band: 4 }, "price range"],
    ["wheelchair barrier", { require_wheelchair_access: true }, { accessibility: { wheelchair: false } }, "wheelchair barrier"],
    ["local businesses", { local_only: true }, { name: "Starbucks" }, "local-business preference"],
    ["selected town", { municipality: "brunswick" }, {}, "selected town"],
    ["distance", { max_distance_m: 500 }, { geom: { lng: -77.5, lat: 39.414 } }, "selected distance"],
    ["outing category", {}, { category: "church" }, "outing style"],
  ] as Array<[string, Partial<PlanInputs>, Partial<PlaceCardData>, string]>)("holds a saved choice outside the %s constraint without losing its reference", (_, inputs, placeOverride, reason) => {
    places = [savedPlace("saved-choice", placeOverride)];
    const original = savedSpec(["saved-choice"], inputs);
    const plan = reconstructPlan(original)!;
    expect(plan.stops).toEqual([]);
    expect(plan.unscheduled).toHaveLength(1);
    expect(plan.unscheduled![0]).toMatchObject({ place: { slug: "saved-choice" }, spec_index: 0 });
    expect(plan.unscheduled![0].why).toContain(reason);
    expect(decodeSpec(plan.share)?.s).toEqual(original.s);
    expect(decodeSpec(plan.share)?.i).toMatchObject(inputs);
  });

  it("lets unknown access and unknown prices remain visibly qualified", () => {
    places = [savedPlace("unconfirmed-access")];
    const plan = reconstructPlan(savedSpec(["unconfirmed-access"], { require_wheelchair_access: true, budget: "value" }))!;
    expect(plan.stops[0].place?.slug).toBe("unconfirmed-access");
    expect(plan.unscheduled).toBeUndefined();
  });

  it("holds excess choices at their original indexes after the stop limit", () => {
    places = [savedPlace("first"), savedPlace("second")];
    const original = savedSpec(["first", "second"], { max_stops: 1 });
    const plan = reconstructPlan(original)!;
    expect(plan.stops.map((stop) => stop.spec_index)).toEqual([0]);
    expect(plan.unscheduled![0]).toMatchObject({ spec_index: 1, place: { slug: "second" } });
    expect(plan.unscheduled![0].why).toContain("stop limit");
    expect(decodeSpec(plan.share)?.s).toEqual(original.s);
  });

  it("holds a visit that exceeds the time window after real travel", () => {
    places = [savedPlace("first", { category: "restaurant" }), savedPlace("second", { category: "restaurant" })];
    const original = savedSpec(["first", "second"], { duration_hours: 2 });
    const plan = reconstructPlan(original)!;
    expect(plan.stops).toHaveLength(1);
    expect(plan.unscheduled![0].spec_index).toBe(1);
    expect(plan.unscheduled![0].why).toContain("selected time window");
    expect(decodeSpec(plan.share)?.s).toEqual(original.s);
  });

  it("checks schedule freshness at the future visit rather than the page-read clock", () => {
    places = [savedPlace("fresh-today")];
    const future = "2026-10-20T17:00:00.000Z";
    expect(planOpenStateForWindow(places[0], visitStart, 75)).toBe("open");
    expect(planOpenStateForWindow(places[0], new Date(future), 75)).toBe("unknown");
    const plan = reconstructPlan(savedSpec(["fresh-today"], { start_at: future, require_verified_hours: true }))!;
    expect(plan.stops).toEqual([]);
    expect(plan.unscheduled![0].why).toContain("verified hours");
    expect(buildPlan({ audience: "friends", vibe: "easy", duration_hours: 2, start_at: future, require_verified_hours: true }).stops).toEqual([]);
  });

  it("requires freshness through the end of the visit", () => {
    const at = new Date("2026-10-19T16:30:00Z");
    places = [savedPlace("expires-during-visit")];
    expect(planOpenStateForWindow(places[0], at, 75)).toBe("unknown");
    expect(reconstructPlan(savedSpec(["expires-during-visit"], { start_at: at.toISOString(), require_verified_hours: true }))?.stops).toEqual([]);
  });

  it("keeps a general draft's hours unknown without claiming its schedule covers the visit", () => {
    places = [savedPlace("fresh-today")];
    const plan = reconstructPlan(savedSpec(["fresh-today"], { start_at: "2026-10-20T17:00:00Z", require_verified_hours: false }))!;
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].open).toBe("unknown");
    expect(plan.stops[0].why).not.toContain("posted hours cover");
  });

  it("checks the actual closing boundary and allows a shorter visit before closing", () => {
    const place = savedPlace("closing-soon", { hours: { mon: [{ open: "09:00", close: "13:45" }] } });
    expect(planOpenStateForWindow(place, visitStart, 40)).toBe("open");
    expect(planOpenStateForWindow(place, visitStart, 45)).toBe("open");
    expect(planOpenStateForWindow(place, visitStart, 48)).toBe("closed");
  });

  it("does not call a visit confirmed when it spans separate opening windows", () => {
    const place = savedPlace("midday-break", { hours: { mon: [{ open: "09:00", close: "13:30" }, { open: "14:00", close: "18:00" }] } });
    expect(planOpenStateForWindow(place, visitStart, 75)).toBe("unknown");
  });

  it("holds a known-closed saved choice rather than silently dropping it", () => {
    places = [savedPlace("closed-at-visit", { hours: { mon: [{ open: "09:00", close: "12:00" }] } })];
    const original = savedSpec(["closed-at-visit"]);
    const plan = reconstructPlan(original)!;
    expect(plan.stops).toEqual([]);
    expect(plan.unscheduled![0].why).toContain("hours do not cover");
    expect(decodeSpec(plan.share)?.s).toEqual(original.s);
  });

  it("preserves unavailable references and later edit indexes", () => {
    places = [savedPlace("still-open")];
    const plan = reconstructPlan(savedSpec(["missing-place", "still-open"]))!;
    expect(plan.notices?.[0].spec_index).toBe(0);
    expect(plan.stops[0].spec_index).toBe(1);
    expect(decodeSpec(plan.share)?.s).toEqual([{ p: "missing-place" }, { p: "still-open" }]);
  });

  it("enforces constraints when an incompatible Saved place is added or selected", () => {
    places = [savedPlace("free", { tags: ["free"] }), savedPlace("paid", { price_band: 3 })];
    const original = savedSpec(["free"], { budget: "free" });
    const added = reconstructPlan(addStopToSpec(original, "paid"))!;
    const selected = reconstructPlan(setStopInSpec(original, 0, "paid"))!;
    expect(added.stops.map((stop) => stop.place?.slug)).toEqual(["free"]);
    expect(added.unscheduled?.[0]).toMatchObject({ spec_index: 1, place: { slug: "paid" } });
    expect(selected.stops).toEqual([]);
    expect(selected.unscheduled?.[0]).toMatchObject({ spec_index: 0, place: { slug: "paid" } });
  });

  it("keeps stricter stop, distance and hours choices when planning around an event", () => {
    const event = { slug: "afternoon-event", title: "Afternoon event", starts_at: visitStart.toISOString(), ends_at: "2026-10-12T18:00:00Z", geom: FREDERICK_CENTER, municipality: "frederick", category: "arts" } as Event;
    places = [savedPlace("nearby", { hours: undefined, hours_verified: false })];
    const seeded = eventPlanSpec(event, savedSpec([], { max_stops: 1, max_distance_m: 500, require_verified_hours: true }).i);
    expect(seeded.i).toMatchObject({ max_stops: 1, max_distance_m: 500, require_verified_hours: true });
    expect(seeded.s).toEqual([{ e: event.slug }]);
    const stricter = { ...seeded, s: [{ e: event.slug }, { p: "nearby" }] };
    const plan = reconstructPlan(stricter, { [event.slug]: { event } })!;
    expect(plan.stops).toHaveLength(1);
    expect(plan.unscheduled?.[0].why).toContain("stop limit");
    expect(decodeSpec(plan.share)?.s).toEqual(stricter.s);
  });

  it("uses the public first saved stop when a private origin was removed from sharing", () => {
    places = [savedPlace("thurmont-start", { municipality: "thurmont", geom: { lng: -77.411, lat: 39.623 } }), savedPlace("thurmont-next", { municipality: "thurmont", geom: { lng: -77.412, lat: 39.624 } })];
    const original = savedSpec(["thurmont-start", "thurmont-next"], { municipality: undefined, max_distance_m: 1_600 });
    const plan = reconstructPlan(original)!;
    expect(plan.stops.map((stop) => stop.place?.slug)).toEqual(["thurmont-start", "thurmont-next"]);
    expect(decodeSpec(plan.share)?.i.start_near).toBeUndefined();
    expect(decodeSpec(plan.share)?.i.municipality).toBeUndefined();
  });
});
