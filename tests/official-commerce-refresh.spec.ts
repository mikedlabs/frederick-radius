import { describe, expect, it } from "vitest";
import {
  commerceCoverage,
  commerceRefreshIsFresh,
  filterCommerceLinksForPlace,
  isEligibleOfficialBusinessWebsite,
  mergeCommerceRefresh,
  mergeDistinctCommerceLinks,
  sanitizeStoredCommerceLinks,
  selectCommerceDiscoveryPages,
  shouldKeepCommerceLinkAfterProbe,
} from "../scripts/lib/official-commerce-refresh";

describe("official commerce refresh", () => {
  const excluded = [
    "facebook.com",
    "yelp.com",
    "tripadvisor",
    ".gov",
    "linktr.ee",
  ];

  it("accepts official sites and rejects unsafe, government, social, and directory URLs", () => {
    expect(
      isEligibleOfficialBusinessWebsite("https://example.com", excluded),
    ).toBe(true);
    expect(
      isEligibleOfficialBusinessWebsite("https://menu.example.com", excluded),
    ).toBe(true);
    expect(
      isEligibleOfficialBusinessWebsite("javascript:alert(1)", excluded),
    ).toBe(false);
    expect(
      isEligibleOfficialBusinessWebsite("https://www.yelp.com/biz/example", excluded),
    ).toBe(false);
    expect(
      isEligibleOfficialBusinessWebsite("https://food.city.gov/menu", excluded),
    ).toBe(false);
    expect(
      isEligibleOfficialBusinessWebsite("https://notyelp.com", excluded),
    ).toBe(true);
  });

  it("uses only the commerce-specific timestamp for refresh eligibility", () => {
    const now = Date.parse("2026-07-29T12:00:00.000Z");
    expect(
      commerceRefreshIsFresh(
        {
          source: {
            url: "https://example.com",
            fetchedAt: "2026-07-28T12:00:00.000Z",
          },
        },
        now,
        30,
      ),
    ).toBe(false);
    expect(
      commerceRefreshIsFresh(
        {
          commerce_source: {
            url: "https://example.com",
            checkedAt: "2026-07-28T12:00:00.000Z",
          },
        },
        now,
        30,
      ),
    ).toBe(true);
  });

  it("updates commerce data without changing unrelated business-fact freshness", () => {
    const existing = {
      known_for: "A source-backed description.",
      source: {
        url: "https://example.com/about",
        fetchedAt: "2026-05-01T12:00:00.000Z",
      },
    };
    const next = mergeCommerceRefresh(existing, {
      name: "Example Restaurant",
      links: [
        {
          type: "menu",
          url: "https://example.com/menu",
          source_url: "https://example.com/",
          anchor_text: "Menu",
        },
      ],
      sourceUrl: "https://example.com/",
      checkedAt: "2026-07-29T12:00:00.000Z",
    });

    expect(next.source).toEqual(existing.source);
    expect(next.known_for).toBe(existing.known_for);
    expect(next.commerce_source).toEqual({
      url: "https://example.com/",
      checkedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(next.commerce_links).toHaveLength(1);
  });

  it("follows only a small set of same-site food and dining index pages", () => {
    expect(
      selectCommerceDiscoveryPages(
        [
          { url: "https://example.com/dining", text: "Dining" },
          { url: "https://example.com/our-food", text: "Our food" },
          { url: "https://example.com/privacy", text: "Privacy" },
          { url: "https://example.com/blog/food", text: "Food" },
          { url: "https://example.com/tags/restaurants", text: "Restaurants" },
          { url: "https://other.example/restaurants", text: "Restaurants" },
          { url: "https://example.com/files/menu.pdf", text: "Menu" },
        ],
        "https://example.com/",
        "https://example.com/",
        2,
      ),
    ).toEqual([
      "https://example.com/dining",
      "https://example.com/our-food",
    ]);
  });

  it("keeps the first exact occurrence of each type and URL", () => {
    const menu = {
      type: "menu" as const,
      url: "https://example.com/menu",
      source_url: "https://example.com/",
    };
    expect(
      mergeDistinctCommerceLinks([
        [menu],
        [menu, { ...menu, url: "https://example.com/dinner-menu" }],
      ]),
    ).toEqual([
      menu,
      { ...menu, url: "https://example.com/dinner-menu" },
    ]);
  });

  it("caps noisy per-item link sets and deduplicates tracking variants", () => {
    const source_url = "https://example.com/";
    const menus = Array.from({ length: 7 }, (_, index) => ({
      type: "menu" as const,
      url: `https://example.com/menu-${index}`,
      source_url,
    }));
    const gifts = [
      {
        type: "gift_card" as const,
        url: "https://example.com/gift?utm_source=one",
        source_url,
      },
      {
        type: "gift_card" as const,
        url: "https://example.com/gift?utm_source=two",
        source_url,
      },
    ];
    const merged = mergeDistinctCommerceLinks([menus, gifts]);
    expect(merged.filter((link) => link.type === "menu")).toHaveLength(4);
    expect(merged.filter((link) => link.type === "gift_card")).toHaveLength(1);
  });

  it("sanitizes previously stored item links through the current classifier", () => {
    expect(
      sanitizeStoredCommerceLinks([
        {
          type: "menu",
          url: "https://example.com/menu?item=taco",
          anchor_text: "Taco",
          source_url: "https://example.com/",
        },
        {
          type: "order",
          url: "https://example.com/frederick/order-online",
          anchor_text: "View menu",
          source_url: "https://example.com/",
        },
      ]),
    ).toEqual([
      {
        type: "menu",
        url: "https://example.com/frederick/order-online",
        anchor_text: "View menu",
        source_url: "https://example.com/",
      },
    ]);
  });

  it("drops links that explicitly name another location's ZIP code", () => {
    const source_url = "https://example.com/";
    expect(
      filterCommerceLinksForPlace(
        [
          {
            type: "menu",
            url: "https://example.com/frederick-21701/menu",
            source_url,
          },
          {
            type: "menu",
            url: "https://example.com/hagerstown-21740/menu",
            source_url,
          },
          {
            type: "gift_card",
            url: "https://example.com/gift-card",
            source_url,
          },
        ],
        { postalCode: "21701" },
      ),
    ).toEqual([
      {
        type: "menu",
        url: "https://example.com/frederick-21701/menu",
        source_url,
      },
      {
        type: "gift_card",
        url: "https://example.com/gift-card",
        source_url,
      },
    ]);
  });

  it("reports checked places and exact link-type coverage", () => {
    expect(
      commerceCoverage(["one", "two", "three"], {
        one: {
          commerce_source: {
            url: "https://one.example",
            checkedAt: "2026-07-29T12:00:00.000Z",
          },
          commerce_links: [
            {
              type: "menu",
              url: "https://one.example/menu",
              source_url: "https://one.example",
            },
            {
              type: "order",
              url: "https://order.toasttab.com/online/one",
              source_url: "https://one.example",
            },
          ],
        },
        two: {
          commerce_source: {
            url: "https://two.example",
            checkedAt: "2026-07-29T12:00:00.000Z",
          },
        },
      }),
    ).toEqual({
      places: 3,
      checked: 2,
      withLinks: 1,
      links: 2,
      byType: { menu: 1, order: 1 },
    });
  });

  it("drops definitive dead links and unsafe redirect destinations", () => {
    const link = {
      type: "menu" as const,
      url: "https://example.com/old-menu",
      source_url: "https://example.com/",
    };
    expect(
      shouldKeepCommerceLinkAfterProbe(link, {
        status: 404,
        finalUrl: "https://example.com/old-menu",
      }),
    ).toBe(false);
    expect(
      shouldKeepCommerceLinkAfterProbe(link, {
        status: 200,
        finalUrl: "https://unrelated.example/menu",
      }),
    ).toBe(false);
    expect(
      shouldKeepCommerceLinkAfterProbe(link, {
        status: 403,
        finalUrl: "https://example.com/menu",
      }),
    ).toBe(true);
  });
});
