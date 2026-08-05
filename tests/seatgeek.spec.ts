/**
 * normalizeSeatGeek: the parse boundary for SeatGeek area-discovery
 * events. The contract that matters is the same as the other ticketed
 * feeds: it surfaces only what SeatGeek actually returns and drops
 * anything it cannot place (no datetime, no venue coordinates, outside
 * Frederick County), so a fabricated or unplaceable row can never reach
 * the live-events spine.
 */
import { describe, it, expect } from "vitest";
import { normalizeSeatGeek } from "@/lib/integrations/seatgeek";
import { stampEventProvenance } from "@/lib/provenance";

function sgEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 12345,
    title: "The Local Band",
    url: "https://seatgeek.com/e/12345",
    datetime_utc: "2026-06-01T23:00:00Z",
    datetime_local: "2026-06-01T19:00:00",
    stats: { lowest_price: 25 },
    taxonomies: [{ name: "concert" }],
    venue: {
      name: "Sky Stage",
      city: "Frederick",
      address: "59 S Carroll St",
      // Downtown Frederick, inside the county bbox.
      location: { lat: 39.4143, lon: -77.4105 },
    },
    ...over,
  };
}
const wrap = (events: unknown[]) => ({ events });

describe("normalizeSeatGeek", () => {
  it("normalizes a well-formed in-county event", () => {
    const out = normalizeSeatGeek(wrap([sgEvent()]));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sg-12345");
    expect(out[0].title).toBe("The Local Band");
    expect(out[0].source).toBe("seatgeek");
    expect(out[0].category).toBe("music");
    expect(out[0].municipality).toBe("frederick");
    expect(out[0].geom).toEqual({ lng: -77.4105, lat: 39.4143 });
  });

  it("drops events with no datetime, no coordinates, or no title", () => {
    expect(normalizeSeatGeek(wrap([sgEvent({ datetime_utc: undefined, datetime_local: undefined })]))).toHaveLength(0);
    expect(normalizeSeatGeek(wrap([sgEvent({ venue: { name: "x", location: {} } })]))).toHaveLength(0);
    expect(normalizeSeatGeek(wrap([sgEvent({ title: undefined })]))).toHaveLength(0);
  });

  it("drops out-of-county coordinates", () => {
    // Baltimore, well outside the county bbox.
    const out = normalizeSeatGeek(wrap([sgEvent({ venue: { name: "x", city: "Baltimore", location: { lat: 39.29, lon: -76.61 } } })]));
    expect(out).toHaveLength(0);
  });

  it("maps taxonomies; music only when SeatGeek says concert/music, else community", () => {
    expect(normalizeSeatGeek(wrap([sgEvent({ taxonomies: [{ name: "theater" }] })]))[0].category).toBe("theater");
    expect(normalizeSeatGeek(wrap([sgEvent({ taxonomies: [{ name: "comedy" }] })]))[0].category).toBe("theater");
    expect(normalizeSeatGeek(wrap([sgEvent({ taxonomies: [{ name: "sports" }] })]))[0].category).toBe("sports");
    expect(normalizeSeatGeek(wrap([sgEvent({ taxonomies: [{ name: "concert" }] })]))[0].category).toBe("music");
    // The old music fallback stamped SeatGeek's community listings
    // (rec-center classes) as concerts and they rendered on the
    // live-music radar (2026-07-17). Unknown taxonomies are community.
    expect(normalizeSeatGeek(wrap([sgEvent({ taxonomies: [] })]))[0].category).toBe("community");
  });

  it("only an explicit zero lowest_price reads as free", () => {
    expect(normalizeSeatGeek(wrap([sgEvent({ stats: { lowest_price: 0 } })]))[0].is_free).toBe(true);
    expect(normalizeSeatGeek(wrap([sgEvent({ stats: { lowest_price: null } })]))[0].is_free).toBe(false);
    expect(normalizeSeatGeek(wrap([sgEvent({ stats: {} })]))[0].is_free).toBe(false);
  });

  it("returns [] for a malformed payload, never throws", () => {
    expect(normalizeSeatGeek(null)).toEqual([]);
    expect(normalizeSeatGeek({})).toEqual([]);
    expect(normalizeSeatGeek({ events: "nope" })).toEqual([]);
  });

  it("stamps at the verified tier through provenance (ticketed listing)", () => {
    expect(stampEventProvenance({ slug: "x", source: "seatgeek" }).confidence).toBe("verified");
  });
});

describe("SeatGeek lineup description", () => {
  it("names the performers the title does not already carry", () => {
    const out = normalizeSeatGeek(
      wrap([
        sgEvent({
          performers: [
            { name: "The Local Band", primary: true },
            { name: "The Opener" },
            { name: "Second Support" },
          ],
        }),
      ]),
    );
    expect(out[0].description).toBe("With The Opener, Second Support.");
  });

  it("stays empty when the title already names the whole bill", () => {
    const out = normalizeSeatGeek(
      wrap([
        sgEvent({
          title: "The Local Band with The Opener",
          performers: [{ name: "The Local Band" }, { name: "The Opener" }],
        }),
      ]),
    );
    expect(out[0].description).toBe("");
  });
});
