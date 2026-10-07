import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CommerceActions from "./CommerceActions";
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

  it("keeps every commerce link an outlined secondary so Directions stays the one primary", () => {
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
        ],
        placeSlug: "example",
        placeName: "Example Cafe",
      }),
    );
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    const commerceAnchors = anchors.filter((tag) => tag.includes('target="_blank"'));

    expect(commerceAnchors).toHaveLength(2);
    for (const tag of commerceAnchors) {
      const style = tag.match(/style="([^"]*)"/)?.[1] ?? "";
      expect(style).toContain("background-color:var(--app-bg-elevated)");
      expect(style).not.toContain("--app-brand");
      expect(tag).not.toContain("tactile-glow-brand");
      expect(tag).not.toContain("rounded-full");
      expect(tag).toContain("rounded-[var(--app-radius-md)]");
    }
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
});
