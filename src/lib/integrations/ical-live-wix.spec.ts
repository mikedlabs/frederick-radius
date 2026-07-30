import { describe, expect, it } from "vitest";
import {
  collectWixEventRows,
  parseWixEventsHtml,
  type FeedSpec,
} from "./ical-live";

const FEED: FeedSpec = {
  source: "mdcc",
  source_label: "Maryland Deaf Community Center",
  url: "https://www.deafmdcc.org/events",
  format: "wix-html",
  default_venue: "Maryland Deaf Community Center",
  default_geom: { lng: -77.4025511, lat: 39.4238076 },
  default_municipality: "frederick",
  default_category: "community",
};

const NOW = new Date("2026-07-28T12:00:00.000Z");
const HORIZON = new Date("2026-10-26T12:00:00.000Z");
const FETCHED_AT = "2026-07-28T12:00:00.000Z";

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "545c580c-17db-4dbc-a17c-69b2a6a20879",
    title: "Ribbon-Cutting Ceremony",
    description: "Join the Maryland Deaf Community Center for opening day.",
    slug: "ribbon-cutting-ceremony",
    status: 0,
    scheduling: {
      config: {
        startDate: "2026-08-21T15:00:00.000Z",
        endDate: "2026-08-21T20:00:00.568Z",
      },
    },
    location: {
      name: "Maryland Deaf Community Center",
      coordinates: { lat: 39.4238076, lng: -77.4025511 },
      address: "720 N East St, Frederick, MD 21701, USA",
    },
    mainImage: {
      url: "https://static.wixstatic.com/media/6bde7e_opening.png",
    },
    registration: {
      ticketing: {
        lowestPrice: "$0",
      },
    },
    ...overrides,
  };
}

function htmlFor(data: unknown, idFirst = false): string {
  const attributes = idFirst
    ? 'id="wix-warmup-data" type="application/json"'
    : 'type="application/json" id="wix-warmup-data"';
  return `<html><script ${attributes}>${JSON.stringify(data)}</script></html>`;
}

