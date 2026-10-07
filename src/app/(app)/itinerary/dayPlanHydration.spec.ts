import { afterEach, expect, it, vi } from "vitest";
import { fetchDayPlanHydration, parseDayPlanHydration } from "./dayPlanHydration";
import { resolveEventsBySlugsWithStatus } from "@/lib/loaders/eventsBySlugs";
import { stampEventProvenance } from "@/lib/provenance";
import type { EventWithMeta } from "@/lib/loaders/events";
const event = { slug: "canonical", title: "Listed event", description: "", starts_at: "2026-10-08T20:00:00Z", ends_at: "2026-10-08T22:00:00Z", venue_name: "Park", category: "music", audience: [] };
const payload = (extra: Record<string, unknown> = {}) => ({ events: [event], resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "canonical" }], missingSlugs: [], unresolvedSlugs: [], degraded: false, ...extra });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps exact requested aliases and separates a healthy missing reference", () => {
  expect(parseDayPlanHydration(payload({ missingSlugs: ["gone"] }), ["legacy", "gone"])).toMatchObject({ resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "canonical" }], missingSlugs: ["gone"], degraded: false });
});
it("treats an omitted older-response reference as unresolved", () => {
  expect(parseDayPlanHydration({ events: [{ ...event, slug: "legacy" }] }, ["legacy", "unknown"])).toMatchObject({ unresolvedSlugs: ["unknown"], missingSlugs: [], degraded: true });
});
it.each([
  payload({ resolvedSlugs: [{ requestedSlug: "unrequested", canonicalSlug: "canonical" }] }),
  payload({ resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "absent" }] }),
  payload({ missingSlugs: ["legacy"] }),
  payload({ unresolvedSlugs: ["unknown"] }),
  payload({ resolvedSlugs: [] }),
  payload({ events: [{ ...event, starts_at: "invalid" }] }),
  payload({ events: [{ ...event, title: {} }] }),
  payload({ events: [event, event] }),
])("rejects inconsistent identity/status or unsafe row shapes", (value) => {
  expect(() => parseDayPlanHydration(value, ["legacy", "other"])).toThrow();
});
it("allows multiple saved aliases to resolve to one public row", () => {
  const mappings = ["legacy", "other"].map((requestedSlug) => ({ requestedSlug, canonicalSlug: "canonical" }));
  expect(parseDayPlanHydration(payload({ resolvedSlugs: mappings }), ["legacy", "other"]).resolvedSlugs).toEqual(mappings);
});
it("does no transport for a pre-cancelled request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const parent = new AbortController(); parent.abort();
  await expect(fetchDayPlanHydration(["legacy"], parent.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["headers", "body"])("bounds a stalled %s even when transport ignores cancellation", async (phase) => {
  vi.useFakeTimers(); let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal;
    return phase === "headers" ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  }));
  const pending = fetchDayPlanHydration(["legacy"], new AbortController().signal, 100);
  const failed = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100); await failed; expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("cancels body parsing and consumes its late completion", async () => {
  let finish!: (value: unknown) => void; const parent = new AbortController();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) }));
  const pending = fetchDayPlanHydration(["legacy"], parent.signal); const failed = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve(); parent.abort(); await failed; finish(payload()); await Promise.resolve();
});
it("disposes its deadline and parent listener after a fast valid read", async () => {
  vi.useFakeTimers(); const parent = new AbortController(); const remove = vi.spyOn(parent.signal, "removeEventListener");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()))); vi.stubGlobal("fetch", fetch);
  await fetchDayPlanHydration(["legacy"], parent.signal);
  expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(fetch).toHaveBeenCalledWith("/api/events/by-slugs", expect.objectContaining({ method: "POST", cache: "no-store", credentials: "same-origin", body: JSON.stringify({ slugs: ["legacy"] }) }));
});


