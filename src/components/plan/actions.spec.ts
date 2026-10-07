import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({ archive: vi.fn(), weather: vi.fn(), places: [] as PlaceCardData[] }));
vi.mock("@/lib/events/event-identity", () => ({ archivedEventsBySlugs: mocks.archive }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaces: () => mocks.places, clientPlaceBySlug: (slug: string) => mocks.places.find((p) => p.slug === slug) }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: mocks.weather }));
import { decodeSpec, encodeSpec, type PlanSpec } from "@/lib/integrations/planner";
import { addStop, generatePlan, planFromToken, removeStop, reshufflePlan, setStop, stopAlternatives, stopSwapOptions, swapStop } from "./actions";
const now = new Date("2026-10-06T12:00:00-04:00");
const current = { slug: "runtime-concert", title: "Evening concert", description: "A public show.", starts_at: "2026-10-06T19:00:00-04:00", ends_at: "2026-10-06T22:00:00-04:00", timezone: "America/New_York", venue_name: "Weinberg Center", address: "20 W Patrick Street", geom: { lng: -77.4126, lat: 39.4142 }, municipality: "frederick", category: "music", audience: [], is_free: false, source: "manual", source_id: "42", source_url: "https://example.org/concert", license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), category_name: "Music", municipality_name: "Frederick", is_verified: true, placement: "venue", geo_confidence: "venue_match" } as EventWithMeta;
const spec = (): PlanSpec => ({ v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 6, start_at: current.starts_at, event_anchor_slug: current.slug }, s: [{ e: current.slug }] });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); mocks.places = []; mocks.weather.mockResolvedValue(null);
  mocks.archive.mockImplementation(async (slugs: string[]) => ({ matches: slugs.map((requestedSlug) => ({ requestedSlug, canonicalSlug: current.slug, event: current, tombstoned: false, id: "42", lastSeenAt: now.toISOString() })), unresolvedSlugs: [] }));
});
afterEach(() => vi.useRealTimers());
describe("event plan action identity", () => {
  it("uses current event evidence while each edit changes a real nearby place reference", async () => {
    const nearby = (slug: string): PlaceCardData => ({ slug, name: slug, category: "restaurant", address: "24 W Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick", geom: { lng: -77.4128, lat: 39.4142 }, source: "manual", feature_score: 5, short_blurb: "A local restaurant.", updated_at: now.toISOString(), is_verified: true, hours_verified: true, hours_updated_at: now.toISOString(), hours: { tue: [{ open: "10:00", close: "24:00" }] }, source_id: slug, source_url: null, license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), open_status: { state: "open" } } as PlaceCardData);
    mocks.places = [nearby("dinner"), nearby("another-dinner")];
    const original = { ...spec(), s: [{ e: current.slug }, { p: "dinner" }] };
    const token = encodeSpec(original);
    const generated = await generatePlan(spec().i);
    const reopened = await planFromToken(token);
    const swapped = await swapStop(token, 1);
    const selected = await setStop(token, 1, "another-dinner");
    const added = await addStop(encodeSpec(spec()), "dinner");
    const shuffled = await reshufflePlan(token, [], 1);
    expect(mocks.archive).toHaveBeenCalledTimes(6);
    for (const plan of [generated, reopened, swapped, selected, added, shuffled]) {
      expect(plan?.stops[0].event?.slug).toBe(current.slug);
      expect(plan?.stops[0].duration_min).toBe(180);
    }
    expect(reopened?.stops[1].place?.slug).toBe("dinner");
    expect(swapped?.stops[1].place?.slug).toBe("another-dinner");
    expect(selected?.stops[1].place?.slug).toBe("another-dinner");
    expect(decodeSpec(selected!.share)?.s[1]).toEqual({ p: "another-dinner" });
    expect(added?.stops[1].place?.slug).toBe("dinner");
    expect(decodeSpec(added!.share)?.s).toEqual(original.s);
    expect(decodeSpec(shuffled!.share)?.i.seed).toBe(1);
  });
  it("adds the existing bounded rain note to an event-anchored build", async () => {
    mocks.weather.mockResolvedValue({ hourly: [{ startTime: current.starts_at, probabilityOfPrecipitation: 70 }], daily: [] });
    const result = await generatePlan(spec().i);
    expect(result?.stops[0].event?.slug).toBe(current.slug);
    expect(result?.weather_note).toContain("70% chance");
    expect(mocks.weather).toHaveBeenCalledWith(current.geom);
  });
  it("reflects a cancellation on every subsequent edit and keeps the event reference", async () => {
    mocks.archive.mockImplementation(async (slugs: string[]) => ({ matches: slugs.map((requestedSlug) => ({ requestedSlug, canonicalSlug: current.slug, event: { ...current, status: "cancelled" }, tombstoned: false })), unresolvedSlugs: [] }));
    const token = encodeSpec(spec());
    for (const plan of await Promise.all([planFromToken(token), addStop(token, "cafe-nola"), swapStop(token, 0), setStop(token, 0, "cafe-nola"), reshufflePlan(token, [], 2)])) {
      expect(plan?.stops).toEqual([]); expect(plan?.notices?.[0].code).toBe("cancelled"); expect(decodeSpec(plan!.share)?.s[0]).toEqual({ e: current.slug });
    }
  });
  it("removes the original token slot while retaining an earlier unresolved event", async () => {
    mocks.archive.mockResolvedValue({ matches: [], unresolvedSlugs: [] });
    const original = { ...spec(), s: [{ e: "not-resolved" }, { p: "cafe-nola" }] };
    const result = await removeStop(encodeSpec(original), 1);
    expect(decodeSpec(result!.share)?.s).toEqual([{ e: "not-resolved" }]);
    expect(result?.notices?.[0].spec_index).toBe(0);
  });
  it("removing the event also removes its anchor so a later Adjust cannot reinsert it", async () => {
    const result = await removeStop(encodeSpec(spec()), 0);
    expect(decodeSpec(result!.share)?.s).toEqual([]); expect(decodeSpec(result!.share)?.i.event_anchor_slug).toBeUndefined(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("chooses around the event finish and location instead of a town centroid at event start", async () => {
    const far = { ...current, geom: { lng: -77.445, lat: 39.4142 } };
    mocks.archive.mockImplementation(async (slugs: string[]) => ({ matches: slugs.map((requestedSlug) => ({ requestedSlug, canonicalSlug: far.slug, event: far, tombstoned: false })), unresolvedSlugs: [] }));
    const near = { slug: "nearby", name: "Nearby dinner", category: "restaurant", address: "24 Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick", geom: { lng: -77.4451, lat: 39.4142 }, source: "manual", feature_score: 5, short_blurb: "A local restaurant.", updated_at: now.toISOString(), is_verified: true, hours_verified: true, hours_updated_at: now.toISOString(), hours: { tue: [{ open: "22:00", close: "24:00" }] }, source_id: "nearby", source_url: null, license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), open_status: { state: "closed" } } as PlaceCardData;
    mocks.places = [near, { ...near, slug: "another-nearby", name: "Another nearby dinner" }];
    const original = { ...spec(), s: [{ e: current.slug }, { p: "nearby" }] }; const token = encodeSpec(original);
    const options = await stopSwapOptions(token, 1);
    expect(options.alternatives.map((choice) => choice.slug)).toContain("another-nearby");
    expect((await stopAlternatives(token, 1, "restaurant")).map((choice) => choice.slug)).toContain("another-nearby");
    const changed = await swapStop(token, 1);
    expect(changed?.stops[1].place?.slug).toBe("another-nearby");
    expect(changed?.stops[1].open).toBe("open");
    expect(Date.parse(decodeSpec(changed!.share)!.i.start_at!)).toBe(Date.parse(current.starts_at));
    expect(decodeSpec(changed!.share)?.i.start_near).toBeUndefined();
    expect(mocks.archive).toHaveBeenCalledTimes(3);
  });
  it("rejects invalid remove indexes and malformed tokens without network work", async () => {
    expect(await removeStop(encodeSpec(spec()), -1)).toBeNull(); expect(await removeStop(encodeSpec(spec()), 0.5)).toBeNull(); expect(await planFromToken("malformed")).toBeNull(); expect(mocks.archive).not.toHaveBeenCalled();
  });
});
