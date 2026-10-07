import { describe, expect, it } from "vitest";
import {
  GOOGLE_RATING_MIN_COUNT,
  googleMapsHref,
  googleRatingSummary,
  nearbyLandmark,
  placeAddress,
  placeHeroMap,
  sourceHost,
  streetFromAddress,
} from "./place-page";

describe("streetFromAddress", () => {
  it.each([
    ["118 S Market St", "South Market St"],
    ["10-B N East St", "North East St"],
    ["605 North Bentz Street Suites 104-105", "North Bentz Street"],
    ["1201 Dutchmans creek Dr# J, Brunswick, MD 21716", "Dutchmans Creek Dr"],
    ["Willowtree Plaza, 5 Willowdale Dr # A1, Frederick, MD 21702", "Willowdale Dr"],
    ["inside H Mart, 1063 W Patrick St, Frederick, MD 21702", "West Patrick St"],
    ["104 N Market St (104 Market Street)", "North Market St"],
    ["18 Market Space", "Market Space"],
    ["309 S 2nd St, Woodsboro, MD 21798", "South 2nd St"],
    ["Wormans Mill Rd, Frederick, MD 21701", "Wormans Mill Rd"],
    ["E Main St", "East Main St"],
  ])("reads %s as %s", (address, street) => {
    expect(streetFromAddress(address)).toBe(street);
  });

  it.each([
    "Frederick",
    "Emmitsburg, MD 21727",
    "CH7V+3PR",
    "Carroll Creek between East St and Bentz St",
    "Chesapeake and Ohio Canal Towpath, Brunswick, MD 21716",
    "U.S. Hwy 15, 501 & MD, 140 515 E Main St, Emmitsburg, MD 21727",
    "",
  ])("names no street for %j", (address) => {
    expect(streetFromAddress(address)).toBeNull();
  });
});

describe("nearbyLandmark", () => {
  it("names the nearest landmark a local would steer by", () => {
    expect(nearbyLandmark({ lng: -77.4111035, lat: 39.4111452 })).toBe("Carroll Creek");
  });

  it("never locates a landmark by itself", () => {
    const bakerPark = { lng: -77.4198, lat: 39.417 };
    expect(nearbyLandmark(bakerPark, "Baker Park")).not.toBe("Baker Park");
  });

  it("says nothing farther than a short walk away", () => {
    // Walkersville is miles from every curated landmark.
    expect(nearbyLandmark({ lng: -77.3519, lat: 39.4862 })).toBeNull();
  });
});

describe("placeHeroMap", () => {
  it("captions the block with the street and the landmark", () => {
    expect(
      placeHeroMap({
        name: "Black Hog BBQ",
        address: "118 S Market St",
        geom: { lng: -77.4111035, lat: 39.4111452 },
      }),
    ).toEqual({ lng: -77.4111035, lat: 39.4111452, caption: "South Market St, near Carroll Creek" });
  });

  it("captions with the street alone away from the landmarks", () => {
    expect(
      placeHeroMap({
        name: "Kings NY Style Pizza",
        address: "8415-G Woodsboro Pike, Walkersville, MD 21793",
        geom: { lng: -77.3554, lat: 39.4703 },
      })?.caption,
    ).toBe("Woodsboro Pike");
  });

  it("draws no block for a town-center fallback geocode", () => {
    // Filed as "Emmitsburg, MD 21727", 37 m from the town centroid: a pin
    // there would be a false picture of where the place is.
    expect(
      placeHeroMap({
        name: "Mount St. Mary's",
        address: "Emmitsburg, MD 21727",
        geom: { lng: -77.3271, lat: 39.7045 },
      }),
    ).toBeNull();
  });

  it("draws no block outside the county basemap", () => {
    expect(
      placeHeroMap({ name: "Elsewhere", address: "1 Main St", geom: { lng: -76.6, lat: 39.29 } }),
    ).toBeNull();
  });
});

describe("googleRatingSummary", () => {
  it("formats the rating and the review count", () => {
    expect(googleRatingSummary(4.61, 1728)).toEqual({ rating: "4.6", count: "1,728" });
  });

  it(`needs at least ${GOOGLE_RATING_MIN_COUNT} ratings`, () => {
    expect(googleRatingSummary(5, GOOGLE_RATING_MIN_COUNT - 1)).toBeNull();
    expect(googleRatingSummary(4.2, GOOGLE_RATING_MIN_COUNT)).toEqual({ rating: "4.2", count: "20" });
  });

  it("shows nothing without a rating", () => {
    expect(googleRatingSummary(undefined, 400)).toBeNull();
    expect(googleRatingSummary(Number.NaN, 400)).toBeNull();
  });
});

describe("placeAddress", () => {
  it("adds the locality line when the address is only the street", () => {
    expect(
      placeAddress({ address: "4 E Patrick St", city: "Frederick", state: "MD", postal_code: "21701" }),
    ).toEqual({
      street: "4 E Patrick St",
      locality: "Frederick, MD 21701",
      full: "4 E Patrick St, Frederick, MD 21701",
    });
  });

  it("does not repeat a town the address already carries", () => {
    expect(
      placeAddress({
        address: "30 W Potomac St Suite 103, Brunswick, MD 21716",
        city: "Brunswick",
        state: "MD",
        postal_code: "21716",
      }),
    ).toEqual({
      street: "30 W Potomac St Suite 103, Brunswick, MD 21716",
      locality: null,
      full: "30 W Potomac St Suite 103, Brunswick, MD 21716",
    });
  });
});

describe("link helpers", () => {
  it("keeps only https Google Maps links for the rating attribution", () => {
    expect(googleMapsHref("https://maps.google.com/?cid=123")).toBe("https://maps.google.com/?cid=123");
    expect(googleMapsHref("http://maps.google.com/?cid=123")).toBeNull();
    expect(googleMapsHref("https://example.com/?q=google.com")).toBeNull();
    expect(googleMapsHref(undefined)).toBeNull();
  });

  it("names a source by its bare host", () => {
    expect(sourceHost("https://www.visitfrederick.org/downtown-frederick/parking/")).toBe(
      "visitfrederick.org",
    );
    expect(sourceHost("not a url")).toBeNull();
  });
});
