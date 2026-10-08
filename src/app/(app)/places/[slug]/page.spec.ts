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
      source.indexOf("data-place-location"),
      source.indexOf("</section>", source.indexOf("data-place-location")),
    );
    expect(location).toContain('<SectionHeading size="sm" title="Location" />');
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

describe("place page on paper", () => {
  const header = source.slice(
    source.indexOf("<header"),
    source.indexOf("</header>"),
  );

  it("drops the identity card: no rounded, tactile or elevated panel around the header", () => {
    const open = header.slice(0, header.indexOf(">") + 1);
    expect(open).not.toContain("tactile");
    expect(open).not.toContain("rounded");
    expect(open).not.toContain("overflow-hidden");
    expect(header).not.toContain("bg-[var(--app-bg-elevated)] p-5");
  });

  it("runs the hero edge to edge on phones and keeps radius-lg from 640px up", () => {
    const frame = header.slice(header.indexOf("data-place-hero-frame"), header.indexOf("<PlaceHero"));
    expect(frame).toContain("-mx-4");
    expect(frame).toContain("sm:mx-0");
    expect(frame).toContain("sm:rounded-[var(--app-radius-lg)]");
    expect(frame).toContain("empty:hidden");
    // The title block sits on Cream after the picture.
    expect(header.indexOf("<PlaceHero")).toBeLessThan(header.indexOf("<h1"));
  });

  it("sets Save and Plan from here as text buttons in one row", () => {
    const row = header.slice(header.indexOf("data-place-header-actions"));
    expect(row).toContain('<MyRadiusButton slug={place.slug} name={place.name} appearance="text" />');
    expect(row).toContain('<PlanFromPlaceLink slug={place.slug} name={place.name} appearance="text" />');
  });

  it("keeps the first screen to the header: commerce and Been here come later", () => {
    expect(header).not.toContain("<CommerceActions");
    expect(header).not.toContain("<BeenHereToggle");
    const hours = source.indexOf("<HoursBlock");
    const visit = source.indexOf("<PlaceVisitDetailsCard");
    const commerce = source.indexOf("<CommerceActions");
    expect(commerce).toBeGreaterThan(hours);
    expect(commerce).toBeGreaterThan(visit);
    // Been here closes the visit section, after the field notes and margin tools.
    const been = source.indexOf("<BeenHereToggle");
    expect(been).toBeGreaterThan(source.indexOf("<FieldNotesCard"));
    expect(been).toBeGreaterThan(source.indexOf("<PlaceMarginTools"));
    expect(been).toBeLessThan(source.indexOf("<HouseBeersSection"));
  });

  it("gives desktop one action row with Directions as the only filled button", () => {
    const row = source.slice(
      source.indexOf("data-place-desktop-actions"),
      source.indexOf("</div>", source.indexOf("data-place-desktop-actions")),
    );
    expect(row).toContain("lg:flex");
    expect(row).not.toContain("grid-cols-2");
    expect(row.match(/variant="primary"/g)).toHaveLength(1);
    expect(row).toContain('size="lg"');
    const order = ['label="Call"', 'label="Website"', 'label="Apple Maps"', 'label="Email"']
      .map((marker) => row.indexOf(marker));
    expect(order.every((index) => index > row.indexOf("Directions"))).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(source).not.toContain("function ActionButton");
  });

  it("keeps the phone dock with Directions as its primary", () => {
    const dock = source.slice(source.indexOf("<MobileActionBar"), source.indexOf("</MobileActionBar>"));
    const directions = dock.slice(dock.indexOf("<MobileBarLink"), dock.indexOf("/>", dock.indexOf("<MobileBarLink")));
    expect(directions).toContain('label="Directions"');
    expect(directions).toContain("primary");
    expect(dock).toContain("mobileCommerceLink");
  });

  it("sets section labels as sentence-case section headings, not caps eyebrows", () => {
    expect(source).not.toContain('className="eyebrow');
    expect(source).toContain('<SectionHeading size="sm" title={title} />');
  });

  it("keeps the canonical, closed slug set and JSON-LD", () => {
    expect(source).toContain("export const dynamicParams = false;");
    expect(source).toContain("alternates: { canonical: `/places/${place.slug}` }");
    expect(source).toContain('type="application/ld+json"');
  });
});
