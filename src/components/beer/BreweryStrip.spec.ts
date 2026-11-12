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

  it("uses a light branded identity when no publishable photo exists", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );

    expect(html).toContain("/images/beer/logos/olde-mother-brewing-frederick.jpg");
    expect(html).not.toContain("bg-[var(--app-ink)]");
    // The card's action line uses the link token, which stays readable on the
    // dark surface. The pressed coral measured 2.23:1 there.
    expect(html.match(/text-\[var\(--app-link\)\]/g)).toHaveLength(BREWERIES.length);
    expect(html).not.toContain("text-[var(--app-brand-press)]");
  });

  it("names each brewery once per card when the mark stands in for a photo", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );

    // The card title is the label. The mark fallback must not print the name
    // and a "Frederick County brewery" line a second time inside the image slot.
    expect(html).not.toContain("Frederick County brewery");
    // React escapes text nodes, so compare against the escaped form of each
    // name ("Brewer's Alley" renders as "Brewer&#x27;s Alley").
    const escapeText = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    const textNodes = [...html.matchAll(/>([^<]+)</g)].map((match) => match[1]);
    for (const brewery of BREWERIES) {
      const occurrences = textNodes.filter((text) => text === escapeText(brewery.name)).length;
      expect(occurrences, brewery.name).toBe(1);
    }
  });

  it("shows every taproom in a three-column grid from the lg breakpoint", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );
    const rail = html.match(/<ul id="brewery-strip-results"[^>]*>/)?.[0] ?? "";

    // Phones keep the native snap rail the page-quality sweep scrolls.
    expect(rail).toContain("snap-x");
    expect(rail).toContain("overflow-x-auto");
    // A mouse wheel cannot reach cards in a hidden-scrollbar rail, so desktop
    // lays the same list out as a grid with nothing clipped.
    expect(rail).toContain("lg:grid");
    expect(rail).toContain("lg:grid-cols-3");
    expect(rail).toContain("lg:overflow-visible");
    expect(html.match(/<article /g)).toHaveLength(BREWERIES.length);
    expect(html.match(/lg:w-auto lg:max-w-none/g)).toHaveLength(BREWERIES.length);
    expect(html).not.toContain("embla");
  });

  it("opts its lazy photo rail into the page-quality horizontal sweep", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryStrip, { photos: {} }),
    );

    expect(html).toContain('id="brewery-strip-results"');
    expect(html).toContain('data-page-quality-horizontal-rail="true"');
  });
});
