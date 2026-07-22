import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BeerWorkspace, { beerModeForHash } from "./BeerWorkspace";

describe("BeerWorkspace", () => {
  it("opens with one task instead of rendering every beer surface at once", () => {
    const html = renderToStaticMarkup(
      createElement(BeerWorkspace, {
        find: createElement("p", null, "Finder content"),
        index: createElement("p", null, "Index content"),
        taprooms: createElement("p", null, "Taproom content"),
        tonight: createElement("p", null, "Event content"),
      }),
    );

    expect(html).toContain("Finder content");
    expect(html).not.toContain("Index content");
    expect(html).not.toContain("Taproom content");
    expect(html).not.toContain("Event content");
    expect(html).toContain("Find a beer");
    expect(html).toContain("All beers");
    expect(html).toContain("Taprooms");
    expect(html).toContain("This week");
    expect(html).toContain("grid-cols-4");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
  });

  it("maps every public beer anchor to the panel that owns it", () => {
    expect(beerModeForHash("#find-your-pour")).toBe("find");
    expect(beerModeForHash("#my-taps")).toBe("find");
    expect(beerModeForHash("#beer-index")).toBe("index");
    expect(beerModeForHash("#taproom-map")).toBe("taprooms");
    expect(beerModeForHash("#on-tap-now")).toBe("tonight");
    expect(beerModeForHash("#beer-week")).toBe("tonight");
    expect(beerModeForHash("")).toBe("find");
    expect(beerModeForHash("#unknown-section")).toBeNull();
  });
});
