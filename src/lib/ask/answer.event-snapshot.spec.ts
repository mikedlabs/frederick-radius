import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), assemble: vi.fn() }));
vi.mock("@/lib/loaders/todayEventSnapshot", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/loaders/todayEventSnapshot")>(), loadEventArchiveSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: mocks.assemble }));
import { askFrederick } from "./answer";
import { withAskResponsePresentation } from "./presentation";
import { FREDERICK_CENTER } from "@/lib/geo";
const event: EventWithMeta = {
  slug: "quasar-community-concert", title: "Quasarion", description: "A free concert tonight.",
  starts_at: "2026-07-31T22:00:00.000Z", ends_at: "2026-08-01T00:00:00.000Z",
  timezone: "America/New_York", venue_name: "Baker Park", address: "121 N Bentz St, Frederick, MD",
  geom: FREDERICK_CENTER, municipality: "frederick", category: "music", audience: [],
  is_free: true, source: "city-frederick", source_id: "archive-community-concert-1", is_verified: true,
  confidence: "verified", source_url: "https://www.cityoffrederickmd.gov/calendar", license: "official-public-source", first_seen_at: "2026-07-30T12:00:00Z",
  last_verified_at: "2026-07-31T14:00:00Z", geo_confidence: "exact_address",
  category_name: "Live music", municipality_name: "Frederick" };
const context = { origin: FREDERICK_CENTER, contextLabel: "Frederick", municipality: "frederick" };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-31T20:00:00Z"));
  vi.stubEnv("ASK_AI_RUNTIME_ENABLED", "0");
  mocks.snapshot.mockResolvedValue({ publicEvents: [event], sourceHealth: { degraded: false, unavailable: [], issues: [] } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("ordinary Ask durable calendar integration", () => {
  it("grounds a normal event answer in the archive without assembling publishers", async () => {
    const result = await askFrederick("What concerts are happening tonight?", context);
    expect(result.sources).toContainEqual(expect.objectContaining({ slug: event.slug }));
    expect(mocks.snapshot).toHaveBeenCalledWith(new Date("2026-07-31T20:00:00Z"), { timeoutMs: 1500 });
    expect(mocks.assemble).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the same durable calendar to identify a named event for parking", async () => {
    const result = await askFrederick("Where should I park for Quasarion?", context);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(result.answer).toContain("Quasarion");
    expect(result.actions).toContainEqual(expect.objectContaining({ href: `/events/${event.slug}` }));
    expect(mocks.assemble).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps a degraded named-event parking recovery in its explicit town instead of the selected town", async () => {
    mocks.snapshot.mockResolvedValue({ publicEvents: [{ ...event, municipality: "brunswick", municipality_name: "Brunswick",
      geom: { lng: -77.627, lat: 39.314 } }],
    sourceHealth: { degraded: true, unavailable: [], issues: [{ code: "event_archive_unavailable" }] } });
    const result = await askFrederick("Where should I park for Quasarion in Brunswick?", context);
    expect(result.answer).toContain("Quasarion is outside the downtown Frederick garage area");
    expect(result.sources).toEqual([]);
    expect(result.actions).toContainEqual(expect.objectContaining({ href: `/events/${event.slug}` }));
    expect(result.actions).toContainEqual(expect.objectContaining({ href: "/events?in=brunswick" }));
    expect(result.actions).not.toContainEqual(expect.objectContaining({ href: "/events?in=frederick" }));
    expect(mocks.snapshot).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });
  it("retains an explicit town in degraded parking recovery when the named event is unmatched", async () => {
    mocks.snapshot.mockResolvedValue({ publicEvents: [],
      sourceHealth: { degraded: true, unavailable: [], issues: [{ code: "event_archive_unavailable" }] } });
    const result = await askFrederick("Where should I park for Quasarion in Brunswick?", context);
    expect(result.answer).toContain("I couldn't identify");
    expect(result.sources).toEqual([]);
    expect(result.actions).toContainEqual(expect.objectContaining({ href: "/events?in=brunswick" }));
    expect(result.actions).not.toContainEqual(expect.objectContaining({ href: "/events?in=frederick" }));
    expect(mocks.snapshot).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });
  it("uses a matched event's town for degraded parking recovery without an explicit or selected town", async () => {
    mocks.snapshot.mockResolvedValue({ publicEvents: [{ ...event, title: "Zqvflux", municipality: "brunswick", municipality_name: "Brunswick",
      geom: { lng: -77.627, lat: 39.314 } }],
    sourceHealth: { degraded: true, unavailable: [], issues: [{ code: "event_archive_unavailable" }] } });
    const result = await askFrederick("Where should I park for Zqvflux?", { ...context, municipality: undefined });
    expect(result.actions).toContainEqual(expect.objectContaining({ href: `/events/${event.slug}` }));
    expect(result.actions).toContainEqual(expect.objectContaining({ href: "/events?in=brunswick" }));
    expect(mocks.snapshot).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not choose a nearest garage from an approximate event coordinate", async () => {
    mocks.snapshot.mockResolvedValue({ publicEvents: [{ ...event, geo_confidence: "area" }],
      sourceHealth: { degraded: false, unavailable: [], issues: [] } });
    const result = await askFrederick("Where should I park for Quasarion?", context);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(result.answer).toContain("exact venue location is not verified");
    expect(result.sources).toEqual([]);
    expect(result.actions).toContainEqual(expect.objectContaining({ href: "/parking" }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("qualifies partial empty coverage in the always-visible presentation without claiming no events exist", async () => {
    mocks.snapshot.mockResolvedValue({ publicEvents: [], sourceHealth: { degraded: true,
      unavailable: ["secret diagnostic"], issues: [{ code: "event_archive_unavailable" }] } });
    const result = withAskResponsePresentation(await askFrederick("What concerts are happening tonight?", context), "Concerts tonight");
    expect(result.presentation?.summary).toBe("I could not fully verify the event calendar.");
    expect(result.answer).not.toMatch(/no events|nothing happening|secret diagnostic/i);
    expect(result.actions?.some(action => action.kind === "open" && action.href.startsWith("/events"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["Coffee right now", "Report a pothole"])("does not read the event archive for %s", async query => {
    await askFrederick(query, context);
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.assemble).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
