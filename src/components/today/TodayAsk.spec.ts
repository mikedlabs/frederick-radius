import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk from "./TodayAsk";

describe("Today universal Find launcher", () => {
  it("uses the shared Find doorway instead of a second Ask form", () => {
    const html = renderToStaticMarkup(
      createElement(TodayAsk, null, createElement("span", null, "Category choices")),
    );

    expect(html).toContain('aria-label="Find a place, service, event, or answer"');
    expect(html).toContain('href="/search"');
    expect(html).toContain("What do you need?");
    expect(html).toContain(
      "Find a place or service, or ask for help planning your time.",
    );
    expect(html).toContain('href="/open-now"');
    expect(html).toContain('href="/amenities"');
    expect(html).toContain('href="/places"');
    expect(html).toContain("Browse all places");
    expect(html).toContain("Category choices");
    expect(html).not.toContain('action="/ask"');
    expect(html).not.toContain("data-ask-composer");
  });

  it("can sit flush inside the shared Today decision surface", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk, { embedded: true }));

    expect(html).toContain('data-surface-row="find"');
    expect(html).not.toContain('class="mt-3 scroll-mt-24');
    expect(html).toContain("overflow-hidden");
  });
});
