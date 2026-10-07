import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BREWERIES } from "@/data/beers";
import HouseBeersSection, { HOUSE_BEER_LIMIT, houseBeerFacts, houseBeersFor } from "./HouseBeers";

describe("houseBeersFor", () => {
  it("lists up to four flagships with the brewery's tap list", () => {
    const house = houseBeersFor("olde-mother-brewing-frederick");
    expect(house?.beers).toHaveLength(HOUSE_BEER_LIMIT);
    expect(house?.beers.every((beer) => beer.flagship)).toBe(true);
    expect(house?.beers[0].name).toBe("Impressionist");
    expect(house?.tapListUrl).toBe("https://oldemother.com/");
  });

  it("covers every guided brewery and never invents a tap list", () => {
    for (const brewery of BREWERIES) {
      const house = houseBeersFor(brewery.slug);
      expect(house?.beers.length ?? 0).toBeGreaterThan(0);
      expect(house!.beers.length).toBeLessThanOrEqual(HOUSE_BEER_LIMIT);
    }
    expect(houseBeersFor("steinhardt-brewing-company-frederick")?.tapListUrl).toBeNull();
  });

  it("is empty for a place that is not a guided brewery", () => {
    expect(houseBeersFor("black-hog-bbq-bar")).toBeNull();
  });
});

describe("houseBeerFacts", () => {
  it("reads style and ABV", () => {
    expect(houseBeerFacts({ style: "American IPA", abv: 6.3 })).toBe("American IPA · 6.3% ABV");
  });

  it("drops an unknown ABV rather than guessing", () => {
    expect(houseBeerFacts({ style: "Kölsch", abv: null })).toBe("Kölsch");
  });
});

describe("HouseBeersSection", () => {
  it("marks each flagship with an Amber dot and links today's taps", () => {
    const html = renderToStaticMarkup(<HouseBeersSection slug="attaboy-beer-frederick" />);
    expect(html).toContain("House beers");
    expect(html.match(/data-flagship-dot/g)?.length).toBeGreaterThan(0);
    expect(html).toContain("var(--app-amber)");
    expect(html).not.toContain("var(--app-accent)");
    expect(html).toContain('href="https://www.attaboybeer.com/on-tap"');
    expect(html).toContain("Check today&#x27;s taps");
  });

  it("omits the taps link when the brewery has no tap list on file", () => {
    const html = renderToStaticMarkup(<HouseBeersSection slug="steinhardt-brewing-company-frederick" />);
    expect(html).toContain("House beers");
    expect(html).not.toContain("Check today");
  });

  it("renders nothing for other places", () => {
    expect(renderToStaticMarkup(<HouseBeersSection slug="black-hog-bbq-bar" />)).toBe("");
  });
});
