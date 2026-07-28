import { describe, expect, it } from "vitest";
import {
  classifyOfficialCommerceLinks,
  extractPageAnchors,
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
});
