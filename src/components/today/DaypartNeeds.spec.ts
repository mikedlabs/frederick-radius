import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaypartNeeds, {
  DaypartEmptyState,
  daypartBrowseHref,
} from "./DaypartNeeds";

describe("DaypartNeeds", () => {
  it("shows one open-now shelf while keeping the other categories available as tabs", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [
              {
                slug: "first-cup",
                name: "First Cup",
                rating: 4.7,
                where: "Urbana",
              },
            ],
          },
          {
            category: "bakery",
            label: "Bakeries",
            href: "/category/bakery",
            picks: [{ slug: "second-loaf", name: "Second Loaf", rating: 4.6 }],
          },
        ],
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Coffee");
    expect(html).toContain("Bakeries");
    expect(html).toContain("First Cup");
    expect(html).toContain("Across Frederick County");
    expect(html).toContain("Urbana");
    expect(html).not.toContain("Right now, around here");
    expect(html).not.toContain("Second Loaf");
  });

  it("keeps an empty server shelf mounted while the live location-aware answer loads", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [],
          },
        ],
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Checking nearby");
    expect(html).toContain("Loading open coffee places");
    expect(html).not.toContain("Nothing in this group is confirmed open right now");
  });

  it("uses a compact inline state when the live shelf has no confirmed-open places", () => {
    const html = renderToStaticMarkup(createElement(DaypartEmptyState));

    expect(html).toContain('role="status"');
    expect(html).toContain("No matching places are confirmed open in this area.");
    expect(html).toContain("Opening later");
    expect(html).toContain('href="/open-now"');
    expect(html).toContain("border-y");
    expect(html).not.toContain("border-dashed");
    expect(html).not.toContain("py-5");
  });

  it("keeps expanded daypart results on the location-aware Nearby journey", () => {
    expect(daypartBrowseHref("coffee", "Coffee", "nearme")).toBe(
      "/nearby?c=coffee&in=nearme",
    );
    expect(daypartBrowseHref("restaurant", "Dinner", "town:brunswick")).toBe(
      "/nearby?c=dinner&in=brunswick",
    );
    expect(daypartBrowseHref("bar", "Bars open late", "county")).toBe(
      "/nearby?c=drinks&facet=bar&in=county",
    );
    expect(daypartBrowseHref("museum", "Museums & indoors")).toBe(
      "/nearby?c=art&facet=museum",
    );
  });
});
