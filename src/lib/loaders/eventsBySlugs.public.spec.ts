import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({
  assembleUnifiedEvents: vi.fn(),
  archivedEventsBySlugs: vi.fn(),
}));

vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));

vi.mock("@/lib/events/event-identity", () => ({
  archivedEventsBySlugs: mocks.archivedEventsBySlugs,
}));

import { resolveEventsBySlugsWithStatus } from "./eventsBySlugs";

const NOW = new Date("2026-08-04T12:00:00.000Z");

function privateUnifiedRow(): EventWithMeta {
  return {
    slug: "private-investor-dinner",
    title: "Private Investor Dinner",
    description: "Invitation-only details must not leave the server.",
    starts_at: "2026-08-10T22:00:00.000Z",
    ends_at: "2026-08-11T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Private residence",
    address: "Confidential address, Frederick, MD",
    geom: { lng: -77.4118, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: ["adults"],
    is_free: true,
    source: "manual",
    is_verified: true,
    source_id: "private-source-id",
    source_url: null,
    license: "private",
    first_seen_at: "2026-08-01T12:00:00.000Z",
    last_verified_at: "2026-08-01T12:00:00.000Z",
    confidence: "curated",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("default saved-event public boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archivedEventsBySlugs.mockResolvedValue({
      matches: [],
      unresolvedSlugs: [],
    });
  });

  it("never returns a record present only in assembled.unified", async () => {
    const privateEvent = privateUnifiedRow();
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [privateEvent],
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await resolveEventsBySlugsWithStatus(
      [privateEvent.slug],
      NOW,
    );

    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledTimes(1);
    expect(mocks.archivedEventsBySlugs).toHaveBeenCalledTimes(1);
    expect(result.events).toEqual([]);
    expect(result.resolvedSlugs).toEqual([]);
    expect(result.missingSlugs).toEqual([privateEvent.slug]);
    expect(result.unresolvedSlugs).toEqual([]);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain(privateEvent.title);
    expect(payload).not.toContain(privateEvent.description);
    expect(payload).not.toContain(privateEvent.address);
  });
});
