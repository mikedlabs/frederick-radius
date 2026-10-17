import { readFileSync } from "node:fs";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk, { TodayQuickNeeds } from "./TodayAsk";

describe("Today universal Find launcher", () => {
  it("keeps a compact arrival as the real Find route without duplicating its explanation", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk, {
      embedded: true, showQuickNeeds: false, density: "arrival",
    }));
    expect(html).toContain('href="/search"');
    expect(html).toContain('data-find-interaction-ready="false"');
    expect(html).toContain('aria-label="Find a place, service, event, or answer"');
    expect(html).toContain('data-find-density="arrival"');
    expect(html).toContain("Find what you need");
    expect(html).toContain(">Search</span>");
    expect(html).not.toContain("Search a name, a need, or a question.");
    expect(html).not.toContain('aria-label="Quick needs"');
    expect(html).not.toContain("<input");
  });

  it("uses the shared Find doorway instead of a second Ask form", () => {
    const html = renderToStaticMarkup(
      createElement(TodayAsk, null, createElement("span", null, "Category choices")),
    );

    expect(html).toContain('aria-label="Find a place, service, event, or answer"');
    expect(html).toContain('href="/search"');
    expect(html).toContain("Find what you need");
    expect(html).toContain(
      "Search a name, a need, or a question.",
    );
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

describe("Today Find launcher CSS", () => {
  const css = readFileSync("src/components/today/TodayAsk.module.css", "utf8");

  it("keeps the doorway on one line with a Search fallback and a min-height", () => {
    expect(css).toMatch(/\.launcher \{[^}]*flex-wrap:\s*nowrap/s);
    expect(css).toMatch(/\.launcher \{[^}]*min-height:\s*72px/s);
    expect(css).not.toMatch(/\.launcher \{[^}]*\n\s*height:/s);
    expect(css).toMatch(/\.arrival \.launcher \{[^}]*min-height:\s*56px/s);
    expect(css).not.toMatch(/\.arrival \.launcher \{[^}]*\n\s*height:/s);
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toContain("@container today-find (max-width: 17em)");
    expect(css).toMatch(/\.promptShort \{[^}]*display:\s*none/s);
  });
});
