import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { PlanSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ places: [] as PlaceCardData[] }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaces: () => mocks.places, clientPlaceBySlug: (slug: string) => mocks.places.find((p) => p.slug === slug) }));
import { decodeSpec, encodeSpec, eventPlanSpec, reconstructPlan } from "@/lib/integrations/planner";
import { planAroundEvent, resolvePlanChoiceContext, resolveSharedPlan, type PlanEventSources } from "./resolve-shared-plan";

const now = new Date("2026-10-06T12:00:00-04:00");
const event = (overrides: Partial<EventWithMeta> = {}): EventWithMeta => ({
  slug: "runtime-concert", title: "Evening concert", description: "A published concert.",
  starts_at: "2026-10-06T19:00:00-04:00", ends_at: "2026-10-06T22:00:00-04:00",
  timezone: "America/New_York", venue_name: "Weinberg Center", address: "20 W Patrick Street",
  geom: { lng: -77.4126, lat: 39.4142 }, municipality: "frederick", category: "music",
  audience: ["adults"], is_free: false, source: "manual", source_id: "provider-42",
  is_verified: true, source_url: "https://example.org/concert", license: "Publisher", confidence: "partner",
  first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), geo_confidence: "venue_match",
  placement: "venue", category_name: "Music", municipality_name: "Frederick", ...overrides,
});
const place = (slug: string, overrides: Partial<PlaceCardData> = {}): PlaceCardData => ({
  slug, name: slug, category: "restaurant", short_blurb: "A local restaurant.",
  address: "24 W Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick",
  geom: { lng: -77.4128, lat: 39.4142 }, source: "manual", is_verified: true, feature_score: 5,
  updated_at: now.toISOString(), hours_updated_at: now.toISOString(), is_operational: "operational",
  source_id: slug, source_url: null, license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(),
  open_status: { state: "unknown" }, ...overrides,
});
function spec(slug = "runtime-concert"): PlanSpec { return { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 6, start_at: event().starts_at, event_anchor_slug: slug }, s: [{ e: slug }] }; }
function sources(current: EventWithMeta | null, tombstoned = false): PlanEventSources {
  return { archive: vi.fn(async (slugs: readonly string[]) => ({ matches: current ? slugs.map((slug) => ({ requestedSlug: slug, canonicalSlug: current.slug, id: "42", event: current, tombstoned, lastSeenAt: now.toISOString() })) : [], unresolvedSlugs: [] })), served: vi.fn(() => null), seed: vi.fn(() => null) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.places = []; });
