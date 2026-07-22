import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "./events";
import {
  compactUnifiedEvents,
  hydrateUnifiedEvents,
  type UnifiedEvents,
} from "./unifiedEvents";

function event(
  title: string,
  category = "music",
): EventWithMeta {
  return {
    slug: title.toLowerCase().replaceAll(" ", "-"),
    title,
    description: "A posted event.",
    starts_at: "2026-07-21T23:00:00.000Z",
    ends_at: "2026-07-22T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Market Street, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4143 },
    municipality: "frederick",
    category,
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    feature_score: 5,
    municipality_name: "Frederick",
    category_name: category,
  } as unknown as EventWithMeta;
}

describe("unified event cache payload", () => {
  it("stores the event corpus once and rebuilds the public subset", () => {
    const publicEvent = event("Summer Concert");
    const civicEvent = event("Planning Commission Meeting", "civic");
    const result: UnifiedEvents = {
      unified: [publicEvent, civicEvent],
      publicEvents: [publicEvent],
      sourceHealth: { degraded: false, unavailable: [] },
    };

    const compact = compactUnifiedEvents(result);
    expect(compact).not.toHaveProperty("publicEvents");
    expect(compact.unified).toHaveLength(2);

    const hydrated = hydrateUnifiedEvents(compact);
    expect(hydrated.unified).toEqual(result.unified);
    expect(hydrated.publicEvents.map((item) => item.slug)).toEqual([
      publicEvent.slug,
    ]);
  });

  it("does not duplicate large event descriptions in serialized cache data", () => {
    const large = {
      ...event("Large Feed Event"),
      description: "x".repeat(100_000),
    };
    const result: UnifiedEvents = {
      unified: [large],
      publicEvents: [large],
      sourceHealth: { degraded: false, unavailable: [] },
    };

    const fullBytes = JSON.stringify(result).length;
    const compactBytes = JSON.stringify(compactUnifiedEvents(result)).length;
    expect(compactBytes).toBeLessThan(fullBytes * 0.55);
  });
});
