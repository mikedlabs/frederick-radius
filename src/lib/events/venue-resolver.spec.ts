import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  anchorEventToReviewedVenue,
  REVIEWED_EVENT_ADDRESS_VENUES,
  resolveReviewedEventVenue,
  reviewedVenueNameForAddress,
} from "@/lib/events/venue-resolver";

function place(
  slug: string,
  name: string,
  address: string,
  lng: number,
  lat: number,
): PlaceCardData {
  return { slug, name, address, geom: { lng, lat } } as PlaceCardData;
}

const weinberg = place(
  "weinberg-center-for-the-arts-frederick",
  "Weinberg Center for the Arts",
  "20 W Patrick St, Frederick, MD 21701",
  -77.4116,
  39.4142,
);
const fairgrounds = place(
  "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick",
  "Frederick Fairgrounds - Home of The Great Frederick Fair",
  "797 E Patrick St, Frederick, MD 21701",
  -77.3924,
  39.4088,
);
const other = place(
  "other-hall",
  "Other Hall",
  "100 N Market St, Frederick, MD 21701",
  -77.4105,
  39.416,
);
const places = [weinberg, fairgrounds, other];

describe("resolveReviewedEventVenue", () => {
  it("accepts an exact canonical place slug", () => {
    expect(
      resolveReviewedEventVenue(
        { venue_place_slug: weinberg.slug, venue_name: "Weinberg Center for the Arts" },
        places,
      ),
    ).toMatchObject({ place: { slug: weinberg.slug }, kind: "canonical_slug" });
  });

  it("accepts a reviewed publisher alias", () => {
    expect(
      resolveReviewedEventVenue({ venue_name: "Frederick Fairgrounds" }, places),
    ).toMatchObject({ place: { slug: fairgrounds.slug }, kind: "reviewed_alias" });
  });

  it("accepts a unique exact normalized identity", () => {
    expect(
      resolveReviewedEventVenue({ venue_name: "WEINBERG center—for the arts" }, places),
    ).toMatchObject({ place: { slug: weinberg.slug }, kind: "exact_identity" });
  });

  it("does not promote fuzzy containment or a generic town label", () => {
    expect(resolveReviewedEventVenue({ venue_name: "Weinberg Center" }, places)).toBeNull();
    expect(resolveReviewedEventVenue({ venue_name: "Frederick" }, places)).toBeNull();
  });

  it("does not guess between duplicate exact identities", () => {
    const duplicate = place(
      "weinberg-center-secondary",
      "Weinberg Center for the Arts",
      "1 S Market St, Frederick, MD 21701",
      -77.4104,
      39.4132,
    );
    expect(
      resolveReviewedEventVenue(
        { venue_name: "Weinberg Center for the Arts" },
        [...places, duplicate],
      ),
    ).toBeNull();
  });

  it("protects an offsite event whose published address conflicts with the venue", () => {
    expect(
      resolveReviewedEventVenue(
        {
          venue_place_slug: weinberg.slug,
          venue_name: "Weinberg Center for the Arts",
          address: "100 N Market Street, Frederick, MD 21701",
        },
        places,
      ),
    ).toBeNull();
  });

  it("allows harmless address abbreviation differences", () => {
    expect(
      resolveReviewedEventVenue(
        {
          venue_name: "Weinberg Center for the Arts",
          address: "20 West Patrick Street, Frederick, MD 21701",
        },
        places,
      ),
    ).toMatchObject({ place: { slug: weinberg.slug } });
  });

  it("recognizes the same address when a feed prefixes it with the venue", () => {
    expect(
      resolveReviewedEventVenue(
        {
          venue_name: "Weinberg Center for the Arts",
          address:
            "Weinberg Center for the Arts - 20 West Patrick Street, Frederick, MD 21701",
        },
        places,
      ),
    ).toMatchObject({ place: { slug: weinberg.slug } });
  });

  it("protects an already-precise offsite coordinate", () => {
    expect(
      resolveReviewedEventVenue(
        {
          venue_name: "Weinberg Center for the Arts",
          geom: { lng: -77.55, lat: 39.5 },
          geo_confidence: "exact_address",
        },
        places,
      ),
    ).toBeNull();
  });

  it("fails closed when canonical slug and exact venue name disagree", () => {
    expect(
      resolveReviewedEventVenue(
        { venue_place_slug: weinberg.slug, venue_name: "Other Hall" },
        places,
      ),
    ).toBeNull();
  });

  it("fails closed when canonical slug and reviewed alias disagree", () => {
    expect(
      resolveReviewedEventVenue(
        { venue_place_slug: weinberg.slug, venue_name: "Frederick Fairgrounds" },
        places,
      ),
    ).toBeNull();
  });
});

