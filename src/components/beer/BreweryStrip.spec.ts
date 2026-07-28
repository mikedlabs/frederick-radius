import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BREWERIES } from "@/data/beers";
import BreweryStrip from "./BreweryStrip";

describe("BreweryStrip", () => {
  it("leads with native place details and source-checked brewery context", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );

    // Each card exposes the photo and the detail copy as separate links so
    // Google attribution never becomes an invalid nested anchor.
    expect(html.match(/href="\/places\//g)).toHaveLength(BREWERIES.length * 2);
    expect(html).toContain("A downtown brewery whose house catalog moves");
    expect(html).toContain("View taproom details");
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("Untappd");
  });

  it("uses a light typographic identity when no publishable photo exists", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );

    expect(html).toContain("Frederick County brewery");
    expect(html).not.toContain("/images/beer/logos/");
    expect(html).not.toContain("bg-[var(--app-ink)]");
  });
});
