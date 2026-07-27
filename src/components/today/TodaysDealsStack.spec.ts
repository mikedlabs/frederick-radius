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
