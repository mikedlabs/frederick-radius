import { describe, expect, it } from "vitest";

import { EVENT_BY_SLUG } from "@/data/events";
import type { EventWithMeta } from "./events";
import {
  applyOfficialPublisherUpdates,
  dedupeCuratedClusters,
  dedupeLiveAgainstCurated,
} from "./events";

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

  it("applies a newer DFP structured lineup edit without losing Radius details", () => {
    const curated = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Conor & the Wild Hunt",
      {
        description:
          "Conor & the Wild Hunt headlines Alive @ Five. Season announcement copy.",
        info: { admission: "$5 cash at the gate." },
        source_url:
          "https://downtownfrederick.org/vm-event/alive-five-conor-the-wild-hunt-americana-folk/",
        last_verified_at: "2026-07-01T12:00:00.000Z",
      },
    );
    const publisher = event(
      "alive-five-freddie-long-2026-08-13",
      "Alive @ Five – Freddie Long",
      {
        description: "Music: Freddie Long. Food: Sabor de Cuba and In10se BBQ.",
        is_recurring: false,
        is_verified: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
        venue_place_slug: undefined,
        source_url: "https://downtownfrederick.org/aliveatfive/",
        last_verified_at: "2026-08-13T20:00:00.000Z",
        publisher_updated_at: "2026-08-12T16:33:21.000Z",
      },
    );

    const [updated] = applyOfficialPublisherUpdates([curated], [publisher]);
    expect(updated).toMatchObject({
      slug: curated.slug,
      title: "Alive @ Five – Freddie Long",
      description:
        "Freddie Long headlines Alive @ Five. Season announcement copy.",
      info: curated.info,
      source_url: curated.source_url,
      last_verified_at: "2026-08-12T16:33:21.000Z",
      publisher_updated_at: "2026-08-12T16:33:21.000Z",
    });
  });

  it("keeps a newer human correction over an older publisher edit", () => {
    const curated = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Freddie Long",
      { last_verified_at: "2026-08-13T20:38:00.000Z" },
    );
    const stalePublisher = event(
      "alive-five-conor-wild-hunt-2026-08-13",
      "Alive @ Five – Conor & the Wild Hunt",
      {
        is_recurring: false,
        is_verified: false,
        venue_name: "Carroll Creek Outdoor Amphitheater",
        venue_place_slug: undefined,
        publisher_updated_at: "2026-08-12T16:33:21.000Z",
      },
    );

    expect(
      applyOfficialPublisherUpdates([curated], [stalePublisher]),
    ).toEqual([curated]);
  });

  it("applies a unique same-day time and venue move but preserves Radius classification", () => {
    const curated = event("summer-series", "Summer Series · Old Act", {
      last_verified_at: "2026-08-01T12:00:00.000Z",
      category: "music",
      municipality: "frederick",
    });
    const moved = event("summer-series-new", "Summer Series · New Act", {
      starts_at: "2026-08-13T22:00:00.000Z",
      ends_at: "2026-08-14T01:00:00.000Z",
      venue_name: "Baker Park Bandshell",
      venue_place_slug: undefined,
      address: "121 N Bentz St, Frederick, MD 21701",
      is_recurring: false,
      is_verified: false,
      category: "community",
      category_name: "Community",
      municipality: "walkersville",
      municipality_name: "Walkersville",
      publisher_updated_at: "2026-08-13T16:00:00.000Z",
    });

    const [updated] = applyOfficialPublisherUpdates([curated], [moved]);
    expect(updated).toMatchObject({
      title: moved.title,
      starts_at: moved.starts_at,
      venue_name: moved.venue_name,
      category: "music",
      category_name: curated.category_name,
      municipality: "frederick",
      municipality_name: curated.municipality_name,
    });
    expect(updated.venue_place_slug).toBeUndefined();
  });

  it("removes a stale performer sentence when punctuation differs", () => {
    const curated = event(
      "alive-at-five-2026-08-13",
      "Alive @ Five · Conor & the Wild Hunt",
      {
        description:
          "CONOR AND THE WILD HUNT headlines Alive @ Five. Admission is $5 cash.",
        last_verified_at: "2026-07-01T12:00:00.000Z",
      },
    );
    const publisher = event("alive-five-freddie", "Alive @ Five – Freddie Long", {
      is_recurring: false,
      is_verified: false,
      publisher_updated_at: "2026-08-12T16:33:21.000Z",
    });

    const [updated] = applyOfficialPublisherUpdates([curated], [publisher]);
    expect(updated.description).toBe(
      "Freddie Long headlines Alive @ Five. Admission is $5 cash.",
    );
    expect(updated.description).not.toMatch(/conor/i);
  });

  it("does not guess between multiple same-series sessions on one day", () => {
    const curated = event("storytime", "Storytime Series · Babies", {
      starts_at: "2026-08-13T14:00:00.000Z",
      last_verified_at: "2026-08-01T12:00:00.000Z",
    });
    const candidate = (slug: string, title: string, starts_at: string) =>
      event(slug, title, {
        starts_at,
        venue_name: "Another Venue",
        venue_place_slug: undefined,
        is_recurring: false,
        is_verified: false,
        publisher_updated_at: "2026-08-12T16:33:21.000Z",
      });

    expect(
      applyOfficialPublisherUpdates(
        [curated],
        [
          candidate("storytime-a", "Storytime Series · Toddlers", "2026-08-13T15:00:00.000Z"),
          candidate("storytime-b", "Storytime Series · Preschool", "2026-08-13T16:00:00.000Z"),
        ],
      ),
    ).toEqual([curated]);
  });

  it("does not apply one live session to two curated sessions", () => {
    const first = event("storytime-babies", "Storytime Series · Babies", {
      starts_at: "2026-08-13T14:00:00.000Z",
      last_verified_at: "2026-08-01T12:00:00.000Z",
    });
    const second = event("storytime-preschool", "Storytime Series · Preschool", {
      starts_at: "2026-08-13T16:00:00.000Z",
      last_verified_at: "2026-08-01T12:00:00.000Z",
    });
    const publisher = event("storytime-current", "Storytime Series · Updated", {
      starts_at: "2026-08-13T15:00:00.000Z",
      venue_name: "Another Venue",
      venue_place_slug: undefined,
      is_recurring: false,
      is_verified: false,
      publisher_updated_at: "2026-08-12T16:33:21.000Z",
    });

    expect(
      applyOfficialPublisherUpdates([first, second], [publisher]),
    ).toEqual([first, second]);
  });

  it("matches an opening-night title to the base publisher series", () => {
    const curated = event(
      "alive-opening",
      "Alive @ Five: Opening Night · Old Act",
      {
        description: "Old Act headlines Alive @ Five. Admission is $5 cash.",
        last_verified_at: "2026-08-01T12:00:00.000Z",
      },
    );
    const publisher = event("alive-current", "Alive @ Five – New Act", {
      is_recurring: false,
      is_verified: false,
      publisher_updated_at: "2026-08-12T16:33:21.000Z",
    });

    expect(applyOfficialPublisherUpdates([curated], [publisher])[0]).toMatchObject({
      title: "Alive @ Five – New Act",
      description: "New Act headlines Alive @ Five. Admission is $5 cash.",
    });
  });
});
