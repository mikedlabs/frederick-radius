import { describe, expect, it } from "vitest";

import { EVENT_BY_SLUG } from "@/data/events";
import type { EventWithMeta } from "./events";
import { dedupeCuratedClusters, dedupeLiveAgainstCurated } from "./events";

function event(
  slug: string,
  title: string,
  overrides: Partial<EventWithMeta> = {},
): EventWithMeta {
  return {
    slug,
    title,
    starts_at: "2026-08-13T21:00:00.000Z",
    ends_at: "2026-08-14T00:00:00.000Z",
    description: "",
    venue_name: "Carroll Creek Amphitheater",
    venue_place_slug: "carroll-creek-outdoor-amphitheater",
    address: "Carroll Creek Park, Frederick, MD 21701",
    geom: { lng: -77.4087681, lat: 39.4126271 },
    municipality: "frederick",
    category: "music",
    audience: ["adults"],
    is_free: false,
    is_recurring: true,
    recurrence_text: "Every Thursday",
    source_name: "Downtown Frederick Partnership",
    source_url: null,
    source_verified_at: null,
    attendance_mode: "physical",
    geo_confidence: "exact_address",
    category_name: "Live music",
    municipality_name: "Frederick City",
    ...overrides,
  } as EventWithMeta;
}

describe("recurring event series deduplication", () => {
  it("carries the organizer's current August 13 lineup correction", () => {
    expect(EVENT_BY_SLUG["alive-at-five-2026-08-13"]).toMatchObject({
      title: "Alive @ Five · Freddie Long",
      source_url:
        "https://downtownfrederick.org/vm-event/alive-five-conor-the-wild-hunt-americana-folk/",
      last_verified_at: "2026-08-13T20:38:00.000Z",
    });
  });

  it("drops a stale live performer row for the same recurring series, venue, and time", () => {
    const curated = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Freddie Long",
    );
    const staleLive = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five - Conor & the Wild Hunt",
      {
        is_recurring: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
      },
    );

    expect(dedupeLiveAgainstCurated([staleLive], [curated])).toEqual([]);
  });

  it("collapses two curated rows when the performer suffix conflicts", () => {
    const verified = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Freddie Long",
      { hero_image: "/images/alive.jpg", description: "Verified lineup." },
    );
    const stale = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five - Conor & the Wild Hunt",
      {
        is_recurring: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
      },
    );

    expect(dedupeCuratedClusters([verified, stale])).toEqual([verified]);
  });

  it("does not merge the same series name at another venue", () => {
    const downtown = event("summer-series-downtown", "Summer Series · Band A");
    const middletown = event("summer-series-middletown", "Summer Series · Band B", {
      venue_name: "Middletown Park",
      venue_place_slug: "middletown-park",
      geom: { lng: -77.5447, lat: 39.4437 },
      municipality: "middletown",
      municipality_name: "Middletown",
    });

    expect(dedupeCuratedClusters([downtown, middletown])).toHaveLength(2);
  });

  it("does not merge generic one-off titles", () => {
    const first = event("live-music-one", "Live Music · Band A", {
      is_recurring: false,
    });
    const second = event("live-music-two", "Live Music · Band B", {
      is_recurring: false,
    });

    expect(dedupeCuratedClusters([first, second])).toHaveLength(2);
  });
});
