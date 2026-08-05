import { describe, it, expect } from "vitest";
import { normalizeTicketmaster } from "@/lib/integrations/ticketmaster";
import { normalizeBandsintown } from "@/lib/integrations/bandsintown";

// Frederick ~ 39.41,-77.41 (in county). 39.29,-76.61 = Baltimore (out).

describe("normalizeTicketmaster", () => {
  const raw = {
    _embedded: {
      events: [
        {
          id: "abc",
          name: "Some Band Live",
          url: "https://tm/abc",
          dates: { start: { dateTime: "2026-06-01T23:00:00Z" } },
          priceRanges: [{ min: 25 }],
          _embedded: { venues: [{ name: "Olde Mother Brewing", address: { line1: "526 N Market St" }, location: { latitude: "39.4189", longitude: "-77.4103" } }] },
        },
        {
          id: "out",
          name: "Baltimore Show",
          dates: { start: { dateTime: "2026-06-02T23:00:00Z" } },
          _embedded: { venues: [{ name: "Bmore", location: { latitude: "39.2904", longitude: "-76.6122" } }] },
        },
        { id: "nodate", name: "No Time", _embedded: { venues: [{ location: { latitude: "39.41", longitude: "-77.41" } }] } },
      ],
    },
  };

  it("keeps in-county music shows with a real time, shaped as LiveEvent", () => {
    const out = normalizeTicketmaster(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "tm-abc",
      title: "Some Band Live",
      category: "music",
      source: "ticketmaster",
      venue_name: "Olde Mother Brewing",
      municipality: "frederick",
      is_free: false,
    });
    expect(out[0].starts_at).toBe("2026-06-01T23:00:00Z");
  });

  it("drops out-of-county and timeless events (no fabrication)", () => {
    expect(normalizeTicketmaster(raw).map((e) => e.id)).toEqual(["tm-abc"]);
  });

  it("returns [] for junk input", () => {
    expect(normalizeTicketmaster(null)).toEqual([]);
    expect(normalizeTicketmaster({})).toEqual([]);
  });
});

describe("normalizeBandsintown", () => {
  it("maps an artist's in-county show to LiveEvent", () => {
    const raw = [
      { id: "9", url: "https://bit/9", datetime: "2026-07-04T20:00:00", venue: { name: "Sky Stage", latitude: 39.414, longitude: -77.41, city: "Frederick" } },
      { id: "x", datetime: "2026-07-05T20:00:00", venue: { name: "NYC", latitude: 40.71, longitude: -74.0 } },
    ];
    const out = normalizeBandsintown(raw, "Local Act");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "bit-9", title: "Local Act", source: "bandsintown", category: "music", venue_name: "Sky Stage" });
  });

  it("returns [] for junk / non-array", () => {
    expect(normalizeBandsintown(null, "A")).toEqual([]);
    expect(normalizeBandsintown({}, "A")).toEqual([]);
  });
});

describe("Bandsintown description", () => {
  const bitShow = (over: Record<string, unknown> = {}) => ({
    id: "111",
    url: "https://bandsintown.com/e/111",
    datetime: "2026-06-01T23:00:00",
    venue: { name: "Sky Stage", latitude: 39.4143, longitude: -77.4105, city: "Frederick" },
    ...over,
  });

  it("carries the publisher note and the rest of the bill", () => {
    const out = normalizeBandsintown(
      [bitShow({ description: "Album release show.", lineup: ["The Local Band", "The Opener"] })],
      "The Local Band",
    );
    expect(out[0].description).toBe("Album release show. With The Opener.");
  });

  it("stays empty when the feed carries neither note nor extra names", () => {
    const out = normalizeBandsintown(
      [bitShow({ lineup: ["The Local Band"] })],
      "The Local Band",
    );
    expect(out[0].description).toBe("");
  });
});