const resolverNow = new Date("2026-08-04T12:00:00Z");
function publicListing(): EventWithMeta {
  const base = { slug: "canonical-event", title: "One public listing", description: "", starts_at: "2026-08-10T22:00:00Z", ends_at: "2026-08-11T01:00:00Z", timezone: "America/New_York" as const, venue_name: "Sky Stage", address: "59 S Carroll St, Frederick, MD", geom: { lng: -77.4118, lat: 39.4143 }, municipality: "frederick", category: "music", audience: ["adults"], is_free: true, source: "manual" as const, is_verified: true };
  return { ...base, ...stampEventProvenance(base), geo_confidence: "venue_match", category_name: "Music", municipality_name: "Frederick" };
}
it.each([
  ["legacy-event", "canonical-event"], ["canonical-event", "legacy-event"],
  ["legacy-event", "second-alias"], ["second-alias", "legacy-event"],
])("hydrates the real resolver's equivalent duplicate rows for %s then %s", async (first, second) => {
  const requested = [first, second];
  const listing = publicListing();
  const result = await resolveEventsBySlugsWithStatus(requested, resolverNow, {
    seed: () => null, publicEvents: async () => [listing],
    archive: async (slugs) => ({ matches: slugs.map((requestedSlug) => ({ id: `identity-${requestedSlug}`, requestedSlug, canonicalSlug: listing.slug, event: { ...listing, geom: { lat: listing.geom.lat, lng: listing.geom.lng } }, tombstoned: false, lastSeenAt: resolverNow.toISOString() })), unresolvedSlugs: [] }),
  });
  expect(result.events).toHaveLength(2);
  const parsed = parseDayPlanHydration(JSON.parse(JSON.stringify(result)), requested);
  expect(parsed.events).toEqual([listing]);
  expect(parsed.resolvedSlugs).toEqual(requested.map((requestedSlug) => ({ requestedSlug, canonicalSlug: listing.slug })));
  expect(parsed).toMatchObject({ missingSlugs: [], unresolvedSlugs: [], degraded: false });
});
it.each([
  { title: "A conflicting title" }, { status: "cancelled" },
  { starts_at: "2026-10-08T21:00:00Z" }, { ends_at: "2026-10-08T23:00:00Z" },
  { geom: { lng: -77.4, lat: 39.4 } }, { last_verified_at: "2026-10-07T10:00:00Z" },
])("does not arbitrate conflicting duplicate evidence %j in either requested order", (difference) => {
  for (const requested of [["legacy", "canonical"], ["canonical", "legacy"]]) {
    const rows = requested.map((slug) => slug === "legacy" ? { ...event, ...difference } : event);
    const resolvedSlugs = requested.map((requestedSlug) => ({ requestedSlug, canonicalSlug: "canonical" }));
    expect(() => parseDayPlanHydration(payload({ events: rows, resolvedSlugs }), requested)).toThrow();
  }
});
it("holds differing archive and current public facts from the actual resolver", async () => {
  for (const requested of [["legacy-event", "canonical-event"], ["canonical-event", "legacy-event"]]) {
    const listing = publicListing();
    const result = await resolveEventsBySlugsWithStatus(requested, resolverNow, {
      seed: () => null, publicEvents: async () => [listing],
      archive: async () => ({ matches: [{ id: "identity-old", requestedSlug: "legacy-event", canonicalSlug: listing.slug, event: { ...listing, title: "Different archived listing" }, tombstoned: false, lastSeenAt: resolverNow.toISOString() }], unresolvedSlugs: [] }),
    });
    expect(result.events).toHaveLength(2);
    expect(() => parseDayPlanHydration(result, requested)).toThrow();
  }
});


it.each(["cancelled", "tombstoned", "private"])("suppresses the real resolver's older alias when its requested canonical is %s", async (boundary) => {
  for (const requested of [["legacy-event", "canonical-event"], ["canonical-event", "legacy-event"]]) {
    const listing = publicListing();
    const held = boundary === "cancelled" ? { ...listing, status: "cancelled" as const } : boundary === "private" ? { ...listing, title: "Private birthday party" } : listing;
    const result = await resolveEventsBySlugsWithStatus(requested, resolverNow, {
      seed: () => null, publicEvents: async () => boundary === "tombstoned" ? [] : [held],
      archive: async (slugs) => ({ matches: slugs.map((requestedSlug) => ({ id: `identity-${requestedSlug}`, requestedSlug, canonicalSlug: listing.slug, event: requestedSlug === listing.slug ? held : listing, tombstoned: boundary === "tombstoned" && requestedSlug === listing.slug, lastSeenAt: resolverNow.toISOString() })), unresolvedSlugs: [] }),
    });
    expect(result).toMatchObject({ events: [listing], missingSlugs: [listing.slug], unresolvedSlugs: [] });
    const parsed = parseDayPlanHydration(JSON.parse(JSON.stringify(result)), requested);
    expect(parsed.events).toEqual([]);expect(parsed.resolvedSlugs).toEqual([]);
    expect(new Set(parsed.missingSlugs)).toEqual(new Set(requested));
    expect(parsed).toMatchObject({ unresolvedSlugs: [], degraded: false });
  }
});
it("does not turn an unresolved canonical into known missing or suppress a public alias", () => {
  const parsed = parseDayPlanHydration(payload({ unresolvedSlugs: ["canonical"] }), ["legacy", "canonical"]);
  expect(parsed.events).toEqual([event]);expect(parsed.missingSlugs).toEqual([]);
  expect(parsed.unresolvedSlugs).toEqual(["canonical"]);expect(parsed.degraded).toBe(true);
});
