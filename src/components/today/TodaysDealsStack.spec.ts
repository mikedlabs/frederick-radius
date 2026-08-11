import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import TodaysDealsStack from "./TodaysDealsStack";

function deal(photo?: string): TodaysDeal {
  return {
    slug: "test-special",
    name: "Test Restaurant",
    category: "restaurant",
    photo,
    offer: "$5 special",
    headline: "$5 special",
    verified: "Verified",
    confidence: "high",
  };
}

function render(photo?: string): string {
  return renderToStaticMarkup(
    createElement(TodaysDealsStack, {
      deals: [deal(photo)],
      weekday: "Sunday",
      now: new Date("2026-07-26T16:00:00.000Z"),
    }),
  );
}

describe("TodaysDealsStack footer denominator", () => {
  const tue6pm = new Date("2026-07-14T18:00:00-04:00");
  const timedDeal = (slug: string, hours?: string): TodaysDeal => ({
    ...deal(),
    slug,
    name: `Venue ${slug}`,
    hours,
  });

  it("counts only specials still actionable today, never the ones already over", () => {
    const html = renderToStaticMarkup(
      createElement(TodaysDealsStack, {
        deals: [
          timedDeal("live", "5–9 PM"),
          timedDeal("later", "8–10 PM"),
          timedDeal("all-day", "All day"),
          timedDeal("soft", "6 PM"),
          timedDeal("over-1", "11 AM–2 PM"),
          timedDeal("over-2", "7–10 AM"),
        ],
        weekday: "Tuesday",
        now: tue6pm,
      }),
    );

    // 4 actionable (live/later/all-day/soft), 2 already over. The footer
    // must agree with the band's split counts, not restate the raw total.
    expect(html).toContain("See all 4 specials still on today");
    expect(html).not.toContain("6 specials");
  });

  it("offers the weekly browser instead of a redundant count when every special is visible", () => {
    const html = renderToStaticMarkup(
      createElement(TodaysDealsStack, {
        deals: [timedDeal("live", "5–9 PM"), timedDeal("later", "8–10 PM")],
        weekday: "Tuesday",
        now: tue6pm,
      }),
    );

    expect(html).toContain("See the full week of specials");
    expect(html).not.toContain("See all 2");
  });

  it("keeps the Today briefing to two specials while preserving the full count", () => {
    const html = renderToStaticMarkup(
      createElement(TodaysDealsStack, {
        deals: [
          timedDeal("first", "5–9 PM"),
          timedDeal("second", "5–9 PM"),
          timedDeal("third", "5–9 PM"),
        ],
        weekday: "Tuesday",
        now: tue6pm,
        embedded: true,
      }),
    );

    expect(html).toContain("/places/first");
    expect(html).toContain("/places/second");
    expect(html).not.toContain("/places/third");
    expect(html).toContain("See all 3 specials still on today");
  });
});

describe("TodaysDealsStack business media", () => {
  it("renders the venue photo carried by the deal row", () => {
    const html = render("/api/place-photo?name=test-special");

    expect(html).toContain('data-place-media="photo"');
    expect(html).toContain('data-place-slug="test-special"');
    expect(html).toContain("/api/place-photo?name=test-special");
  });

  it("keeps a category fallback when the venue has no approved photo", () => {
    const html = render();

    expect(html).toContain('data-place-media="fallback"');
    expect(html).not.toContain("<img");
  });
});
