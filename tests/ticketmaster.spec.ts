/**
 * normalizeTicketmaster: the parse boundary for Ticketmaster Discovery
 * live-music events. The contract that matters is that it surfaces only
 * what Ticketmaster actually returns and drops anything it cannot place
 * (no start time, no venue coordinates, outside Frederick County), so a
 * fabricated or unplaceable row can never reach the live-events spine.
 */
import { describe, it, expect } from "vitest";
import { normalizeTicketmaster, ticketFloorText, pickTmImage, allowedEventImage } from "@/lib/integrations/ticketmaster";

// A well-formed Discovery event, shaped like the real payload. `over`
// shallow-overrides top-level keys for the negative cases below.
function tmEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "G5v1",
    name: "The Local Band at Sky Stage",
    url: "https://www.ticketmaster.com/event/G5v1",
    dates: { start: { dateTime: "2026-06-01T23:00:00Z" } },
    priceRanges: [{ min: 25 }],
    _embedded: {
      venues: [
        {
          name: "Sky Stage",
          address: { line1: "59 S Carroll St" },
          city: { name: "Frederick" },
          // Downtown Frederick, inside the county bbox.
          location: { latitude: "39.4143", longitude: "-77.4105" },
        },
      ],
    },
    ...over,
  };
}

const wrap = (events: unknown[]) => ({ _embedded: { events } });

describe("normalizeTicketmaster", () => {
  it("normalizes a well-formed in-county music event", () => {
    const out = normalizeTicketmaster(wrap([tmEvent()]));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("tm-G5v1");
    expect(out[0].title).toBe("The Local Band at Sky Stage");
    expect(out[0].starts_at).toBe("2026-06-01T23:00:00Z");
    expect(out[0].venue_name).toBe("Sky Stage");
    expect(out[0].category).toBe("music");
    expect(out[0].source).toBe("ticketmaster");
    expect(out[0].is_free).toBe(false);
  });

  it("marks a zero-price event as free", () => {
    const out = normalizeTicketmaster(wrap([tmEvent({ priceRanges: [{ min: 0 }] })]));
    expect(out).toHaveLength(1);
    expect(out[0].is_free).toBe(true);
  });

  it("derives municipality from the venue city, not coarse coordinates", () => {
    // Coordinates sit on the Walkersville centroid, but the venue's
    // editorial city is Frederick, so the city name must win.
    const ev = tmEvent({
      _embedded: {
        venues: [
          {
            name: "Weinberg Center for the Arts",
            city: { name: "Frederick" },
            location: { latitude: "39.4853", longitude: "-77.3527" },
          },
        ],
      },
    });
    expect(normalizeTicketmaster(wrap([ev]))[0].municipality).toBe("frederick");
  });

  it("drops an event with no start time, never fabricating one", () => {
    const noTime = tmEvent({ dates: { start: { localDate: "2026-06-01" } } });
    expect(normalizeTicketmaster(wrap([noTime]))).toHaveLength(0);
  });

  it("drops an event whose venue is outside Frederick County", () => {
    const farAway = tmEvent({
      _embedded: {
        venues: [
          { name: "Madison Square Garden", location: { latitude: "40.7505", longitude: "-73.9934" } },
        ],
      },
    });
    expect(normalizeTicketmaster(wrap([farAway]))).toHaveLength(0);
  });

  it("drops an event with no usable venue coordinates", () => {
    const noCoords = tmEvent({ _embedded: { venues: [{ name: "TBA" }] } });
    expect(normalizeTicketmaster(wrap([noCoords]))).toHaveLength(0);
  });

  it("drops events missing an id or a name", () => {
    expect(normalizeTicketmaster(wrap([tmEvent({ id: undefined })]))).toHaveLength(0);
    expect(normalizeTicketmaster(wrap([tmEvent({ name: undefined })]))).toHaveLength(0);
  });

  it("returns [] for empty or malformed input", () => {
    expect(normalizeTicketmaster(null)).toEqual([]);
    expect(normalizeTicketmaster({})).toEqual([]);
    expect(normalizeTicketmaster(wrap([]))).toEqual([]);
    expect(normalizeTicketmaster({ _embedded: { events: "nope" } })).toEqual([]);
  });
});

describe("ticketFloorText + pickTmImage (2026-07-17 unused-data audit)", () => {
  it("formats a real ticket floor and refuses zero/absent", () => {
    expect(ticketFloorText(28)).toBe("From $28");
    expect(ticketFloorText(28.5)).toBe("From $28.50");
    expect(ticketFloorText(0)).toBeUndefined();
    expect(ticketFloorText(undefined)).toBeUndefined();
  });

  it("prefers a 16:9 image near card width, falls back to widest", () => {
    const tm = (n: string) => `https://s1.ticketm.net/${n}`;
    expect(
      pickTmImage([
        { url: tm("small.jpg"), width: 100, ratio: "16_9" },
        { url: tm("right.jpg"), width: 640, ratio: "16_9" },
        { url: tm("huge.jpg"), width: 2048, ratio: "16_9" },
      ]),
    ).toBe(tm("right.jpg"));
    expect(pickTmImage([{ url: tm("square.jpg"), width: 640, ratio: "1_1" }])).toBe(tm("square.jpg"));
    expect(pickTmImage([])).toBeUndefined();
    expect(pickTmImage(undefined)).toBeUndefined();
  });

  it("drops images from hosts next.config does not allowlist (no 500s)", () => {
    expect(pickTmImage([{ url: "https://evil.example.com/x.jpg", width: 640, ratio: "16_9" }])).toBeUndefined();
    expect(allowedEventImage("http://s1.ticketm.net/insecure.jpg")).toBeUndefined();
    expect(allowedEventImage("https://seatgeek.com/images/performers/a.jpg")).toBe(
      "https://seatgeek.com/images/performers/a.jpg",
    );
  });
});

describe("tmDescription", () => {
  it("joins the editorial blurb, logistics note, and support lineup as sentences", () => {
    const out = normalizeTicketmaster(
      wrap([
        tmEvent({
          info: "An evening of original songs.",
          pleaseNote: "Doors at 7 PM.",
          _embedded: {
            venues: [
              {
                name: "Sky Stage",
                city: { name: "Frederick" },
                location: { latitude: "39.4143", longitude: "-77.4105" },
              },
            ],
            attractions: [
              { name: "The Local Band" },
              { name: "The Opener" },
              { name: "Second Support" },
            ],
          },
        }),
      ]),
    );
    expect(out[0].description).toBe(
      "An evening of original songs. Doors at 7 PM. With The Opener, Second Support.",
    );
  });

  it("stays empty when the promoter wrote nothing and the bill is one act", () => {
    const out = normalizeTicketmaster(wrap([tmEvent()]));
    expect(out[0].description).toBe("");
  });

  it("never repeats the headliner as its own support act", () => {
    const out = normalizeTicketmaster(
      wrap([
        tmEvent({
          _embedded: {
            venues: [
              {
                name: "Sky Stage",
                city: { name: "Frederick" },
                location: { latitude: "39.4143", longitude: "-77.4105" },
              },
            ],
            attractions: [{ name: "The Local Band" }],
          },
        }),
      ]),
    );
    expect(out[0].description).toBe("");
  });
});
