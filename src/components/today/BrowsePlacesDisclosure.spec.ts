import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BrowsePlacesDisclosure from "./BrowsePlacesDisclosure";

describe("BrowsePlacesDisclosure", () => {
  it("keeps the category panel in the HTML and closed on first paint", () => {
    const EmbeddedBrowse = BrowsePlacesDisclosure as ComponentType<{ embedded?: boolean }>;
    const html = renderToStaticMarkup(
      createElement(
        EmbeddedBrowse,
        { embedded: true },
        createElement("span", null, "Category choices"),
      ),
    );

    expect(html).toContain('data-surface-row="browse"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="browse-places-panel"');
    expect(html).toContain("Category choices");
    expect(html).toContain("hidden");
    expect(html).not.toContain('class="mt-3"');
  });
});
