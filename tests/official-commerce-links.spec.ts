import { describe, expect, it } from "vitest";
import {
  classifyOfficialCommerceLinks,
  extractPageAnchors,
  isSafeOfficialCommerceDestination,
  normalizePageAnchor,
} from "../scripts/lib/official-commerce-links";

describe("official-site commerce-link extraction", () => {
  it("resolves real anchors and rejects unsafe or non-web hrefs", () => {
    const html = `
      <a href="/menus/dinner.pdf?lang=en&amp;view=1"><strong>Dinner Menu</strong></a>
      <a href="mailto:hello@example.com">Email us</a>
      <a href="javascript:alert(1)">Order</a>
      <a href="#hours">Hours</a>
      <a aria-label="Gift cards" href="/gift-cards"><img src="/gift.svg"></a>
    `;

    expect(extractPageAnchors(html, "https://example.com/restaurant")).toEqual([
      {
        url: "https://example.com/menus/dinner.pdf?lang=en&view=1",
        text: "Dinner Menu",
      },
      {
        url: "https://example.com/gift-cards",
        text: "Gift cards",
      },
    ]);
    expect(
      normalizePageAnchor(
        "https://user:password@example.com/order",
        "Order",
        "https://example.com",
      ),
    ).toBeNull();
  });

  it("classifies menu, order, reservation, catering, and gift-card anchors", () => {
    const sourceUrl = "https://example.com/";
    const links = classifyOfficialCommerceLinks(
      [
        { url: "https://example.com/menu", text: "View our menu" },
        {
          url: "https://order.toasttab.com/online/example",
          text: "Order online",
        },
        {
          url: "https://www.opentable.com/r/example-frederick",
          text: "Book a table",
        },
        { url: "https://example.com/catering", text: "Catering" },
        { url: "https://example.com/gift-cards", text: "Gift cards" },
      ],
      sourceUrl,
    );

    expect(links.map(({ type }) => type)).toEqual([
      "menu",
      "order",
      "reservation",
      "catering",
      "gift_card",
    ]);
    expect(links[1]).toEqual({
      type: "order",
      url: "https://order.toasttab.com/online/example",
      anchor_text: "Order online",
      source_url: sourceUrl,
    });
  });

  it("does not turn provider-wide searches into direct capabilities", () => {
    const links = classifyOfficialCommerceLinks(
      [
        {
          url: "https://www.opentable.com/s?term=Frederick",
          text: "Reservations",
        },
        {
          url: "https://www.doordash.com/search/store/tacos",
          text: "Order online",
        },
        {
          url: "https://example.com/private-events",
          text: "Book a private event",
        },
        {
          url: "https://www.opentable.com/",
          text: "Reservations",
        },
        {
          url: "https://www.doordash.com/",
          text: "Order online",
        },
      ],
      "https://example.com/",
    );

    expect(links).toEqual([]);
  });

  it("puts the strongest anchor first within a commerce type", () => {
    const links = classifyOfficialCommerceLinks(
      [
        { url: "https://example.com/menu", text: "" },
        { url: "https://example.com/dinner-menu", text: "Dinner Menu" },
      ],
      "https://example.com/",
    );

    expect(links.map(({ url }) => url)).toEqual([
      "https://example.com/dinner-menu",
      "https://example.com/menu",
    ]);
  });

  it("does not mistake a same-site homepage backlink for an exact menu", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          { url: "https://example.com/", text: "Menu" },
          { url: "https://example.com/dinner-menu", text: "Dinner menu" },
        ],
        "https://example.com/dining",
      ),
    ).toEqual([
      {
        type: "menu",
        url: "https://example.com/dinner-menu",
        anchor_text: "Dinner menu",
        source_url: "https://example.com/dining",
      },
    ]);
  });

  it("uses the published link meaning instead of guessing from a provider host", () => {
    const links = classifyOfficialCommerceLinks(
      [
        {
          url: "https://order.toasttab.com/online/example/menu",
          text: "View menu",
        },
        {
          url: "https://www.opentable.com/blog/example",
          text: "Dining guide",
        },
      ],
      "https://example.com/",
    );

    expect(links).toEqual([
      {
        type: "menu",
        url: "https://order.toasttab.com/online/example/menu",
        anchor_text: "View menu",
        source_url: "https://example.com/",
      },
    ]);
  });

  it("prefers explicit menu wording over an order-looking URL", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://example.com/frederick/order-online",
            text: "View menu",
          },
        ],
        "https://example.com/",
      ),
    ).toEqual([
      {
        type: "menu",
        url: "https://example.com/frederick/order-online",
        anchor_text: "View menu",
        source_url: "https://example.com/",
      },
    ]);
  });

  it("rejects item deep links, generic indexes, and non-action paths", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://example.com/menu?item=crab-cake&matchItemName=Crab%20Cake",
            text: "Crab Cake",
          },
          {
            url: "https://example.com/order-online/menus/all-day/52008273",
            text: "Crab cake · $18",
          },
          {
            url: "https://example.com/menu-item/crab-cake",
            text: "Crab cake",
          },
          { url: "https://example.com/locations", text: "Order online" },
          { url: "https://example.com/login", text: "Order online" },
          {
            url: "https://example.com/[...marketing]",
            text: "Order now",
          },
          { url: "https://example.com/menu", text: "Menu" },
        ],
        "https://example.com/",
      ),
    ).toEqual([
      {
        type: "menu",
        url: "https://example.com/menu",
        anchor_text: "Menu",
        source_url: "https://example.com/",
      },
    ]);
  });

  it("does not turn Wheel Base's pickup product category into an order action", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://www.wheelbasebikes.com/product-list/car-racks-1215/pickup-rv-spare-tire-mount-1218/",
            text: "Pickup/RV/Spare-Tire Mount",
          },
        ],
        "https://www.wheelbasebikes.com/",
      ),
    ).toEqual([]);
  });

  it("does not attach a generic civic reservation department to a park", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://www.recreater.com/298/Reservations",
            text: "Reservations",
          },
        ],
        "https://www.recreater.com/192/Dog-Parks",
      ),
    ).toEqual([]);
  });

  it("refuses commerce actions when the source itself is a directory", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://www.bringfido.com/user/reservations/",
            text: "Reservations",
          },
        ],
        "https://www.bringfido.com/attraction/12519",
      ),
    ).toEqual([]);
  });

  it("preserves a vetted entity-specific provider action", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://order.toasttab.com/online/jojosrestauranttaphouse",
            text: "Order online",
          },
        ],
        "https://order.toasttab.com/online/jojosrestauranttaphouse",
      ),
    ).toEqual([
      {
        type: "order",
        url: "https://order.toasttab.com/online/jojosrestauranttaphouse",
        anchor_text: "Order online",
        source_url:
          "https://order.toasttab.com/online/jojosrestauranttaphouse",
      },
    ]);
  });

  it("rejects a generic provider reservation-management page", () => {
    expect(
      classifyOfficialCommerceLinks(
        [
          {
            url: "https://www.opentable.com/my/reservations",
            text: "Reservations",
          },
        ],
        "https://www.opentable.com/my/reservations",
      ),
    ).toEqual([]);
  });

  it("rejects unrelated directories even when their anchor text says menu", () => {
    const links = classifyOfficialCommerceLinks(
      [
        {
          url: "https://unrelated.example/menu",
          text: "View menu",
        },
        {
          url: "https://www.yelp.com/menu/example-frederick",
          text: "Menu",
        },
      ],
      "https://example.com/",
    );

    expect(links).toEqual([]);
  });

  it("allows business-specific providers and narrowly trusted menu PDFs", () => {
    expect(
      isSafeOfficialCommerceDestination(
        "https://example.com/",
        "https://order.toasttab.com/online/example",
        "order",
      ),
    ).toBe(true);
    expect(
      isSafeOfficialCommerceDestination(
        "https://example.com/",
        "https://static1.squarespace.com/static/123/menu.pdf",
        "menu",
      ),
    ).toBe(true);
    expect(
      isSafeOfficialCommerceDestination(
        "https://example.com/",
        "https://static1.squarespace.com/static/123/menu.pdf",
        "order",
      ),
    ).toBe(false);
  });
});