describe("anchorEventToReviewedVenue", () => {
  it("sets canonical slug and venue geometry without changing publisher copy", () => {
    const event = {
      venue_name: "Weinberg Center for the Arts",
      address: "",
      geom: { lng: -77.41, lat: 39.41 },
      geo_confidence: "area",
      title: "Publisher event title",
    };
    expect(anchorEventToReviewedVenue(event, places)).toEqual({
      ...event,
      venue_place_slug: weinberg.slug,
      geom: weinberg.geom,
      placement: "venue",
      geo_confidence: "venue_match",
    });
  });

  it("does not anchor online events", () => {
    const event = {
      venue_name: "Weinberg Center for the Arts",
      geom: { lng: -77.41, lat: 39.41 },
      geo_confidence: "area",
      attendance_mode: "online" as const,
    };
    expect(anchorEventToReviewedVenue(event, places)).toBe(event);
  });
});

describe("reviewedVenueNameForAddress", () => {
  it("names the venue when a reviewed feed sends the street address as the venue", () => {
    expect(
      reviewedVenueNameForAddress({
        venue_name: "1440 Taney Avenue",
        address: "1440 Taney Avenue, Frederick, MD 21702",
        source: "county",
      }),
    ).toBe("Frederick 50+ Community Center");
    expect(
      reviewedVenueNameForAddress({
        venue_name: "12 East A Street",
        address: "12 East A Street, Brunswick, MD 21716",
        source: "county",
      }),
    ).toBe("Brunswick 50+ Community Center");
    expect(
      reviewedVenueNameForAddress({
        venue_name: "615 Center Street",
        address: "615 Center Street, Mount Airy, MD 21771",
        source: "mount-airy",
      }),
    ).toBe("Watkins Park");
  });

  it("folds abbreviations and a trailing town or building name in the venue field", () => {
    expect(
      reviewedVenueNameForAddress({
        venue_name: "12 E. Church St.",
        address: "12 E Church Street, Frederick, MD 21701",
        source: "county",
      }),
    ).toBe("Winchester Hall");
    expect(
      reviewedVenueNameForAddress({
        venue_name: "12 East Church Street Winchester Hall",
        address: "12 East Church Street Winchester Hall, Frederick, MD 21701",
        source: "county",
      }),
    ).toBe("Winchester Hall");
    expect(
      reviewedVenueNameForAddress({
        venue_name: "1440 Taney Avenue Frederick",
        address: "1440 Taney Avenue Frederick, MD 21702",
        source: "county",
      }),
    ).toBe("Frederick 50+ Community Center");
    expect(
      reviewedVenueNameForAddress({ venue_name: "300 South Seton Avenue", source: "county" }),
    ).toBe("Emmitsburg 50+ Community Center");
  });

  it("keeps the feed's venue when the text after the street names another tenant", () => {
    // Shared buildings in the place index: 9020 Amelung St also holds the
    // Urbana Regional Library and the Urbana Library Farmers' Market, and
    // 300 S Seton Ave also holds the Emmitsburg Branch Library and the
    // Emmitsburg Senior Center. The county CMS appends the second address
    // line, as on Calendar.aspx?EID=19395 ("12 East Church Street" /
    // "Winchester Hall").
    const rows = [
      {
        venue_name: "9020 Amelung Street Urbana Regional Library",
        address: "9020 Amelung Street Urbana Regional Library, Urbana, MD 21704",
      },
      { venue_name: "9020 Amelung Street Urbana Library Farmers' Market" },
      {
        venue_name: "300 South Seton Avenue Emmitsburg Branch Library",
        address: "300 South Seton Avenue Emmitsburg Branch Library, Emmitsburg, MD 21727",
      },
      { venue_name: "300 South Seton Avenue Emmitsburg Senior Center" },
      { venue_name: "12 E Church St Bistro", address: "12 E Church St, Frederick, MD 21701" },
    ];
    for (const row of rows) {
      expect(reviewedVenueNameForAddress({ ...row, source: "county" })).toBeNull();
    }
    // A named venue in the venue field is fine, but an address field naming
    // another tenant still keeps the row's own text.
    expect(
      reviewedVenueNameForAddress({
        venue_name: "9020 Amelung Street",
        address: "9020 Amelung Street Urbana Regional Library, Urbana, MD 21704",
        source: "county",
      }),
    ).toBeNull();
  });

  it("still matches a trailing town, state, ZIP or the reviewed name", () => {
    expect(
      reviewedVenueNameForAddress({ venue_name: "9020 Amelung Street Urbana MD 21704", source: "county" }),
    ).toBe("Urbana 50+ Community Center");
    expect(
      reviewedVenueNameForAddress({
        venue_name: "300 South Seton Avenue Emmitsburg 50+ Community Center",
        source: "county",
      }),
    ).toBe("Emmitsburg 50+ Community Center");
  });

  it("keeps a venue that already has a name", () => {
    expect(
      reviewedVenueNameForAddress({
        venue_name: "Urbana Regional Library",
        address: "9020 Amelung Street, Urbana, MD 21704",
        source: "county",
      }),
    ).toBeNull();
    expect(reviewedVenueNameForAddress({ venue_name: "", source: "county" })).toBeNull();
    expect(reviewedVenueNameForAddress({ venue_name: "Online", source: "county" })).toBeNull();
  });

  it("keeps the address for a feed that was not reviewed", () => {
    // 9020 Amelung Street also holds the Urbana Regional Library.
    expect(
      reviewedVenueNameForAddress({
        venue_name: "9020 Amelung Street",
        address: "9020 Amelung Street, Urbana, MD 21704",
        source: "dfp",
      }),
    ).toBeNull();
    expect(
      reviewedVenueNameForAddress({ venue_name: "9020 Amelung Street", source: null }),
    ).toBeNull();
  });

  it("keeps the address when the full address points somewhere else", () => {
    expect(
      reviewedVenueNameForAddress({
        venue_name: "101 Prospect Street",
        address: "101 Prospect Street, Brunswick, MD 21716",
        source: "county",
      }),
    ).toBeNull();
    expect(
      reviewedVenueNameForAddress({
        venue_name: "1440 Taney Avenue",
        address: "9020 Amelung Street, Urbana, MD 21704",
        source: "county",
      }),
    ).toBeNull();
  });

  it("leaves unreviewed addresses alone", () => {
    for (const venue of ["121 N Bentz St", "121 North Bentz Street", "705 Ridge Ave", "1441 Taney Avenue"]) {
      expect(
        reviewedVenueNameForAddress({ venue_name: venue, source: "county" }),
      ).toBeNull();
      expect(
        reviewedVenueNameForAddress({ venue_name: venue, source: "city-frederick" }),
      ).toBeNull();
      expect(
        reviewedVenueNameForAddress({ venue_name: venue, source: "mount-airy" }),
      ).toBeNull();
    }
  });

  it("keys every entry by the normalized street it is looked up with", () => {
    for (const [key, entry] of Object.entries(REVIEWED_EVENT_ADDRESS_VENUES)) {
      expect(key).toMatch(/^\d+ [a-z0-9 ]+$/);
      expect(entry.name.trim()).toBe(entry.name);
      expect(entry.name).not.toMatch(/^\d/);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(
        reviewedVenueNameForAddress({ venue_name: key, source: entry.sources[0] }),
      ).toBe(entry.name);
    }
  });

  it("does not let a reviewed name pull the pin to a same-named place at another address", () => {
    const watkins = place(
      "watkins-park-elsewhere",
      "Watkins Park",
      "100 N Market St, Frederick, MD 21701",
      -77.4105,
      39.416,
    );
    const venue_name = reviewedVenueNameForAddress({
      venue_name: "615 Center Street",
      address: "615 Center Street, Mount Airy, MD 21771",
      source: "mount-airy",
    });
    expect(venue_name).toBe("Watkins Park");
    expect(
      resolveReviewedEventVenue(
        { venue_name, address: "615 Center Street, Mount Airy, MD 21771" },
        [...places, watkins],
      ),
    ).toBeNull();
    // The same name at the published address is the venue, so the join holds.
    const atAddress = place(
      "watkins-park-mount-airy",
      "Watkins Park",
      "615 Center St, Mount Airy, MD 21771",
      -77.1547,
      39.3697,
    );
    expect(
      resolveReviewedEventVenue(
        { venue_name, address: "615 Center Street, Mount Airy, MD 21771" },
        [...places, atAddress],
      ),
    ).toMatchObject({ place: { slug: atAddress.slug }, kind: "exact_identity" });
  });
});
