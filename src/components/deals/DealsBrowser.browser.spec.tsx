// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DealRow } from "@/lib/deals/dealRow";
import { DealCard, groupDealsByVenue } from "./DealsBrowser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function deal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    slug: "one-place",
    name: "One Place",
    town: "Frederick",
    category: "bar",
    offer: "$5 drafts",
    headline: "$5 drafts",
    fullOffer: "Tuesday: $5 drafts, 4 PM–7 PM",
    hours: "4 PM–7 PM",
    days: [2],
    verified: "Verified July 2026",
    confidence: "high",
    ...overrides,
  };
}

const PHOTO = "/api/place-photo?name=places%2Fone&w=800";
// Tuesday, Oct 6, noon Eastern.
const NOW = new Date("2026-10-06T16:00:00.000Z");

function card(row: DealRow, featured = false) {
  return (
    <DealCard
      group={groupDealsByVenue([row])[0]}
      day={2}
      today={2}
      now={NOW}
      featured={featured}
    />
  );
}

describe("DealCard photo", () => {
  it("asks for the venue photo's failure signal", () => {
    const html = renderToStaticMarkup(card(deal({ photo: PHOTO })));

    expect(html).toContain('data-deal-photo="photo"');
    expect(html).toContain(
      'src="/api/place-photo?name=places%2Fone&amp;w=800&amp;fallback=signal"',
    );
  });

  it("reads from its header, not gradient art, when the venue has no photo", () => {
    const html = renderToStaticMarkup(card(deal(), true));

    expect(html).toContain('data-deal-photo="none"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("linear-gradient(145deg");
    expect(html).toContain(">Bar</p>");
    // A featured card without a picture does not keep an empty photo column.
    expect(html).not.toContain("sm:grid-cols-");
  });

  describe("in the browser", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      container.remove();
    });

    it.each(["signal", "error"] as const)(
      "drops the band and its overlays on a proxy %s",
      async (outcome) => {
        await act(async () => root.render(card(deal({ photo: PHOTO }), true)));
        const img = container.querySelector("img")!;

        await act(async () => {
          if (outcome === "error") {
            img.dispatchEvent(new Event("error"));
            return;
          }
          Object.defineProperties(img, {
            naturalWidth: { configurable: true, value: 1 },
            naturalHeight: { configurable: true, value: 1 },
          });
          img.dispatchEvent(new Event("load"));
        });
        await act(async () => {
          await Promise.resolve();
        });

        const article = container.querySelector("article")!;
        expect(article.getAttribute("data-deal-photo")).toBe("none");
        expect(container.querySelector("img")).toBeNull();
        expect(article.className).not.toContain("sm:grid-cols-");
        expect(article.querySelector("header")?.textContent).toContain("Bar");
      },
    );
  });
});