describe("collectWixEventRows", () => {
  it("recursively collects object.events.events arrays and dedupes by event id", () => {
    const duplicate = event({ title: "Duplicate from calendar widget" });
    const unique = event({
      id: "future-2",
      title: "Deaf Fest",
      slug: "deaf-fest",
    });
    const rows = collectWixEventRows({
      appsWarmupData: {
        widgetA: { events: { events: [event(), unique] } },
        nested: {
          widgetB: { events: { events: [duplicate] } },
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual([
      "545c580c-17db-4dbc-a17c-69b2a6a20879",
      "future-2",
    ]);
    expect(rows[0]?.title).toBe("Ribbon-Cutting Ceremony");
  });
});

describe("parseWixEventsHtml", () => {
  it("maps first-party dates, venue geo, detail link, image, and ticket floor", () => {
    const events = parseWixEventsHtml(
      htmlFor({
        arbitraryComponentId: {
          events: { events: [event()] },
        },
      }),
      FEED,
      NOW,
      HORIZON,
      FETCHED_AT,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "mdcc:545c580c-17db-4dbc-a17c-69b2a6a20879",
      title: "Ribbon-Cutting Ceremony",
      starts_at: "2026-08-21T15:00:00.000Z",
      ends_at: "2026-08-21T20:00:00.568Z",
      venue_name: "Maryland Deaf Community Center",
      address: "720 N East St, Frederick, MD 21701, USA",
      geom: { lat: 39.4238076, lng: -77.4025511 },
      placement: "geocoded",
      source: "mdcc",
      source_label: "Maryland Deaf Community Center",
      organizer: "Maryland Deaf Community Center",
      category: "community",
      is_free: true,
      price_text: "$0",
      hero_image: "https://static.wixstatic.com/media/6bde7e_opening.png",
      status: "scheduled",
      last_verified_at: FETCHED_AT,
    });
    expect(events[0]?.url).toBe(
      "https://www.deafmdcc.org/event-details-registration/ribbon-cutting-ceremony",
    );
  });

  it("keeps an ongoing series, drops ended rows, and honors the horizon", () => {
    const ongoing = event({
      id: "ongoing",
      title: "Six-week ASL class",
      slug: "six-week-asl-class",
      status: 1,
      scheduling: {
        config: {
          startDate: "2026-07-14T22:00:00.000Z",
          endDate: "2026-08-18T23:00:00.000Z",
        },
      },
      registration: { ticketing: { lowestPrice: "$50" } },
    });
    const ended = event({
      id: "ended",
      title: "Past workshop",
      status: 2,
      scheduling: {
        config: {
          startDate: "2026-06-16T21:00:00.000Z",
          endDate: "2026-06-16T23:00:00.000Z",
        },
      },
    });
    const tooFar = event({
      id: "too-far",
      title: "Next year's gathering",
      scheduling: {
        config: {
          startDate: "2027-01-10T18:00:00.000Z",
          endDate: "2027-01-10T20:00:00.000Z",
        },
      },
    });
    const cancelled = event({
      id: "cancelled",
      title: "Community workshop",
      slug: "community-workshop",
      status: 3,
    });

    const events = parseWixEventsHtml(
      htmlFor(
        {
          current: { events: { events: [ongoing, cancelled] } },
          history: { events: { events: [ended, ongoing, tooFar] } },
        },
        true,
      ),
      FEED,
      NOW,
      HORIZON,
      FETCHED_AT,
    );

    expect(events.map((item) => item.id)).toEqual([
      "mdcc:ongoing",
      "mdcc:cancelled",
    ]);
    expect(events[0]?.is_free).toBe(false);
    expect(events[0]?.price_text).toBe("$50");
    expect(events[1]?.status).toBe("cancelled");
  });

  it("uses the official center coordinate when an event has no usable point", () => {
    const [mapped] = parseWixEventsHtml(
      htmlFor({
        widget: {
          events: {
            events: [
              event({
                id: "no-coordinates",
                location: {
                  name: "Maryland Deaf Community Center",
                  fullAddress: {
                    formattedAddress:
                      "720 N East St, Frederick, MD 21701, USA",
                  },
                },
              }),
            ],
          },
        },
      }),
      FEED,
      NOW,
      HORIZON,
      FETCHED_AT,
    );

    expect(mapped?.geom).toEqual(FEED.default_geom);
    expect(mapped?.placement).toBeUndefined();
  });

  it.each([
    "http://static.wixstatic.com/media/6bde7e_opening.png",
    "https://static.wixstatic.com:444/media/6bde7e_opening.png",
    "https://static.wixstatic.com/not-media/6bde7e_opening.png",
    "https://example.com/media/6bde7e_opening.png",
  ])("drops a Wix image outside the exact approved media policy", (url) => {
    const [mapped] = parseWixEventsHtml(
      htmlFor({
        widget: {
          events: {
            events: [
              event({
                id: `unsafe-image-${encodeURIComponent(url)}`,
                mainImage: { url },
              }),
            ],
          },
        },
      }),
      FEED,
      NOW,
      HORIZON,
      FETCHED_AT,
    );

    expect(mapped).toBeDefined();
    expect(mapped?.hero_image).toBeUndefined();
  });

  it("fails clearly when Wix removes or corrupts the warmup payload", () => {
    expect(() =>
      parseWixEventsHtml(
        "<html></html>",
        FEED,
        NOW,
        HORIZON,
        FETCHED_AT,
      ),
    ).toThrow("wix-warmup-data script missing");
    expect(() =>
      parseWixEventsHtml(
        '<script id="wix-warmup-data">{broken</script>',
        FEED,
        NOW,
        HORIZON,
        FETCHED_AT,
      ),
    ).toThrow("invalid JSON");
  });
});
