import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaypartNeeds from "./DaypartNeeds";

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
});
