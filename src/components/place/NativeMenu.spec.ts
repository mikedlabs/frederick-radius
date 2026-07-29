import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NativeMenu, {
  filterNativeMenuSections,
  type NativeMenuProps,
  type NativeMenuSection,
} from "./NativeMenu";

const sections: NativeMenuSection[] = [
  {
    id: "breakfast",
    name: "Breakfast",
    items: [
      {
        id: "avocado-toast",
        name: "Avocado Toast",
        description: "Sourdough, radish, and a soft egg.",
        price: { kind: "amount", amountCents: 1295, currency: "USD" },
        dietaryLabels: [
          { label: "Vegetarian", source: "restaurant" },
        ],
      },
      {
        id: "berry-bowl",
        name: "Açaí Berry Bowl",
        description: "Berries, granola, and local honey.",
        price: { kind: "amount", amountCents: 12_00 },
        dietaryLabels: [
          { label: "Gluten-free", source: "official_menu" },
        ],
        availability: {
          status: "sold_out",
          checkedAt: "2026-07-29T12:30:00-04:00",
          sourceLabel: "Toast",
        },
      },
    ],
  },
  {
    id: "lunch",
    name: "Lunch",
    items: [
      {
        id: "crab-cake",
        name: "Maryland Crab Cake",
        price: { kind: "text", label: "Market price" },
      },
    ],
  },
];

function renderMenu(overrides: Partial<NativeMenuProps> = {}) {
  return renderToStaticMarkup(
    createElement(NativeMenu, {
      sections,
      source: {
        kind: "pos",
        label: "Toast",
        url: "https://order.toasttab.com/online/example",
        checkedAt: "2026-07-29T12:30:00-04:00",
      },
      officialMenuLinks: [
        {
          label: "Official menu",
          url: "https://example.com/menu",
          checkedAt: "2026-07-29",
        },
      ],
      ...overrides,
    }),
  );
}

describe("NativeMenu", () => {
  it("renders a compact native menu with prices, source, and an honest state model", () => {
    const html = renderMenu();

    expect(html).toContain('id="menu"');
    expect(html).toContain("Search this menu");
    expect(html).toContain("Avocado Toast");
    expect(html).toContain("$12.95");
    expect(html).toContain("Vegetarian");
    expect(html).toContain("Menu synced from Toast");
    expect(html).toContain("A menu listing does not confirm current availability");
    expect(html).toContain("Dietary labels reflect the restaurant");
    expect(html).not.toContain("Available now");
    expect(html).not.toContain("allergen-safe");
  });

  it("shows an explicit provider status only when an item carries that evidence", () => {
    const html = renderMenu({ initialQuery: "berry" });

    expect(html).toContain("Açaí Berry Bowl");
    expect(html).toContain("Sold out at last update");
    expect(html).not.toContain("Avocado Toast");
    expect(html).toContain('data-menu-match="true"');
  });

  it("supports menu deep-link queries through the serializable initialQuery prop", () => {
    const html = renderMenu({ initialQuery: "crab cake" });

    expect(html).toContain("Maryland Crab Cake");
    expect(html).toContain("Market price");
    expect(html).not.toContain("Avocado Toast");
  });

  it("degrades to checked official menu links when native items are unavailable", () => {
    const html = renderMenu({
      sections: [],
      source: null,
      officialMenuLinks: [
        {
          label: "Dinner menu",
          url: "https://example.com/dinner-menu.pdf",
          checkedAt: "2026-07-29",
        },
      ],
    });

    expect(html).toContain('id="menu"');
    expect(html).toContain("This menu is not available inside Radius");
    expect(html).toContain("Dinner menu");
    expect(html).toContain("Link checked Jul 29, 2026");
    expect(html).not.toContain("Search this menu");
  });

  it("renders nothing when neither native items nor official menu links exist", () => {
    const html = renderToStaticMarkup(
      createElement(NativeMenu, {
        sections: [],
        source: null,
        officialMenuLinks: [],
      }),
    );

    expect(html).toBe("");
  });

  it("does not publish unsourced native items and keeps the official fallback", () => {
    const html = renderMenu({
      source: null,
      officialMenuLinks: [
        {
          label: "Official menu",
          url: "https://example.com/menu",
        },
      ],
    });

    expect(html).toContain("This menu is not available inside Radius");
    expect(html).toContain("Official menu");
    expect(html).not.toContain("Avocado Toast");
  });
});

describe("filterNativeMenuSections", () => {
  it("searches names, descriptions, dietary labels, and section names without accents", () => {
    expect(filterNativeMenuSections(sections, "acai")[0]?.items[0]?.id).toBe(
      "berry-bowl",
    );
    expect(filterNativeMenuSections(sections, "local honey")[0]?.items[0]?.id).toBe(
      "berry-bowl",
    );
    expect(filterNativeMenuSections(sections, "gluten free")[0]?.items[0]?.id).toBe(
      "berry-bowl",
    );
    expect(filterNativeMenuSections(sections, "lunch")[0]?.items[0]?.id).toBe(
      "crab-cake",
    );
  });

  it("respects a selected section without mutating the source data", () => {
    const result = filterNativeMenuSections(sections, "", "lunch");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("lunch");
    expect(result[0]?.items).not.toBe(sections[1]?.items);
    expect(sections).toHaveLength(2);
  });
});
