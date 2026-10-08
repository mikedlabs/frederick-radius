import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CommerceActions, { commerceSectionTitle, commerceSupportSegments } from "./CommerceActions";
import type { CommerceLink } from "@/lib/commerce/types";

describe("CommerceActions hierarchy", () => {
  it("renders the primary action first and keeps one compact support line", () => {
    const links: CommerceLink[] = [
      {
        type: "menu",
        provider: "website",
        url: "https://example.com/menu",
        source: "imported",
      },
      {
        type: "order",
        provider: "website",
        url: "https://example.com/order",
        source: "owner",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CommerceActions, {
        links,
        placeSlug: "example",
        placeName: "Example Cafe",
      }),
    );

    expect(html.indexOf("Order online")).toBeLessThan(
      html.indexOf("View menu"),
    );
    expect(html).not.toContain("Opens with the restaurant");
    expect(html).toContain("Owner-provided");
    expect(html).toContain("Report a broken link");
  });

  it("titles the section in sentence case with a shared section heading, not caps", () => {
    const html = renderToStaticMarkup(
      createElement(CommerceActions, {
        links: [
          { type: "menu", provider: "website", url: "https://example.com/menu", source: "imported" },
        ],
        placeSlug: "example",
        placeName: "Example Cafe",
      }),
    );

    expect(html).toContain('aria-label="Menu and ordering"');
    expect(html).toMatch(/<h2[^>]*>[\s\S]*Menu and ordering[\s\S]*<\/h2>/);
    expect(html).not.toContain("eyebrow");
    expect(html).not.toContain("Menu &amp; ordering");
    expect(html).not.toContain("uppercase");
  });

  it("sets every commerce link as a 52px ruled row so Directions stays the one primary", () => {
    const html = renderToStaticMarkup(
      createElement(CommerceActions, {
        links: [
          {
            type: "order",
            provider: "toast",
            url: "https://order.toasttab.com/online/example",
            source: "imported",
          },
          {
            type: "reservation",
            provider: "website",
            url: "https://example.com/reserve",
            source: "imported",
          },
          {
            type: "catering",
            provider: "website",
            url: "https://example.com/catering",
            source: "imported",
          },
          {
            type: "gift_card",
            provider: "website",
            url: "https://example.com/gift",
            source: "imported",
          },
        ],
        placeSlug: "example",
        placeName: "Example Cafe",
      }),
    );
    const rows = html.match(/<li [^>]*>[\s\S]*?<\/li>/g) ?? [];
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    const commerceAnchors = anchors.filter((tag) => tag.includes('target="_blank"'));

    expect(rows).toHaveLength(4);
    expect(commerceAnchors).toHaveLength(4);
    for (const row of rows) {
      expect(row).toContain("border-b");
      // The type icon, the label, then the external-link mark.
      expect(row.match(/<svg/g)).toHaveLength(2);
      expect(row).toContain("lucide-external-link");
    }
    for (const tag of commerceAnchors) {
      const style = tag.match(/style="([^"]*)"/)?.[1] ?? "";
      expect(tag).toContain("min-h-13");
      expect(style).toContain("color:var(--app-ink)");
      expect(style).not.toContain("background");
      expect(style).not.toContain("--app-brand");
      expect(tag).not.toContain("tactile");
      expect(tag).not.toContain("rounded");
    }
    expect(html).toContain("Catering");
    expect(html).toContain("Gift card");
  });

  it("describes a Toast URL as a handoff, not a live integration", () => {
    const html = renderToStaticMarkup(
      createElement(CommerceActions, {
        links: [
          {
            type: "order",
            provider: "toast",
            url: "https://order.toasttab.com/online/example",
            source: "imported",
          },
        ],
        placeSlug: "example",
        placeName: "Example Cafe",
      }),
    );

    expect(html).toContain("Ordering via Toast");
    expect(html).not.toContain("Toast-connected");
  });

  it("names Toast once in the support line", () => {
    expect(commerceSupportSegments(true, "Toast · Imported · Updated Jul 29")).toEqual([
      "Ordering via Toast",
      "Imported",
      "Updated Jul 29",
    ]);
    expect(commerceSupportSegments(true, "")).toEqual(["Ordering via Toast"]);
    expect(commerceSupportSegments(false, "Owner-provided")).toEqual(["Owner-provided"]);
    expect(commerceSupportSegments(false, "")).toEqual([]);
  });

  it("titles the section by what the links offer", () => {
    expect(commerceSectionTitle([{ type: "order", provider: "website", url: "https://e.com/o" }])).toBe("Menu and ordering");
    expect(commerceSectionTitle([{ type: "reservation", provider: "website", url: "https://e.com/r" }])).toBe("Reservations");
    expect(commerceSectionTitle([{ type: "gift_card", provider: "website", url: "https://e.com/g" }])).toBe("Ordering");
  });
});
