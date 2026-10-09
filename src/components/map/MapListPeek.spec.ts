import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapListPeek, { eventTimePlate } from "./MapListPeek";
import type { MapTaskList } from "./mapListTask";
import type { EventPin, MapPinPlace } from "./types";

function place(slug: string, overrides: Partial<MapPinPlace> = {}): MapPinPlace {
  return {
    slug,
    name: `Place ${slug}`,
    category: "coffee",
    subcategories: [],
    geom: { lng: -77.41, lat: 39.414 },
    open_status: { state: "unknown" },
    source: "manual",
    is_verified: false,
    municipality: "frederick",
    short_blurb: "",
    ...overrides,
  } as MapPinPlace;
}

function list(overrides: Partial<MapTaskList> = {}): MapTaskList {
  return {
    key: "task:coffee",
    title: "Coffee · Whole county",
    note: null,
    rows: Array.from({ length: 8 }, (_, index) => ({
      kind: "place" as const,
      place: place(`p${index}`),
    })),
    unit: "place",
    pending: false,
    empty: { title: "Nothing here matches this view.", copy: "Choose another view or reset the map." },
    askQuery: null,
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof MapListPeek>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MapListPeek, {
      list: list(),
      expanded: true,
      onExpandedChange: () => {},
      userLoc: null,
      onPickPlace: () => {},
      onPickEvent: () => {},
      ...props,
    }),
  );
}

describe("MapListPeek", () => {
  it("shows five ranked rows and offers the rest with Show more", () => {
    const html = render();
    expect(html.match(/data-map-list-place=/g)).toHaveLength(5);
    expect(html).toContain("Show 3 more places");
    expect(html).toContain("Coffee · Whole county");
    expect(html).toContain('aria-expanded="true"');
  });

  it("never measures from the map center and only says distance with a real fix", () => {
    const withoutFix = render();
    expect(withoutFix).not.toMatch(/map center/i);
    expect(withoutFix).not.toContain("from you");

    const withFix = render({ userLoc: { lng: -77.42, lat: 39.414 } });
    expect(withFix).toContain("from you");
  });

  it("leads every place row with the category mark, not a photo", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });

  it("collapses to its title so the map stays readable", () => {
    const html = render({ expanded: false });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div[^>]*hidden=""/);
  });

  it("says it is searching instead of claiming there are no matches", () => {
    const html = render({ list: list({ rows: [], pending: true }) });
    expect(html).toContain("Searching Radius…");
    expect(html).not.toContain("Nothing");
  });

  it("offers one Ask fallback when a query has no local answer", () => {
    const html = render({
      list: list({
        rows: [],
        askQuery: "tacos al pastor",
        empty: {
          title: "Nothing on this map matches “tacos al pastor.”",
          copy: "Radius can still search every listing and event for it.",
        },
      }),
    });
    expect(html).toContain("Nothing on this map matches");
    expect(html).toContain('href="/ask?q=tacos%20al%20pastor"');
    expect(html).toContain("Ask Radius about “tacos al pastor”");
  });

  it("offers every Radius listing only after the map's own list is exhausted", () => {
    const query = list({ askQuery: "cafe" });
    const paged = render({ list: query, onSearchAll: () => {} });
    expect(paged).toContain("Show 3 more places");
    expect(paged).not.toContain("Search all of Radius");

    const short = render({
      list: { ...query, rows: query.rows.slice(0, 3) },
      onSearchAll: () => {},
    });
    expect(short).toContain("Search all of Radius");
    // A tile or category list stays on the map.
    expect(render({ list: list({ rows: query.rows.slice(0, 3) }), onSearchAll: () => {} }))
      .not.toContain("Search all of Radius");
  });

  it("leads event rows with a time plate", () => {
    const event: EventPin = {
      slug: "trivia",
      title: "Trivia Night",
      starts_at: "2026-10-07T22:30:00Z",
      venue_name: "Rockwell Brewery",
      lng: -77.41,
      lat: 39.414,
      category: "community",
    };
    const html = render({
      list: list({ unit: "event", rows: [{ kind: "event", event }] }),
    });
    expect(html).toContain("Trivia Night");
    expect(html).toContain("6:30");
    expect(html).toContain("PM");
    expect(eventTimePlate({ starts_at: event.starts_at, is_all_day: true })).toEqual({
      time: "All",
      period: "day",
    });
  });
});
