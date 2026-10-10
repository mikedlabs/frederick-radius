import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk, { TodayQuickNeeds } from "./TodayAsk";

describe("Today universal Find launcher", () => {
  it("uses the shared Find doorway instead of a second Ask form", () => {
    const html = renderToStaticMarkup(
      createElement(TodayAsk, null, createElement("span", null, "Category choices")),
    );

    expect(html).toContain('aria-label="Find a place, service, event, or answer"');
    expect(html).toContain('href="/search"');
    expect(html).toContain("Search places and events");
    expect(html).toContain("Look up a listing.");
    expect(html).not.toContain("What do you need?");
    expect(html).toContain('href="/open-now"');
    expect(html).toContain('href="/amenities"');
    expect(html).toContain('href="/places"');
    expect(html).toContain("Browse all places");
    expect(html).toContain("Category choices");
    expect(html).not.toContain('action="/ask"');
    expect(html).not.toContain("data-ask-composer");
  });

  it("keeps every utility door when the first decision uses only the Find launcher", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(TodayAsk, { embedded: true, showQuickNeeds: false }),
      createElement(TodayQuickNeeds, null, createElement("span", null, "Category choices")),
    ));
    expect(html.match(/aria-label="Find a place, service, event, or answer"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Quick needs"/g)).toHaveLength(1);
    for (const href of ["/open-now", "/amenities", "/contacts", "/places"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("Plan a few hours");
    expect(html).toContain("Category choices");
  });

  it("keeps one unboxed section with all four useful shortcuts", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk, { embedded: true }));

    expect(html).toContain('data-surface-row="find"');
    expect(html).not.toContain('class="mt-3 scroll-mt-24');
    expect(html).toContain('aria-label="Quick needs"');
    expect(html).toContain('href="/contacts"');
    expect(html).toContain("Plan a few hours");
    expect(html).not.toContain("magic-card");
  });
});
