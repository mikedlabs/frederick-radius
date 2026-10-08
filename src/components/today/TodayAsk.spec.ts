import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk from "./TodayAsk";

describe("Today universal Find launcher", () => {
  it("uses the shared Find doorway instead of a second Ask form", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk));

    expect(html).toContain('aria-label="Find a place, service, event, or answer"');
    expect(html).toContain('href="/search"');
    expect(html).toContain("What do you need?");
    expect(html).toContain(
      "Find a place, an event, or help with your plans.",
    );
    expect(html).toContain('href="/open-now"');
    expect(html).toContain('href="/amenities"');
    // The category index follows the place shelf on Today, not this doorway.
    expect(html).not.toContain('href="/places"');
    expect(html).not.toContain("browse-places-panel");
    expect(html).not.toContain('action="/ask"');
    expect(html).not.toContain("data-ask-composer");
  });

  it("keeps one unboxed section with all four useful shortcuts", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk, { embedded: true }));

    expect(html).toContain('data-surface-row="find"');
    expect(html).not.toContain('class="mt-3 scroll-mt-24');
    expect(html).toContain('aria-label="Quick needs"');
    expect(html).toContain('href="/contacts"');
    expect(html).toContain("Plan a few hours");
    expect(html).not.toContain("magic-card");
    // Each label is its own element so it can center and clamp to two lines
    // under its icon.
    for (const label of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      expect(html).toMatch(new RegExp(`<span class="text-meta-lg font-semibold[^"]*">${label}</span>`));
    }
  });
});
