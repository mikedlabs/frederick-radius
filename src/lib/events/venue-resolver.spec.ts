import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { clientPlaces } from "@/lib/loaders/places-client";
import {
  FCPL_REVIEWED_BRANCH_SLUGS,
  REVIEWED_EVENT_VENUE_ALIASES,
  anchorEventToReviewedVenue,
  resolveReviewedEventVenue,
  reviewedEventVenueName,
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

const artz = place(
  "c-burr-artz-public-library-frederick",
  "C. Burr Artz Public Library",
  "110 E Patrick St, Frederick, MD 21701",
  -77.4089,
  39.4132,
);
const middletown = place(
  "middletown-public-library-middletown",
  "Middletown Public Library",
  "31 E Green St, Middletown, MD 21769",
  -77.5417,
  39.4447,
);
const libraryPlaces = [...places, artz, middletown];

describe("FCPL branch venue names", () => {
  it("strips the room and branch-code suffix", () => {
    expect(
      reviewedEventVenueName("C. Burr Artz Public Library, Community Room (CBA)"),
    ).toBe("C. Burr Artz Public Library");
    expect(
      reviewedEventVenueName("Middletown Branch Library, Meeting Room A"),
    ).toBe("Middletown Branch Library");
  });

  it("leaves multi-branch lists and offsite amphitheater suffixes intact", () => {
    expect(
      reviewedEventVenueName(
        "C. Burr Artz Public Library / Around the Community / Brunswick Branch Library",
      ),
    ).toContain(" / ");
    expect(
      reviewedEventVenueName(
        "C. Burr Artz Public Library, Carroll Creek Linear Park Amphitheater",
      ),
    ).toBe("C. Burr Artz Public Library, Carroll Creek Linear Park Amphitheater");
  });

  it("links a Branch Library alias to the catalog Public Library place", () => {
    expect(
      resolveReviewedEventVenue(
        { venue_name: "Middletown Branch Library, Community Room (MID)" },
        libraryPlaces,
      ),
    ).toMatchObject({ place: { slug: middletown.slug }, kind: "reviewed_alias" });
  });

  it("does not invent a place for a room-only code or an unknown branch", () => {
    expect(
      resolveReviewedEventVenue({ venue_name: "Community Room (CBA)" }, libraryPlaces),
    ).toBeNull();
    expect(
      resolveReviewedEventVenue(
        { venue_name: "Community Bookmobile, Storytime Room (BKM)" },
        libraryPlaces,
      ),
    ).toBeNull();
  });
});

/**
 * Real FCPL venue strings from the 2026-10-17 production browse feed
 * (https://frederickradius.app/api/events/browse, generatedAt
 * 2026-10-17T21:43:07.466Z). 472 library events, 62 unique venues.
 */
const LIVE_FCPL_VENUES: readonly {
  venue_name: string;
  count: number;
  slug: string | null;
}[] = [
  { venue_name: "Thurmont Regional Library, Community Room (TRL)", count: 37, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "Middletown Branch Library, Community Room (MID)", count: 32, slug: "middletown-public-library-middletown" },
  { venue_name: "Urbana Regional Library, Anthony M. Natelli Community Room", count: 31, slug: "urbana-regional-library-new-market" },
  { venue_name: "Emmitsburg Branch Library, Community Room (EMM)", count: 29, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Walkersville Branch Library, Darrell L Batson Community Room", count: 26, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Brunswick Branch Library, Community Room (BR)", count: 26, slug: "brunswick-branch-library-brunswick" },
  { venue_name: "Brunswick Branch Library, Community Room (BRU)", count: 23, slug: "brunswick-branch-library-brunswick" },
  { venue_name: "Thurmont Regional Library, Thurmont Imagination Zone", count: 22, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "Walkersville Branch Library, Fireplace", count: 20, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Myersville Community Library, Community Room (MYE)", count: 19, slug: "myersville-community-library-myersville" },
  { venue_name: "Myersville Community Library, Community Room (MY)", count: 18, slug: "myersville-community-library-myersville" },
  { venue_name: "C. Burr Artz Public Library, Community Room (CBA)", count: 17, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "Urbana Regional Library, Small Conference Room", count: 17, slug: "urbana-regional-library-new-market" },
  { venue_name: "Emmitsburg Branch Library, Community Room (EM)", count: 15, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Middletown Branch Library, Meeting Room A", count: 12, slug: "middletown-public-library-middletown" },
  { venue_name: "Thurmont Regional Library, Small Meeting Room", count: 12, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "C. Burr Artz Public Library, Programming Room (CBA)", count: 11, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "C. Burr Artz Public Library, STEM Lab", count: 10, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "Brunswick Branch Library, Inside Library (BRU)", count: 7, slug: "brunswick-branch-library-brunswick" },
  { venue_name: "Emmitsburg Branch Library, Outside Library (EMM)", count: 7, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Middletown Branch Library, Inside Library (MID)", count: 6, slug: "middletown-public-library-middletown" },
  { venue_name: "Edward F. Fry Memorial Library at Point of Rocks, Small Room (PoR)", count: 6, slug: "edward-f-fry-memorial-library-at-point-of-rocks-brunswick" },
  { venue_name: "C. Burr Artz Public Library, Study Room 3 (CBA)", count: 4, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "Middletown Branch Library, Meeting Room B", count: 4, slug: "middletown-public-library-middletown" },
  { venue_name: "Thurmont Regional Library, Inside Library (TRL)", count: 4, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "Emmitsburg Branch Library, Inside Library (EMM)", count: 4, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Emmitsburg Branch Library, Outside Library (EM)", count: 4, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Around the Community", count: 3, slug: null },
  { venue_name: "Middletown Branch Library, Family Play Area", count: 3, slug: "middletown-public-library-middletown" },
  {
    venue_name:
      "C. Burr Artz Public Library / Around the Community / Brunswick Branch Library / Edward F. Fry Memorial Library at Point of Rocks / Emmitsburg Branch Library / Middletown Branch Library / Myersville Community Library / Thurmont Regional Library / Urbana Regional Library / Walkersville Branch Library / Community Bookmobile / Early Start Bookmobile",
    count: 3,
    slug: null,
  },
  { venue_name: "Urbana Regional Library, Programming Room (URL)", count: 2, slug: "urbana-regional-library-new-market" },
  { venue_name: "Carroll Creek Linear Park Amphitheater", count: 2, slug: null },
  { venue_name: "Emmitsburg Branch Library, Gymnasium", count: 2, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "Everedy Square/Shab Row", count: 2, slug: null },
  { venue_name: "Middletown Branch Library", count: 2, slug: "middletown-public-library-middletown" },
  { venue_name: "Urbana Regional Library", count: 2, slug: "urbana-regional-library-new-market" },
  { venue_name: "Thurmont Regional Library, Deck", count: 2, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "Edward F. Fry Memorial Library at Point of Rocks, Large Room (PoR)", count: 2, slug: "edward-f-fry-memorial-library-at-point-of-rocks-brunswick" },
  { venue_name: "Sophie and Madigan's Playground", count: 1, slug: null },
  { venue_name: "Thurmont Regional Library", count: 1, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "Emmitsburg Branch Library, Study Room (EMM)", count: 1, slug: "emmitsburg-branch-library-emmitsburg" },
  { venue_name: "C. Burr Artz Public Library, Children's Department (CBA)", count: 1, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "Walkersville Branch Library, Study Room 3 (WAL)", count: 1, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Hill Street Park", count: 1, slug: null },
  { venue_name: "Frederick Health Village", count: 1, slug: null },
  { venue_name: "Chick Fil-A", count: 1, slug: "chick-fil-a-frederick" },
  { venue_name: "Middletown 50+ Community Center", count: 1, slug: null },
  { venue_name: "Weinberg Center for the Arts", count: 1, slug: "weinberg-center-for-the-arts-frederick" },
  { venue_name: "Walkersville Branch Library, The Loft", count: 1, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Walkersville Branch Library, Glassy Point", count: 1, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Urbana Regional Library, Programming Room (UR)", count: 1, slug: "urbana-regional-library-new-market" },
  { venue_name: "C. Burr Artz Public Library, Carroll Creek Linear Park Amphitheater", count: 1, slug: null },
  { venue_name: "Walkersville Branch Library, Outside Library (WAL)", count: 1, slug: "walkersville-public-library-walkersville" },
  { venue_name: "Frederick City Market", count: 1, slug: "frederick-city-market" },
  { venue_name: "Kicks Karate", count: 1, slug: null },
  { venue_name: "Myersville Community Library", count: 1, slug: "myersville-community-library-myersville" },
  { venue_name: "C. Burr Artz Public Library", count: 1, slug: "c-burr-artz-public-library-frederick" },
  { venue_name: "Community Room (CBA)", count: 1, slug: null },
  { venue_name: "Programming Room (CBA)", count: 1, slug: null },
  { venue_name: "Brunswick Branch Library, Outside Library (BRU)", count: 1, slug: "brunswick-branch-library-brunswick" },
  { venue_name: "Thurmont Regional Library, Study Room 1 (TRL)", count: 1, slug: "thurmont-regional-library-thurmont" },
  { venue_name: "C. Burr Artz Public Library, C. Burr Artz Trust Conference Room", count: 1, slug: "c-burr-artz-public-library-frederick" },
];

describe("live FCPL browse venues", () => {
  const catalog = clientPlaces();

  it("only aliases the nine FCPL branches that already exist in the catalog", () => {
    const catalogSlugs = new Set(catalog.map((item) => item.slug));
    expect(FCPL_REVIEWED_BRANCH_SLUGS).toHaveLength(9);
    for (const slug of FCPL_REVIEWED_BRANCH_SLUGS) {
      expect(catalogSlugs.has(slug), slug).toBe(true);
    }
    const libraryAliasSlugs = new Set(
      Object.entries(REVIEWED_EVENT_VENUE_ALIASES)
        .filter(([identity]) => identity !== "frederickfairgrounds")
        .map(([, slug]) => slug),
    );
    expect([...libraryAliasSlugs].sort()).toEqual([...FCPL_REVIEWED_BRANCH_SLUGS].sort());
  });

  it("links live Branch, Room (CODE) strings and leaves offsite rows unlinked", () => {
    expect(LIVE_FCPL_VENUES.reduce((sum, row) => sum + row.count, 0)).toBe(472);

    let linked = 0;
    for (const row of LIVE_FCPL_VENUES) {
      const match = resolveReviewedEventVenue({ venue_name: row.venue_name }, catalog);
      expect(match?.place.slug ?? null, row.venue_name).toBe(row.slug);
      if (row.slug) linked += row.count;
    }

    expect(linked).toBe(454);
  });

  it("publishes exactly one Frederick City Market for the live market venue", () => {
    expect(
      catalog.filter((item) => item.name === "Frederick City Market").map((item) => item.slug),
    ).toEqual(["frederick-city-market"]);
  });
});