afterEach(() => vi.useRealTimers());
describe("current event outing resolution", () => {
  it("resolves a runtime-only alias, uses current timing and preserves the full three-hour show", async () => {
    const readers = sources(event({ slug: "current-concert", starts_at: "2026-10-06T20:00:00-04:00", ends_at: "2026-10-06T23:00:00-04:00" }));
    readers.seed = vi.fn(() => event({ title: "Stale seed", status: "cancelled" }));
    const plan = await resolveSharedPlan(spec("old-concert"), { now, sources: readers });
    expect(plan?.stops[0].event?.title).toBe("Evening concert");
    expect(plan?.stops[0].at).toBe("2026-10-07T00:00:00.000Z");
    expect(plan?.stops[0].duration_min).toBe(180);
    expect(decodeSpec(plan!.share)?.s).toEqual([{ e: "current-concert" }]);
    expect(decodeSpec(plan!.share)?.i.event_anchor_slug).toBe("current-concert");
    expect(readers.archive).toHaveBeenCalledTimes(1); expect(readers.seed).not.toHaveBeenCalled();
  });
  it.each([
    ["cancelled", { status: "cancelled" }, "cancelled"],
    ["postponed", { status: "postponed" }, "postponed"],
    ["ended", { starts_at: "2026-10-05T19:00:00-04:00", ends_at: "2026-10-05T22:00:00-04:00" }, "ended"],
    ["started", { starts_at: "2026-10-06T11:00:00-04:00", ends_at: "2026-10-06T14:00:00-04:00" }, "already_started"],
    ["missing end", { ends_at: "2026-10-06T19:00:00-04:00" }, "timing_unknown"],
    ["area location", { geo_confidence: "area" }, "location_unknown"],
  ] as const)("keeps a %s event reference without a route", async (_, overrides, code) => {
    const plan = await resolveSharedPlan(spec(), { now, sources: sources(event(overrides)) });
    expect(plan?.stops).toEqual([]); expect(plan?.notices?.[0].code).toBe(code);
    expect(decodeSpec(plan!.share)?.s).toEqual(spec().s);
  });
  it.each(["Private wedding reception", "City Council meeting", "Cancelled: Private wedding reception"])("never exposes non-public archive fields: %s", async (title) => {
    const plan = await resolveSharedPlan(spec(), { now, sources: sources(event({ title })) });
    expect(plan?.stops).toEqual([]); expect(plan?.notices?.[0].event_href).toBeUndefined();
    expect(JSON.stringify(plan)).not.toContain(title);
  });
  it("does not recover tombstones or malformed rows from older seed/board data", async () => {
    const readers = sources(event(), true); readers.served = vi.fn(() => event()); readers.seed = vi.fn(() => event());
    const tombstone = await resolveSharedPlan(spec(), { now, sources: readers });
    expect(tombstone?.stops).toEqual([]); expect(tombstone?.notices?.[0].event_href).toBeUndefined();
    readers.archive = vi.fn(async () => ({ matches: [], unresolvedSlugs: ["runtime-concert"] }));
    expect((await resolveSharedPlan(spec(), { now, sources: readers }))?.stops).toEqual([]);
    expect(readers.served).not.toHaveBeenCalled(); expect(readers.seed).not.toHaveBeenCalled();
  });
  it("keeps the exact token through a bounded archive timeout and recovers on retry", async () => {
    const readers = sources(event()); let signal: AbortSignal | undefined;
    readers.archive = vi.fn((_, options) => { signal = options.signal; return new Promise<never>(() => {}); });
    const pending = resolveSharedPlan(spec(), { now, sources: readers, timeoutMs: 40 });
    await vi.advanceTimersByTimeAsync(41);
    const failed = await pending;
    expect(signal?.aborted).toBe(true); expect(failed?.stops).toEqual([]);
    expect(decodeSpec(failed!.share)?.s).toEqual(spec().s); expect(readers.seed).not.toHaveBeenCalled();
    const recovered = await resolveSharedPlan(decodeSpec(failed!.share)!, { now, sources: sources(event()) });
    expect(recovered?.stops[0].event?.slug).toBe("runtime-concert");
  });
  it("makes an unconfirmed-hours nearby place an unscheduled option with its original slot", async () => {
    mocks.places = [place("nearby-dinner")];
    const plan = await planAroundEvent("runtime-concert", undefined, { now, sources: sources(event()) });
    expect(plan?.stops).toHaveLength(1); expect(plan?.unscheduled?.[0].place.slug).toBe("nearby-dinner");
    expect(plan?.unscheduled?.[0].spec_index).toBe(1); expect(decodeSpec(plan!.share)?.s).toHaveLength(2);
  });
  it("schedules only one nearby confirmed place after the full event and within the outing", async () => {
    const hours = { tue: [{ open: "10:00", close: "24:00" }] };
    mocks.places = [place("dinner", { hours, hours_verified: true }), place("another", { hours, hours_verified: true })];
    const plan = await planAroundEvent("runtime-concert", undefined, { now, sources: sources(event()) });
    expect(plan?.stops).toHaveLength(2); expect(plan?.unscheduled).toBeUndefined();
    expect(Date.parse(plan!.stops[1].at)).toBeGreaterThanOrEqual(Date.parse(event().ends_at) + 3 * 60_000);
    expect(plan!.stops[1].open).toBe("open");
    const last = plan!.stops[1]; expect(Date.parse(last.at) + last.duration_min * 60_000).toBeLessThanOrEqual(Date.parse(event().starts_at) + decodeSpec(plan!.share)!.i.duration_hours * 3_600_000);
  });
  it("holds stale publisher evidence even when the archive ingestion heartbeat is current", async () => {
    const plan = await resolveSharedPlan(spec(), { now, sources: sources(event({ last_verified_at: "2026-10-01T12:00:00Z" })) });
    expect(plan?.stops).toEqual([]); expect(plan?.notices?.[0].message).toContain("publisher recently");
    expect(decodeSpec(plan!.share)?.s).toEqual(spec().s);
  });
  it("keeps second-precision event ends intact before travel to the next stop", async () => {
    mocks.places = [place("dinner", { hours: { tue: [{ open: "10:00", close: "24:00" }] }, hours_verified: true })];
    const timed = event({ ends_at: "2026-10-06T22:00:30-04:00" });
    const plan = await planAroundEvent(timed.slug, undefined, { now, sources: sources(timed) });
    expect(plan?.stops[0].duration_min).toBe(181);
    expect(Date.parse(plan!.stops[1].at)).toBe(Date.parse(timed.ends_at) + plan!.stops[1].travel_from_previous_min! * 60_000);
  });
  it("does not call an old verified-hours record open in a future event outing", async () => {
    mocks.places = [place("stale-dinner", { hours: { tue: [{ open: "10:00", close: "24:00" }] }, hours_verified: true, hours_updated_at: "2025-01-01T12:00:00Z" })];
    const plan = await planAroundEvent("runtime-concert", undefined, { now, sources: sources(event()) });
    expect(plan?.stops).toHaveLength(1); expect(plan?.unscheduled?.[0].place.slug).toBe("stale-dinner");
  });
  it("retains original edit slots when unresolved references are hidden", () => {
    mocks.places = [place("dinner")];
    const mixed: PlanSpec = { ...spec(), i: { ...spec().i, event_anchor_slug: undefined }, s: [{ e: "unavailable" }, { p: "dinner" }] };
    const plan = reconstructPlan(mixed);
    expect(plan?.notices?.[0].spec_index).toBe(0);
    expect(decodeSpec(plan!.share)?.s).toEqual(mixed.s);
  });
  it.each([
    { name: "later date", starts_at: "2026-10-07T19:00:00-04:00", ends_at: "2026-10-07T22:00:00-04:00" },
    { name: "earlier start", starts_at: "2026-10-06T17:00:00-04:00", ends_at: "2026-10-06T20:00:00-04:00" },
  ])("rebuilds the nearby window from an event rescheduled to a $name", async ({ starts_at, ends_at }) => {
    mocks.places = [place("dinner", { hours: { tue: [{ open: "10:00", close: "24:00" }], wed: [{ open: "10:00", close: "24:00" }] }, hours_verified: true })];
    const original: PlanSpec = { ...spec(), s: [{ e: "runtime-concert" }, { p: "dinner" }] };
    const moved = event({ starts_at, ends_at });
    const plan = await resolveSharedPlan(original, { now, sources: sources(moved) });
    expect(plan?.stops).toHaveLength(2);
    expect(plan?.notices).toBeUndefined();
    expect(plan?.stops[0].duration_min).toBe(180);
    expect(plan?.stops[1].place?.slug).toBe("dinner");
    expect(Date.parse(plan!.stops[1].at)).toBeGreaterThan(Date.parse(ends_at));
    const rebuilt = decodeSpec(plan!.share)!;
    expect(Date.parse(rebuilt.i.start_at!)).toBe(Date.parse(starts_at));
    expect(rebuilt.s).toEqual(original.s);
  });
  it("uses the explicit event anchor for choices even when another event reference comes first", async () => {
    const selected = event({ slug: "selected-concert", geom: { lng: -77.445, lat: 39.4142 } });
    const other = event({ slug: "first-concert", starts_at: "2026-10-06T16:00:00-04:00", ends_at: "2026-10-06T18:00:00-04:00" });
    const readers = sources(null);
    readers.archive = vi.fn(async () => ({ matches: [
      { requestedSlug: other.slug, canonicalSlug: other.slug, id: "first", lastSeenAt: now.toISOString(), event: other, tombstoned: false },
      { requestedSlug: "old-selected", canonicalSlug: selected.slug, id: "selected", lastSeenAt: now.toISOString(), event: selected, tombstoned: false },
    ], unresolvedSlugs: [] }));
    const anchored: PlanSpec = { ...spec("old-selected"), s: [{ e: other.slug }, { e: "old-selected" }, { p: "dinner" }] };
    const context = await resolvePlanChoiceContext(anchored, { now, sources: readers });
    expect(context.eventAvailable).toBe(true);
    expect(context.spec.i).toMatchObject({ event_anchor_slug: selected.slug, start_near: selected.geom, start_at: selected.ends_at });
    const canonical = await resolvePlanChoiceContext({ ...anchored, i: { ...anchored.i, event_anchor_slug: selected.slug } }, { now, sources: readers });
    expect(canonical.spec.i.start_near).toEqual(selected.geom);
    readers.archive = vi.fn(async () => ({ matches: [{ requestedSlug: other.slug, canonicalSlug: other.slug, id: "first", lastSeenAt: now.toISOString(), event: other, tombstoned: false }], unresolvedSlugs: ["old-selected"] }));
    expect((await resolvePlanChoiceContext(anchored, { now, sources: readers })).eventAvailable).toBe(false);
  });
  it.each(["closed_permanently", "closed_temporarily"] as const)("does not reserve an event at a %s venue", async (is_operational) => {
    mocks.places = [place("venue", { is_operational })];
    const result = await resolveSharedPlan(spec(), { now, sources: sources(event({ venue_place_slug: "venue" })) });
    expect(result?.stops).toEqual([]);
    expect(result?.notices?.[0]).toMatchObject({ code: "does_not_fit", event_href: "/events/runtime-concert" });
    expect(result?.notices?.[0].message).toContain("listed as closed");
  });
  it.each([160, 200])("round-trips and resolves an accepted %s-character event identity", async (length) => {
    const slug = "a".repeat(length);
    const original = spec(slug);
    expect(decodeSpec(encodeSpec(original))).toEqual(original);
    const result = await resolveSharedPlan(original, { now, sources: sources(event({ slug })) });
    expect(result?.stops[0].event?.slug).toBe(slug);
    expect(decodeSpec(result!.share)?.i.event_anchor_slug).toBe(slug);
  });
  it.each(["constructor", "prototype", "a".repeat(201), "invalid/slug"])("rejects invalid event tokens before archive resolution: %s", (slug) => {
    expect(decodeSpec(encodeSpec(spec(slug)))).toBeNull();
  });

  it("avoids event archive work entirely for place-only plans", async () => {
    const readers = sources(null); mocks.places = [place("dinner")];
    await resolveSharedPlan({ ...spec(), s: [{ p: "dinner" }] }, { now, sources: readers });
    expect(readers.archive).not.toHaveBeenCalled();
  });
  it("never chooses a distant, out-of-town, or family-incompatible extra stop", () => {
    mocks.places = [place("distant", { geom: { lng: -77.3, lat: 39.5 } }), place("other-town", { municipality: "thurmont" }), place("bar", { category: "bar" })];
    const input = { ...spec().i, audience: "family" as const };
    expect(eventPlanSpec(event(), input).s).toEqual([{ e: "runtime-concert" }]);
  });
});
