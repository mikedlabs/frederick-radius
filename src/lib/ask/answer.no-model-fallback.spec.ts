import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), assemble: vi.fn() }));
vi.mock("@/lib/loaders/todayEventSnapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loaders/todayEventSnapshot")>()),
  loadEventArchiveSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assemble,
}));

import { askFrederick } from "./answer";
import { FREDERICK_CENTER } from "@/lib/geo";

function tonightEvent(slug: string, title: string, startsAt: string): EventWithMeta {
  return {
    slug,
    title,
    description: "Doors open at seven.",
    starts_at: startsAt,
    ends_at: "2026-08-01T02:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Baker Park",
    address: "121 N Bentz St, Frederick, MD",
    geom: FREDERICK_CENTER,
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: true,
    source: "city-frederick",
    source_id: `archive-${slug}`,
    is_verified: true,
    confidence: "verified",
    source_url: "https://www.cityoffrederickmd.gov/calendar",
    license: "official-public-source",
    first_seen_at: "2026-07-30T12:00:00Z",
    last_verified_at: "2026-07-31T14:00:00Z",
    geo_confidence: "exact_address",
    category_name: "Live music",
    municipality_name: "Frederick",
  };
}

const context = {
  origin: FREDERICK_CENTER,
  contextLabel: "Frederick",
  municipality: "frederick",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 4 PM Eastern on Friday, July 31, 2026.
  vi.setSystemTime(new Date("2026-07-31T20:00:00Z"));
  vi.stubEnv("ASK_AI_RUNTIME_ENABLED", "0");
  mocks.snapshot.mockResolvedValue({
    publicEvents: [
      tonightEvent("bluegrass-jam", "Bluegrass Jam", "2026-07-31T23:00:00.000Z"),
      tonightEvent("trivia-night", "Trivia Night", "2026-07-31T23:30:00.000Z"),
      tonightEvent("grunge-live", "Grunge Live", "2026-08-01T00:00:00.000Z"),
    ],
    sourceHealth: { degraded: false, unavailable: [], issues: [] },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Unexpected external request")),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Ask answer when no model writes it", () => {
  it("names the lead event for an open-ended tonight question instead of counting results", async () => {
    const result = await askFrederick("What is worth doing tonight?", context);

    expect(result.usedModel).toBe(false);
    expect(result.sources.length).toBeGreaterThan(1);
    expect(result.sources.every((source) => source.href.startsWith("/events/"))).toBe(true);
    expect(result.answer).toBe(
      `I found ${result.sources.length} events in that window, including ${result.sources[0].name}.`,
    );
    expect(result.answer).not.toMatch(/match the wording/i);
  });

  it("does not state a count or crown a best match for an open-ended place list", async () => {
    mocks.snapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [], issues: [] },
    });

    const result = await askFrederick("Tell me about Carroll Creek", context);

    expect(result.usedModel).toBe(false);
    expect(result.sources.length).toBeGreaterThan(1);
    expect(result.sources[0].href).toMatch(/^\/places\//);
    // Keyword ranking, not distance: "closest" is the app's distance word.
    expect(result.answer).toBe("These listings in Radius match the words in your question.");
    expect(result.answer).not.toMatch(/closest|nearest/i);
  });
});
