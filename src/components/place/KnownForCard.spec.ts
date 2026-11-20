import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import KnownForCard from "./KnownForCard";

describe("KnownForCard labels", () => {
  it("uses the row's own name as the one label when only Known for exists", () => {
    const html = renderToStaticMarkup(createElement(KnownForCard, {
      knownFor: ["playground and picnic tables", "tennis courts"],
      customersLoved: [],
    }));
    expect(html).toContain(">Known for</h3>");
    expect(html).not.toContain("What people say");
    expect(html).toContain("tennis courts");
  });

  it("uses Customers loved as the one label when only that row exists", () => {
    const html = renderToStaticMarkup(createElement(KnownForCard, { customersLoved: ["the crab croquetas"] }));
    expect(html).toContain(">Customers loved</h3>");
    expect(html).not.toContain("What people say");
    expect(html).not.toContain("Known for");
  });

  it("keeps one heading over two sub-labels when both rows exist", () => {
    const html = renderToStaticMarkup(createElement(KnownForCard, {
      knownFor: ["burgers"],
      customersLoved: ["late bar hours"],
    }));
    expect(html).toContain(">What people say</h3>");
    expect(html).toContain(">Known for</p>");
    expect(html).toContain(">Customers loved</p>");
  });

  it("renders nothing when both rows are empty", () => {
    expect(renderToStaticMarkup(createElement(KnownForCard, { knownFor: [""], customersLoved: [] }))).toBe("");
  });
});
