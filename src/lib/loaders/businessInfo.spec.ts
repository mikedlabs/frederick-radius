import { describe, expect, it } from "vitest";
import {
  businessInfoCommerceLinks,
  commerceLinksFromBusinessInfo,
  type BusinessInfo,
} from "./businessInfo";

describe("business-info commerce links", () => {
  it("normalizes an official reservation URL without claiming verification", () => {
    const info: BusinessInfo = {
      reservations_url: "https://example.com/reservations",
      source: {
        url: "https://example.com",
        fetchedAt: "2026-07-20T12:00:00.000Z",
      },
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toEqual([
      {
        place_id: "example",
        type: "reservation",
        url: "https://example.com/reservations",
        provider: "website",
        source: "imported",
        last_verified_at: "2026-07-20T12:00:00.000Z",
        notes: "Published on the business's official website.",
      },
    ]);
  });

  it("rejects non-web reservation links", () => {
    const info: BusinessInfo = {
      reservations_url: "javascript:alert(1)",
      source: {
        url: "https://example.com",
        fetchedAt: "2026-07-20T12:00:00.000Z",
      },
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toEqual([]);
  });

  it("keeps distinct menu documents while limiting other action types", () => {
    const info: BusinessInfo = {
      commerce_links: [
        {
          type: "menu",
          url: "https://example.com/dinner-menu",
          anchor_text: "Dinner menu",
          source_url: "https://example.com",
        },
        {
          type: "menu",
          url: "https://example.com/lunch-menu",
          anchor_text: "Lunch menu",
          source_url: "https://example.com",
        },
        {
          type: "order",
          url: "https://order.toasttab.com/online/example",
          anchor_text: "Order online",
          source_url: "https://example.com",
        },
      ],
      source: {
        url: "https://example.com",
        fetchedAt: "2026-07-20T12:00:00.000Z",
      },
      commerce_source: {
        url: "https://example.com",
        checkedAt: "2026-07-28T12:00:00.000Z",
      },
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toMatchObject([
      {
        type: "menu",
        url: "https://example.com/dinner-menu",
        label: "Dinner menu",
        provider: "website",
        source: "imported",
        last_verified_at: "2026-07-28T12:00:00.000Z",
      },
      {
        type: "menu",
        url: "https://example.com/lunch-menu",
        label: "Lunch menu",
        provider: "website",
        source: "imported",
        last_verified_at: "2026-07-28T12:00:00.000Z",
      },
      {
        type: "order",
        url: "https://order.toasttab.com/online/example",
        provider: "toast",
        source: "imported",
        last_verified_at: "2026-07-28T12:00:00.000Z",
      },
    ]);
  });

  it("rejects unsafe and provider-search links from generated records", () => {
    const info = {
      commerce_links: [
        {
          type: "menu",
          url: "javascript:alert(1)",
          source_url: "https://example.com",
        },
        {
          type: "order",
          url: "https://www.doordash.com/search/store/example",
          source_url: "https://example.com",
        },
      ],
      source: {
        url: "https://example.com",
        fetchedAt: "2026-07-20T12:00:00.000Z",
      },
    } as BusinessInfo;

    expect(commerceLinksFromBusinessInfo("example", info)).toEqual([]);
  });

  it("shows one strongest action when menu and order share a destination", () => {
    const info: BusinessInfo = {
      commerce_links: [
        {
          type: "menu",
          url: "https://www.example.com/order/?source=popup",
          anchor_text: "View menu",
          source_url: "https://example.com/",
        },
        {
          type: "order",
          url: "https://example.com/order",
          anchor_text: "Order online",
          source_url: "https://example.com/",
        },
      ],
      source: {
        url: "https://example.com/",
        fetchedAt: "2026-07-31T12:00:00.000Z",
      },
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toMatchObject([
      {
        type: "order",
        url: "https://example.com/order",
      },
    ]);
  });

  it("supports a commerce-only record without inventing a business-fact source", () => {
    const info: BusinessInfo = {
      commerce_links: [
        {
          type: "menu",
          url: "https://example.com/menu",
          source_url: "https://example.com/",
        },
      ],
      commerce_source: {
        url: "https://example.com/",
        checkedAt: "2026-07-29T12:00:00.000Z",
      },
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toEqual([
      {
        place_id: "example",
        type: "menu",
        url: "https://example.com/menu",
        provider: "website",
        source: "imported",
        last_verified_at: "2026-07-29T12:00:00.000Z",
        notes: "Published on the business's official website.",
      },
    ]);
  });

  it("exposes the reservation links already present in the feed", () => {
    expect(businessInfoCommerceLinks("7th-sister")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "reservation",
          url: "https://7thsister.com/reservations",
          source: "imported",
        }),
      ]),
    );
  });
});
