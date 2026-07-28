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

  it("exposes one safe direct link per extracted commerce type", () => {
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
    };

    expect(commerceLinksFromBusinessInfo("example", info)).toMatchObject([
      {
        type: "menu",
        url: "https://example.com/dinner-menu",
        provider: "website",
        source: "imported",
      },
      {
        type: "order",
        url: "https://order.toasttab.com/online/example",
        provider: "toast",
        source: "imported",
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

  it("exposes the reservation links already present in the feed", () => {
    expect(businessInfoCommerceLinks("7th-sister")).toMatchObject([
      {
        type: "reservation",
        url: "https://7thsister.com/reservations",
        source: "imported",
      },
    ]);
  });
});
