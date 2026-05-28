import { describe, it, expect } from "vitest";
import { dedupeLiveAgainstCurated, type EventWithMeta } from "@/lib/loaders/events";

const ev = (o: Partial<EventWithMeta>) => o as unknown as EventWithMeta;

/**
 * P0-4: live or county-feed copies of a curated event must be dropped
 * (curated wins), while genuinely different events are kept.
 */
describe("dedupeLiveAgainstCurated", () => {
  const curated = [
    ev({
      slug: "alive-at-five-glamour-kitty",
      title: "Alive @ Five Glamour Kitty",
      venue_name: "Carroll Creek Amphitheater",
      starts_at: "2026-05-21T21:00:00Z",
    }),
    ev({
      slug: "asia-on-the-creek",
      title: "Asia On The Creek",
      venue_name: "Carroll Creek Linear Park",
      starts_at: "2026-05-23T16:00:00Z",
    }),
  ];

  it("drops the county-feed copy of a curated event", () => {
    const live = [
      ev({
        title: "Downtown Frederick Partnership-Alive @ Five",
        venue_name: "Carroll Creek Amphitheater",
        starts_at: "2026-05-21T21:30:00Z",
      }),
      ev({
        title: "Asian American Center of Frederick-Asia on the Creek",
        venue_name: "Carroll Creek Linear Park",
        starts_at: "2026-05-23T16:15:00Z",
      }),
    ];
    expect(dedupeLiveAgainstCurated(live, curated)).toHaveLength(0);
  });

  it("keeps a genuinely different live event at another venue", () => {
    const live = [
      ev({ title: "Farmers Market", venue_name: "Baker Park", starts_at: "2026-05-21T13:00:00Z" }),
    ];
    expect(dedupeLiveAgainstCurated(live, curated)).toHaveLength(1);
  });

  it("keeps a same-venue event at a very different time", () => {
    const live = [
      ev({
        title: "Alive @ Five Setup Crew",
        venue_name: "Carroll Creek Amphitheater",
        starts_at: "2026-05-21T12:00:00Z",
      }),
    ];
    expect(dedupeLiveAgainstCurated(live, curated)).toHaveLength(1);
  });

  // Regression: a county-feed event for the same time + title but with a
  // venue STRING that doesn't substring-match the seed should still
  // dedupe when the two are geographically co-located. "Carroll Creek
  // Amphitheater" (seed) vs "Carroll Creek Linear Park" (feed) — same
  // physical place, no shared substring.
  it("drops a same-time same-title event whose venue name differs but is geo-co-located", () => {
    const curatedGeo = [
      ev({
        slug: "alive-at-five-2026-05-21",
        title: "Alive @ Five · Glamour Kitty",
        venue_name: "Carroll Creek Amphitheater",
        starts_at: "2026-05-21T21:00:00Z",
        geom: { lng: -77.4087681, lat: 39.4126271 },
      }),
    ];
    const live = [
      ev({
        title: "Alive @ Five",
        venue_name: "Carroll Creek Linear Park",
        starts_at: "2026-05-21T21:00:00Z",
        geom: { lng: -77.4085, lat: 39.4127 },
      }),
    ];
    expect(dedupeLiveAgainstCurated(live, curatedGeo)).toHaveLength(0);
  });
});
