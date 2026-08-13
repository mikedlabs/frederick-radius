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
    source: "dfp",
    is_verified: true,
    source_url: null,
    last_verified_at: null,
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
      { last_verified_at: "2026-08-13T20:38:00.000Z" },
    );
    const staleLive = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five - Conor & the Wild Hunt",
      {
        is_recurring: false,
        is_verified: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
        venue_place_slug: undefined,
        last_verified_at: "2026-08-12T16:33:21.000Z",
      },
    );

    expect(dedupeLiveAgainstCurated([staleLive], [curated])).toEqual([]);
  });

  it("collapses two curated rows when the performer suffix conflicts", () => {
    const verified = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Freddie Long",
      {
        hero_image: "/images/alive.jpg",
        description: "Verified lineup.",
        last_verified_at: "2026-08-13T20:38:00.000Z",
      },
    );
    const stale = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five - Conor & the Wild Hunt",
      {
        is_recurring: false,
        is_verified: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
        venue_place_slug: undefined,
        last_verified_at: "2026-08-12T16:33:21.000Z",
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

  it("keeps distinct recurring sessions more than five minutes apart", () => {
    const babies = event("storytime-babies", "Storytime · Babies", {
      starts_at: "2026-08-13T14:00:00.000Z",
    });
    const preschool = event("storytime-preschool", "Storytime · Preschool", {
      starts_at: "2026-08-13T14:30:00.000Z",
    });

    expect(dedupeCuratedClusters([babies, preschool])).toHaveLength(2);
  });

  it("prefers a newer editorial correction over a richer stale card", () => {
    const stale = event("summer-series-stale", "Summer Series · Old Act", {
      last_verified_at: "2026-08-12T12:00:00.000Z",
      hero_image: "/images/stale.jpg",
      description: "A richer but stale description.",
    });
    const current = event("summer-series-current", "Summer Series · New Act", {
      last_verified_at: "2026-08-13T12:00:00.000Z",
      description: "",
      is_recurring: false,
      venue_place_slug: undefined,
    });

    expect(dedupeCuratedClusters([stale, current])).toEqual([current]);
  });

  it("does not mistake a newer live fetch for a publisher correction", () => {
    const corrected = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Freddie Long",
      { last_verified_at: "2026-08-13T20:38:00.000Z" },
    );
    const staleButFetchedLater = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five - Conor & the Wild Hunt",
      {
        is_recurring: false,
        is_verified: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
        venue_place_slug: undefined,
        last_verified_at: "2026-08-13T21:00:00.000Z",
      },
    );

    expect(
      dedupeLiveAgainstCurated([staleButFetchedLater], [corrected]),
    ).toEqual([]);
    expect(
      dedupeCuratedClusters([corrected, staleButFetchedLater]),
    ).toEqual([corrected]);
  });
});
