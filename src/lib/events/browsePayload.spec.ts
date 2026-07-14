import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildHorizonBounds, groupByHorizon } from "@/lib/eventHorizon";
import {
  initialEventsForBrowse,
  prepareEventsForBrowse,
  slimEventForBrowse,
  summarizeEventsForBrowse,
} from "./browsePayload";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const BOUNDS = buildHorizonBounds(NOW);

function event(
  slug: string,
  startsAt: string,
  overrides: Partial<EventWithMeta> = {},
): EventWithMeta {
  return {
    slug,
    title: `Event ${slug}`,
    description: "A".repeat(400),
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Test St",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    ticket_url: "https://example.com/ticket",
    source: "seed",
    is_verified: true,
    source_id: slug,
    source_url: "https://example.com/source",
    license: "test",
    confidence: "curated",
    first_seen_at: NOW.toISOString(),
    last_verified_at: NOW.toISOString(),
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    ...overrides,
  };
}

describe("events browse payload", () => {
  it("removes detail-only fields and clamps searchable descriptions", () => {
    const slim = slimEventForBrowse(event("slim", "2026-07-14T14:00:00.000Z"));

    expect(slim.description).toHaveLength(160);
    expect("ticket_url" in slim).toBe(false);
    expect("source_url" in slim).toBe(false);
  });

  it("collapses repeated long-tail series but keeps nearby dates distinct", () => {
    const prepared = prepareEventsForBrowse([
      event("ended", "2026-07-14T08:00:00.000Z", {
        ends_at: "2026-07-14T10:00:00.000Z",
      }),
      event("near-1", "2026-07-14T14:00:00.000Z", { title: "Storytime" }),
      event("near-2", "2026-07-14T17:00:00.000Z", { title: "Storytime" }),
      event("later-1", "2026-08-01T14:00:00.000Z", { title: "Weekly Jam" }),
      event("later-2", "2026-08-08T14:00:00.000Z", { title: "Weekly Jam" }),
      event("later-3", "2026-08-15T14:00:00.000Z", { title: "Weekly Jam" }),
    ], BOUNDS);

    expect(prepared.map((item) => item.slug)).toEqual(["near-1", "near-2", "later-1"]);
    expect(prepared[2].recurrence_text).toBe("3 upcoming dates");
  });

  it("ships six cards per horizon while retaining complete summary counts", () => {
    const today = Array.from({ length: 9 }, (_, index) =>
      event(`today-${index}`, `2026-07-14T${String(13 + index).padStart(2, "0")}:00:00.000Z`, {
        venue_name: `Today Venue ${index}`,
      }),
    );
    const later = Array.from({ length: 10 }, (_, index) =>
      event(`later-${index}`, `2026-08-${String(1 + index).padStart(2, "0")}T14:00:00.000Z`, {
        venue_name: `Later Venue ${index}`,
      }),
    );
    const prepared = prepareEventsForBrowse([...today, ...later], BOUNDS);
    const initial = initialEventsForBrowse(prepared, BOUNDS);
    const summary = summarizeEventsForBrowse(prepared, BOUNDS);
    const initialGroups = groupByHorizon(initial, BOUNDS);

    expect(initialGroups.every((group) => group.events.length <= 6)).toBe(true);
    expect(initial).toHaveLength(12);
    expect(summary.totalCount).toBe(19);
    expect(summary.horizonCounts.today).toBe(9);
    expect(summary.horizonCounts.later).toBe(10);
  });
});
