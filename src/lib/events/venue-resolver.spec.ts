import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  anchorEventToReviewedVenue,
  resolveReviewedEventVenue,
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
