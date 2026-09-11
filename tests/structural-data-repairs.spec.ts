import { describe, expect, it } from "vitest";
import {
  decoratePlace,
  publicPlaceBySlug,
} from "@/lib/loaders/places";

function decoratedPlaceBySlug(slug: string) {
  const place = publicPlaceBySlug(slug);
  return place ? decoratePlace(place) : undefined;
}

describe("reviewed structural place repairs", () => {
  it("folds the stale Eagles address into the current fraternal-club record", () => {
    const canonical = publicPlaceBySlug("eagles-aeire-1067");
    const staleAlias = publicPlaceBySlug("fraternal-order-of-eagles-4");

    expect(canonical).toMatchObject({
      slug: "eagles-aeire-1067",
      category: "civic",
      address: "207 W Patrick St",
    });
    expect(staleAlias?.slug).toBe(canonical?.slug);
  });

  it("publishes the current First Baptist identity and location", () => {
    expect(publicPlaceBySlug("first-baptist-church-5")).toMatchObject({
      name: "First Baptist Church of Frederick",
      category: "worship",
      address: "7040 Bowers Rd",
      postal_code: "21702",
      phone: "(301) 473-8283",
      geom: {
        lng: -77.4787098,
        lat: 39.4307442,
      },
    });
  });

  it("repairs the reviewed Bloom, Vox, and Frederick City Market listings", () => {
    expect(publicPlaceBySlug("bloom-health-np")).toMatchObject({
      name: "Bloom Aesthetics & Wellness",
      category: "spa",
      address: "3 College Ave, Suite 8",
    });
    expect(decoratedPlaceBySlug("he-vox-lounge")).toMatchObject({
      name: "The Vox Lounge",
      category: "music",
      address: "228 N Market St",
      short_blurb:
        "The Vox Lounge is a SilverVox music venue whose calendar includes live music and open-mic events.",
      description_source: "business_website",
      description_source_url: "https://www.silvervox.org/eventspaces/",
      description_reviewed: true,
    });
    expect(publicPlaceBySlug("north-market-farmers-market")).toMatchObject({
      name: "Frederick City Market",
      category: "market",
      address: "622 N Market St",
      website: "http://frederickcitymarket.com/",
      geom: {
        lng: -77.4097129,
        lat: 39.4222301,
      },
    });
  });

  it("publishes the sourced Swinging Bridge history without claiming current access", () => {
    expect(decoratedPlaceBySlug("swinging-bridge")).toMatchObject({
      category: "civic",
      short_blurb:
        "The Swinging Bridge is a 100-foot iron pedestrian suspension bridge over Carroll Creek in Baker Park. Built in 1885, it was moved to the park in 1928.",
      description_source: "official_source",
      description_source_url:
        "https://apps.mht.maryland.gov/medusa/PDF/Frederick/F-3-8.pdf",
      description_reviewed: true,
    });
  });

  it("moves Kindred Nutrition to the current provider-backed identity", () => {
    expect(decoratedPlaceBySlug("kindred-nutrition")).toMatchObject({
      name: "Kindred Nutrition & Kinetics",
      category: "wellness",
      address: "810 Toll House Ave",
      geom: {
        lng: -77.4138803,
        lat: 39.4259123,
      },
      google_place_id: "ChIJ______rayYkRh1fX5N1FTBA",
      short_blurb:
        "Kindred Nutrition is a dietitian-led practice specializing in sports nutrition and eating-disorder treatment. It offers in-person care in Frederick and virtual care in multiple states.",
      description_source: "business_website",
      description_source_url: "https://kindrednutrition.com/",
      description_reviewed: true,
    });
  });

  it("withholds rows whose enrichment proved they were the wrong entity", () => {
    expect(
      publicPlaceBySlug("shekinah-glory-deliverance-ministry"),
    ).toBeUndefined();
    expect(
      publicPlaceBySlug("francis-scott-key-memorial-foundation"),
    ).toBeUndefined();
  });
});
