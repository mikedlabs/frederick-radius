import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(), generate: vi.fn(), assemble: vi.fn(),
  configuration: null as null | { tools: { searchEvents: { execute: (input: { query: string; limit: number }) => Promise<unknown> } } },
}));
vi.mock("ai", () => ({
  tool: (definition: unknown) => definition, Output: { object: () => ({}) }, stepCountIs: () => () => false,
  ToolLoopAgent: class {
    constructor(configuration: NonNullable<typeof mocks.configuration>) { mocks.configuration = configuration; }
    generate = mocks.generate;
  },
}));
vi.mock("@/lib/ask/runtime-budget", () => ({
  askAgentRuntimeConfigured: () => true, askAiMaxOutputTokens: () => 400,
  reserveAskModelCall: vi.fn(),
}));
vi.mock("@/lib/loaders/todayEventSnapshot", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/loaders/todayEventSnapshot")>(),
  loadEventArchiveSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: mocks.assemble }));
import { runRadiusAgent } from "./intelligence";
import { withAskResponsePresentation } from "./presentation";
import { FREDERICK_CENTER } from "@/lib/geo";
const event: EventWithMeta = {
  slug: "archive-community-concert", title: "Archive Community Concert", description: "A free concert tonight.",
  starts_at: "2026-07-31T22:00:00.000Z", ends_at: "2026-08-01T00:00:00.000Z",
  timezone: "America/New_York", venue_name: "Baker Park", address: "121 N Bentz St, Frederick, MD",
  geom: FREDERICK_CENTER, municipality: "frederick", category: "music", audience: [],
  is_free: true, source: "city-frederick", source_id: "archive-community-concert-1", is_verified: true,
  confidence: "verified", source_url: "https://www.cityoffrederickmd.gov/calendar", license: "official-public-source", first_seen_at: "2026-07-30T12:00:00Z",
  last_verified_at: "2026-07-31T14:00:00Z", geo_confidence: "exact_address",
  category_name: "Live music", municipality_name: "Frederick" };
const context = { origin: FREDERICK_CENTER, contextLabel: "Frederick", municipality: "frederick" };
const taste = { savedPlaceSlugs: [], interests: [] };
function snapshot(degraded: boolean) {
  return { publicEvents: [event], sourceHealth: { degraded, unavailable: degraded ? ["secret diagnostic"] : [],
    issues: degraded ? [{ code: "event_archive_validation", message: "secret diagnostic" }] : [] } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-31T20:00:00Z"));
  vi.clearAllMocks(); mocks.configuration = null; mocks.generate.mockResolvedValue({ output: null });
  mocks.snapshot.mockResolvedValue(snapshot(false));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("actual Radius agent event tool wiring", () => {
  it("uses the bounded archive and keeps verified event evidence when collection coverage is partial", async () => {
    mocks.snapshot.mockResolvedValue(snapshot(true));
    await runRadiusAgent("Find concerts tonight", context, taste);
    const result = await mocks.configuration!.tools.searchEvents.execute({ query: "Concerts tonight", limit: 6 });
    expect(result).toMatchObject({ calendarCoverage: "partial",
      unavailableSources: ["Some event records could not be verified."],
      events: [{ slug: event.slug, confidence: "high", eligibleAsLead: true, trustReason: "current-source" }] });
    await mocks.configuration!.tools.searchEvents.execute({ query: "Free concerts tonight", limit: 3 });
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(mocks.snapshot).toHaveBeenCalledWith(new Date("2026-07-31T20:00:00Z"), { timeoutMs: 1500 });
    expect(JSON.stringify(result)).not.toContain("secret diagnostic");
    expect(mocks.assemble).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps qualification visible in the final answer and isolates concurrent request coverage", async () => {
    mocks.snapshot.mockResolvedValueOnce(snapshot(true)).mockResolvedValueOnce(snapshot(false));
    mocks.generate.mockImplementation(async () => {
      const tools = mocks.configuration!.tools;
      await tools.searchEvents.execute({ query: "Concerts tonight", limit: 6 });
      return { output: { answer: "Archive Community Concert is a verified option tonight.", leadSlug: event.slug,
        placeSlugs: [], eventSlugs: [event.slug], followUps: [], confidence: "high" } };
    });
    const [partial, healthy] = await Promise.all([
      runRadiusAgent("Find concerts tonight", context, taste),
      runRadiusAgent("Find concerts tonight", context, taste),
    ]);
    expect(partial).not.toBeNull(); expect(healthy).not.toBeNull();
    const displayed = withAskResponsePresentation({ status: "answered", configured: true, usedModel: true,
      answer: partial!.answer, sources: partial!.sources, actions: partial!.actions }, "Concerts tonight");
    expect(displayed.presentation?.summary).toBe("I could not fully verify the event calendar.");
    expect(partial!.sources).toContainEqual(expect.objectContaining({ slug: event.slug, confidence: "high" }));
    expect(healthy!.answer).not.toContain("could not fully verify");
    expect(mocks.snapshot).toHaveBeenCalledTimes(2); expect(fetch).not.toHaveBeenCalled();
  });
});
