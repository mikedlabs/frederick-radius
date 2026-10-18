import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskResult } from "./contracts";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({ getSql: vi.fn(), assemble: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: mocks.assemble }));
import { ASK_EVENT_SNAPSHOT_TIMEOUT_MS, loadAskEventSnapshot, withAskEventCoverage } from "./event-snapshot";
import { withAskResponsePresentation } from "./presentation";

const NOW = new Date("2026-07-31T16:00:00Z");
const source = { slug: "archive-celebration", name: "Archive celebration", category: "event",
  href: "/events/archive-celebration", confidence: "high" as const };
const answer: AskResult = { status: "matches", configured: false, usedModel: false,
  answer: "Archive celebration is a verified option. It starts at 6 pm.", sources: [source] };
function event(): EventWithMeta {
  return { slug: source.slug, title: source.name, description: "A community celebration.",
    starts_at: "2026-07-31T22:00:00.000Z", ends_at: "2026-08-01T00:00:00.000Z",
    timezone: "America/New_York", venue_name: "Baker Park", address: "121 N Bentz St, Frederick, MD",
    geom: { lng: -77.4201, lat: 39.4143 }, municipality: "frederick", category: "community", audience: [],
    is_free: true, source: "city-frederick", source_id: "archive-celebration-1", is_verified: true, confidence: "verified",
    source_url: "https://www.cityoffrederickmd.gov/calendar", license: "official-public-source", first_seen_at: "2026-07-30T12:00:00Z",
    last_verified_at: "2026-07-31T14:00:00Z", geo_confidence: "exact_address",
    category_name: "Community", municipality_name: "Frederick" };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.getSql.mockReturnValue(null);
  mocks.assemble.mockRejectedValue(new Error("Ask must not assemble live providers"));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared Ask durable event reader", () => {
  it("reads current rows once without contacting live publishers and retains their verification dates", async () => {
    const sql = vi.fn().mockResolvedValue([{ candidates: [{ canonical_slug: source.slug, snapshot: event() }],
      archive_status: "ok", archive_finished_at: "2026-07-31T15:00:00Z", archive_records_failed: 0 }]);
    mocks.getSql.mockReturnValue(sql);
    const snapshot = await loadAskEventSnapshot(NOW);
    expect(snapshot.publicEvents).toContainEqual(expect.objectContaining({ slug: source.slug,
      last_verified_at: "2026-07-31T14:00:00Z" }));
    expect(snapshot.sourceHealth).toEqual({ degraded: false, unavailable: [], issues: [] });
    expect(sql).toHaveBeenCalledOnce(); expect(mocks.assemble).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the existing curated offline fallback with unavailable coverage", async () => {
    const snapshot = await loadAskEventSnapshot(NOW);
    expect(snapshot.publicEvents.length).toBeGreaterThan(0);
    expect(snapshot.sourceHealth.issues).toEqual([{ code: "event_archive_unavailable",
      message: "The event schedule is temporarily unavailable." }]);
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.assemble).not.toHaveBeenCalled();
  });
  it("cancels the single slow archive read at the Ask deadline", async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const pendingQuery = Object.assign(new Promise<never>(() => undefined), { cancel });
    mocks.getSql.mockReturnValue(vi.fn(() => pendingQuery));
    const pending = loadAskEventSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(ASK_EVENT_SNAPSHOT_TIMEOUT_MS + 1);
    const snapshot = await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(snapshot.sourceHealth.issues[0].code).toBe("event_archive_timeout");
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.assemble).not.toHaveBeenCalled();
  });
  it("never serializes a rejected database diagnostic as public coverage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSql.mockReturnValue(vi.fn().mockRejectedValue(new Error("secret-driver-diagnostic")));
    try {
      const snapshot = await loadAskEventSnapshot(NOW);
      expect(snapshot.sourceHealth.issues[0].code).toBe("event_archive_unavailable");
      expect(JSON.stringify(snapshot)).not.toContain("secret-driver-diagnostic");
    } finally { log.mockRestore(); }
  });
});

describe("Ask event coverage presentation", () => {
  it("keeps partial coverage visible in the actual collapsed answer without downgrading event evidence", () => {
    const qualified = withAskEventCoverage(answer, { degraded: true }, "frederick");
    const displayed = withAskResponsePresentation(qualified, "What events are happening tonight?");
    expect(displayed.presentation?.summary).toBe("I could not fully verify the event calendar.");
    expect(displayed.presentation?.detail).toContain("Archive celebration");
    expect(displayed.sources).toEqual([expect.objectContaining(source)]);
    expect(displayed.actions).toContainEqual({ label: "Open the event calendar", kind: "open", href: "/events?in=frederick" });
  });
  it("leaves healthy answers untouched and never carries another request's coverage", () => {
    expect(withAskEventCoverage(answer, { degraded: false })).toBe(answer);
    const partial = withAskEventCoverage(answer, { degraded: true });
    expect(partial.answer).toContain("could not fully verify");
    expect(withAskEventCoverage(answer, { degraded: false })).toBe(answer);
    expect(answer.answer).not.toContain("could not fully verify");
  });
  it("qualifies an unavailable empty result and preserves calendar and access recovery actions", () => {
    const result = withAskEventCoverage<AskResult>({ ...answer, status: "empty", answer: null, sources: [],
      actions: [{ label: "Open access", kind: "open", href: "/access" },
        { label: "Browse access events", kind: "open", href: "/events?access=1" }] }, { degraded: true });
    expect(withAskResponsePresentation(result, "Events tonight").presentation?.summary)
      .toBe("I could not fully verify the event calendar.");
    expect(result.actions).toHaveLength(2);
    expect(result.answer).not.toMatch(/no events|nothing happening/i);
  });
});
