import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_BEERS } from "@/data/beers";
import BeerMosaic from "./BeerMosaic";

describe("BeerMosaic", () => {
  it("renders every beer it receives and leaves expansion to BeerIndex", () => {
    const beers = ALL_BEERS.slice(0, 30);
    const html = renderToStaticMarkup(
      createElement(BeerMosaic, { beers, onOpen: () => undefined }),
    );

    expect(html.match(/<li/g)).toHaveLength(beers.length);
    expect(html).not.toContain("Show all");
  });

  it("identifies the source of a rating in the tile's accessible name", () => {
    const ratedBeer = ALL_BEERS.find((beer) => beer.rating != null);
    expect(ratedBeer).toBeDefined();

    const html = renderToStaticMarkup(
      createElement(BeerMosaic, {
        beers: [ratedBeer!],
        onOpen: () => undefined,
      }),
    );

    expect(html).toContain("Untappd rating");
  });
});
