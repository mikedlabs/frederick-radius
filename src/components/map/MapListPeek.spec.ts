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
    unavailable: false,
    scope: "county",
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

  it("keeps an immediate category fallback for places without an exact reviewed photo", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });

  it.each([
    ["new-market-historic-district-new-market", "/history-photos/new-market-antiques.jpg"],
    ["catoctin-mountain-park", "/history-photos/catoctin-mountain-park.jpg"],
  ])("uses the existing exact licensed registry photo for %s without a metadata request", (slug, image) => {
    const html = render({ list: list({ rows: [{ kind: "place", place: place(slug) }] }) });
    expect(html).toContain('data-has-photo-plan="true"');
    expect(html).toContain('data-photo-source="curated"');
    expect(html).toContain('data-photo-state="pending"');
    const src = html.match(/<img[^>]*src="([^"]+)"/)![1].replaceAll("&amp;", "&");
    const original = new URL(src, "https://frederickradius.app").searchParams.get("url") ?? src;
    expect(original).toBe(image);
    // Keep the credit footprint, without an accessible displayed-photo claim,
    // while the actual image is still awaiting decode.
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*inert=""[^>]*class="place-card-photo-credit/);
    expect(html).toContain("visibility:hidden");
  });

  it("does not bind generic scenery or automatically request supplied paid Google imagery", () => {
    const paidPlace = { ...place("new-market-coffee-shop"),
      google_photo_url: "/api/place-photo?name=places%2Fshop%2Fphotos%2Fhero&w=800",
      google_photo_attribution: { photo_name: "places/shop/photos/hero", authors: [{ display_name: "Real author" }], google_maps_uri: "https://www.google.com/maps/photos/shop" },
    };
    const html = render({ list: list({ rows: [{ kind: "place", place: paidPlace }] }) });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/api/place-photo");
    expect(html).toContain('data-photo-state="fallback"');
    expect(html).not.toContain("data-has-photo-plan");
    expect(html).toContain("Hours not confirmed");
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

  it("offers one scope-preserving search fallback when a query has no local answer", () => {
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
    expect(html).toContain('href="/search?q=tacos%20al%20pastor&amp;in=county"');
    expect(html).toContain("Search all of Radius");
  });

  it("offers every Radius listing only after the map's own list is exhausted", () => {
    const query = list({ askQuery: "cafe" });
    const paged = render({ list: query });
    expect(paged).toContain("Show 3 more places");
    expect(paged).not.toContain("Search all of Radius");

    const short = render({
      list: { ...query, rows: query.rows.slice(0, 3) },
    });
    expect(short).toContain("Search all of Radius");
    // A tile or category list stays on the map.
    expect(render({ list: list({ rows: query.rows.slice(0, 3) }) }))
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


it("shows unconfirmed hours on every row and distinguishes the selected strongest choice", () => {
  const html = render({ selectedPlaceSlug: "p0" });
  expect(html.match(/Hours not confirmed/g)).toHaveLength(5);
  expect(html).toContain('data-leading="true"');
  expect(html).toContain('aria-pressed="true"');
});

it("shows actionable verification failure without a zero-result claim", () => {
  const html = render({ list: list({ rows: [], unavailable: true }), onRetrySearch: () => {} });
  expect(html).toContain("Unable to verify the full search");
  expect(html).toContain("Try again");
  expect(html).not.toContain("Nothing here");
  expect(html).not.toContain("0 places");
});


it("keeps mixed query rank and legacy event evidence truthful", () => {
  const origin = "/map?q=community&in=county&area=county,-77.5,39.3,-77.3,39.5";
  const html = render({ mapReturnTo: origin, list: list({ unit: "result", rows: [
    { kind: "event-link", result: { type: "event", id: "event:legacy", title: "Legacy listing", subtitle: "Publisher venue · Oct 7", href: "/events/legacy" } },
    { kind: "place", place: place("actual") },
    { kind: "event", event: { slug: "loaded", title: "Loaded listing", starts_at: "2026-10-07T22:00:00Z", venue_name: "Actual venue", category: "community", lng: -77.41, lat: 39.414, source_label: "Actual publisher" } },
  ] }) });
  expect(html.indexOf("Legacy listing")).toBeLessThan(html.indexOf("Place actual"));
  expect(html.indexOf("Place actual")).toBeLessThan(html.indexOf("Loaded listing"));
  expect(html).toContain("3 results");
  expect(html).toContain("Publisher venue · Oct 7");
  expect(html).toContain("Listing from Actual publisher.");
  expect(html).toContain("Confirm with the organizer before you go.");
  expect(html).toContain('href="/events/legacy?returnTo=');
  expect(html).not.toContain("Time TBA");
});

it("uses the identical exact-origin handoff when empty or exhausted", () => {
  const origin = "/map?q=no-match&in=brunswick&c=-77.63,39.31,14&area=brunswick,-77.64,39.30,-77.61,39.33";
  const emptyHtml = render({ mapReturnTo: origin, list: list({ scope: "town:brunswick", rows: [], askQuery: "no-match" }) });
  const fullHtml = render({ mapReturnTo: origin, list: list({ scope: "town:brunswick", rows: [{ kind: "place", place: place("actual") }], askQuery: "no-match" }) });
  const href = (html: string) => html.match(/href="([^"]+)"[^>]*>Search all of Radius/)![1];
  expect(href(emptyHtml)).toBe(href(fullHtml));
  expect(href(emptyHtml)).toContain("returnTo=%2Fmap%3Fq%3Dno-match");
  expect(href(emptyHtml)).toContain("in=brunswick");
});
