import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapFoodTruckPeek from "./MapFoodTruckPeek";

describe("MapFoodTruckPeek trust labels", () => {
  afterEach(() => vi.useRealTimers());

  it("uses live language only for an operator-confirmed beacon", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    const html = renderToStaticMarkup(createElement(MapFoodTruckPeek, {
      pin: {
        id: "beacon:in10se-bbq",
        slug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.414,
        lng: -77.41,
        href: "/food-trucks#truck-in10se-bbq",
        availability: "operator-live",
        spot: "Baker Park",
        startedAt: "2026-08-22T17:00:00.000Z",
        expiresAt: "2026-08-22T21:00:00.000Z",
        sourceName: "Operator live beacon",
        sourceUrl: "/food-trucks#truck-in10se-bbq",
      },
      onClose: vi.fn(),
    } satisfies ComponentProps<typeof MapFoodTruckPeek>));

    expect(html).toContain("Operator confirmed live");
    expect(html).toContain("Baker Park");
    expect(html).not.toContain("Published stop");
  });

  it("labels a venue schedule as a plan and never as live presence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    const html = renderToStaticMarkup(createElement(MapFoodTruckPeek, {
      pin: {
        id: "schedule:stop-1:in10se-bbq",
        slug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.414,
        lng: -77.41,
        href: "/food-trucks#truck-in10se-bbq",
        availability: "published-stop",
        venueName: "Test Venue",
        startedAt: "2026-08-22T19:00:00.000Z",
        expiresAt: "2026-08-22T22:00:00.000Z",
        sourceName: "Test Venue",
        sourceUrl: "https://example.com/schedule",
        sourceConfidence: "venue",
      },
      onClose: vi.fn(),
    } satisfies ComponentProps<typeof MapFoodTruckPeek>));

    expect(html).toContain("Published stop");
    expect(html).toContain("This stop is published for today at 3pm.");
    expect(html).toContain("The schedule does not confirm that the truck has arrived.");
    expect(html).toContain("Schedule source");
    expect(html).not.toContain("Operator confirmed live");
  });
});
