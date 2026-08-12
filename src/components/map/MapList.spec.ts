import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapList, {
  rankMapFallbackPlaces,
  rankMapListEvents,
  rankMapListPlaces,
} from "./MapList";
import { createMapListPhotoLoader } from "./map-list-photo-loader";
import type { EventPin, MapPinPlace } from "./types";

function place(slug: string, lng: number): MapPinPlace {
  return {
    slug,
    name: slug,
    category: "restaurants",
    subcategories: [],
    geom: { lng, lat: 39.4 },
    open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    source: "manual",
    is_verified: true,
    municipality: "frederick",
    short_blurb: "A test place.",
  };
}

function event(slug: string, startsAt: string, lng: number): EventPin {
  return {
    slug,
    title: slug,
    starts_at: startsAt,
    venue_name: "Test venue",
    lng,
    lat: 39.4,
    category: "community",
  };
}

describe("rankMapListPlaces", () => {
  it("ranks from the visible map origin when no device fix is available", () => {
    const rows = rankMapListPlaces(
      [place("west", -77.7), place("center", -77.4), place("east", -77.1)],
      { lng: -77.12, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["east", "center", "west"]);
  });

  it("keeps the result cap after spatial ranking", () => {
    const rows = rankMapListPlaces(
      [place("far", -77.7), place("near", -77.2), place("middle", -77.4)],
      { lng: -77.2, lat: 39.4 },
      2,
    );

    expect(rows.map((row) => row.slug)).toEqual(["near", "middle"]);
  });
});

describe("rankMapFallbackPlaces", () => {
  it("bounds the recovery surface and prevents one category from taking over", () => {
    const restaurants = Array.from({ length: 14 }, (_, index) => ({
      ...place(`restaurant-${index}`, -77.4 - index * 0.001),
      category: "restaurant",
    }));
    const other = [
      { ...place("park", -77.5), category: "park" },
      { ...place("coffee", -77.51), category: "coffee" },
      { ...place("museum", -77.52), category: "museum" },
      { ...place("gallery", -77.53), category: "gallery" },
      { ...place("library", -77.54), category: "library" },
    ];
    const rows = rankMapFallbackPlaces([...restaurants, ...other], null, 6);

    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.category === "restaurant")).toHaveLength(2);
    expect(new Set(rows.map((row) => row.category)).size).toBeGreaterThan(1);
  });
});

describe("rankMapListEvents", () => {
  it("puts the sooner event first even when a later event is closer", () => {
    const rows = rankMapListEvents(
      [
        event("later-nearby", "2026-07-23T00:00:00.000Z", -77.2),
        event("sooner-farther", "2026-07-22T23:00:00.000Z", -77.4),
      ],
      { lng: -77.2, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["sooner-farther", "later-nearby"]);
  });

  it("uses distance to break a start-time tie", () => {
    const rows = rankMapListEvents(
      [
        event("far", "2026-07-22T23:00:00.000Z", -77.5),
        event("near", "2026-07-22T23:00:00.000Z", -77.21),
      ],
      { lng: -77.2, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["near", "far"]);
  });
});

describe("map list photos", () => {
  it("uses an inline photo when a full place record already carries one", () => {
    const withPhoto = {
      ...place("photo-place", -77.4),
      google_photo_url: "/api/place-photo?name=photo-place",
    } as MapPinPlace;
    const html = renderToStaticMarkup(
      createElement(MapList, {
        places: [withPhoto],
        events: [],
        userLoc: null,
        sortOrigin: { lng: -77.4, lat: 39.4 },
        onPick: () => undefined,
        onPickEvent: () => undefined,
      }),
    );

    expect(html).toContain('data-photo-state="ready"');
    expect(html).toContain("/api/place-photo?name=photo-place");
  });

  it("batches, deduplicates, and caches visible-row photo requests", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: string) => {
      requests.push(input);
      return {
        ok: true,
        json: async () => ({
          places: [
            {
              slug: "one",
              google_photo_url: "/api/place-photo?name=one",
            },
            { slug: "two" },
          ],
        }),
      };
    });
    const loader = createMapListPhotoLoader({
      fetcher,
      batchDelayMs: 60_000,
    });

    const one = loader.load("one");
    const oneAgain = loader.load("one");
    const two = loader.load("two");
    expect(oneAgain).toBe(one);

    await loader.flush();

    expect(requests).toHaveLength(1);
    const requestUrl = new URL(requests[0], "https://frederickradius.app");
    expect(requestUrl.searchParams.get("slugs")).toBe("one,two");
    await expect(one).resolves.toBe("/api/place-photo?name=one");
    await expect(two).resolves.toBeNull();

    await expect(loader.load("one")).resolves.toBe(
      "/api/place-photo?name=one",
    );
    await expect(loader.load("two")).resolves.toBeNull();
    await loader.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("map list recovery copy", () => {
  it("does not refer to hidden map controls when the map failed", () => {
    const html = renderToStaticMarkup(
      createElement(MapList, {
        places: [],
        events: [],
        userLoc: null,
        failureMode: true,
        onPick: () => undefined,
        onPickEvent: () => undefined,
      }),
    );

    expect(html).toContain("No fallback results are available");
    expect(html).toContain("Reload the map or use the page navigation");
    expect(html).not.toContain("in this view");
    expect(html).not.toContain("filter in the dock");
    expect(html).not.toContain("switch back to the map");
  });
});
