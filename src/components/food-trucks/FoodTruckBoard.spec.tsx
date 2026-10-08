import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import { FoodTruckStopList, FoodTruckStopRow, stopWindowLabel } from "./FoodTruckBoard";

function stop(overrides: Partial<FoodTruckScheduleStop> = {}): FoodTruckScheduleStop {
  return {
    id: "stop-1",
    title: "Three Daughters at Steinhardt",
    // 5:00 PM to 9:00 PM Eastern on Thu Oct 8, 2026.
    startsAt: "2026-10-08T21:00:00.000Z",
    endsAt: "2026-10-09T01:00:00.000Z",
    venueName: "Steinhardt Brewing Company",
    municipality: "Frederick",
    vendors: [{ name: "dōp Pizza", slug: "dop-pizza" }],
    sourceName: "Steinhardt Brewing Company",
    sourceUrl: "https://example.com/steinhardt/food-trucks",
    confidence: "venue",
    ...overrides,
  };
}

describe("stopWindowLabel", () => {
  it("says the window once when both ends share a meridiem", () => {
    expect(stopWindowLabel(stop())).toBe("5:00 to 9:00 PM");
  });

  it("names both meridiems when the stop crosses noon", () => {
    expect(
      stopWindowLabel(stop({ startsAt: "2026-10-10T15:00:00.000Z", endsAt: "2026-10-10T18:00:00.000Z" })),
    ).toBe("11:00 AM to 2:00 PM");
  });

  it("never invents a closing time", () => {
    expect(stopWindowLabel(stop({ endsAt: undefined }))).toBe("5:00 PM");
  });
});

describe("FoodTruckStopRow", () => {
  it("renders one ruled row with a date plate, the logo, the window and a 44px Directions button", () => {
    const html = renderToStaticMarkup(<FoodTruckStopRow stop={stop()} timing="upcoming" />);

    expect(html).toContain('class="food-truck-stop-row"');
    expect(html).toContain('data-stop-timing="upcoming"');
    // The date plate prints the month, day and weekday.
    expect(html).toContain(">Oct<");
    expect(html).toContain(">8<");
    expect(html).toContain(">Thu<");
    expect(html).toContain('data-photo-state="official-mark"');
    expect(html).toContain('data-size="thumb"');
    expect(html).toContain("5:00 to 9:00 PM · Steinhardt Brewing Company · Frederick");
    expect(html).toContain('aria-label="Directions to Steinhardt Brewing Company"');
    expect(html).toContain('class="food-truck-stop-directions"');
    expect(html).toContain("Steinhardt Brewing Company source");
    // No lettered plate and no picture band.
    expect(html).not.toContain("food-truck-vendor-mark");
    expect(html).not.toContain("food-truck-stop-visual");
  });

  it("gives an unlisted vendor the Truck mark", () => {
    const html = renderToStaticMarkup(
      <FoodTruckStopRow stop={stop({ vendors: [{ name: "Three Daughters" }] })} timing="upcoming" />,
    );
    expect(html).toContain('data-photo-state="fallback"');
    expect(html).not.toContain(">TD<");
  });

  it("marks a stop inside its published window as scheduled now", () => {
    const html = renderToStaticMarkup(<FoodTruckStopRow stop={stop()} timing="active" />);
    expect(html).toContain("Scheduled now");
  });
});

describe("FoodTruckStopList", () => {
  it("classifies each stop on the clock the page passed in", () => {
    const html = renderToStaticMarkup(
      <FoodTruckStopList stops={[stop()]} asOf="2026-10-08T22:00:00.000Z" />,
    );
    expect(html).toContain('class="food-truck-stop-list"');
    expect(html).toContain('data-stop-timing="active"');
  });
});
