import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("place page trust line", () => {
  it("writes one trust line from the trust-language table", () => {
    expect(source).toContain("placeTrustSegments({");
    expect(source).toContain("detailsCheckedAt: place.updated_at");
    expect(source).toContain("hoursStatus: place.open_status");
    expect(source).toContain("{REPORT_A_CHANGE}");
  });

  it("never prints a raw ISO date or a second relative-age format", () => {
    // The audit found "Updated 2026-05-14" beside "verified 3mo ago" and
    // "confirmed 3 months ago" on one page.
    expect(source).not.toContain("Updated {place.updated_at}");
    expect(source).not.toContain("confirmedAgo");
    expect(source).not.toContain("Report incorrect info");
    expect(source).toContain("formatTrustDate(place.hours_updated_at)");
  });
});

describe("place page visual first", () => {
  it("hands the hero the place's block instead of a category pill", () => {
    expect(source).toContain("map={heroMap}");
    expect(source).toContain("placeHeroMap(place)");
    expect(source).not.toMatch(/<PlaceHero[^>]*category=/);
  });

  it("prints the Google rating with its attribution on the identity line", () => {
    expect(source).toContain("googleRatingSummary(place.google_rating, place.google_rating_count)");
    expect(source).toContain('<span translate="no">Google Maps</span>');
  });

  it("orders Location as address, landmark, parking, then one map row", () => {
    const location = source.slice(
      source.indexOf('id="place-location-heading"'),
      source.indexOf("</section>", source.indexOf('id="place-location-heading"')),
    );
    const order = [
      "<CopyAddressButton",
      "data-place-landmark",
      "data-place-parking",
      "Open on the Radius map",
    ].map((marker) => location.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The block is the hero now; Location does not draw a second mini map.
    expect(location).not.toContain("<PlaceMiniMap");
    expect(location).not.toContain("<AerialBeat");
    expect(source).toContain("<FieldNotesCard slug={place.slug} omitParking />");
  });

  it("places the aerial after Nearby and gates it on the municipality", () => {
    expect(source).toContain(
      "<AerialBeat lat={place.geom.lat} lng={place.geom.lng} municipality={place.municipality} />",
    );
    expect(source.indexOf("<AerialBeat")).toBeGreaterThan(source.indexOf(">Nearby</h2>"));
    expect(source).not.toContain("label={place.city");
  });

  it("adds house beers for the guided breweries", () => {
    expect(source).toContain("<HouseBeersSection slug={place.slug} />");
  });
});
