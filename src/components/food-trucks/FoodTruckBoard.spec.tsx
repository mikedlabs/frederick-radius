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

const VOID_TAGS = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * The text a screen reader can reach: static markup with every aria-hidden
 * subtree removed and the remaining tags stripped.
 */
function accessibleText(html: string): string {
  let out = "";
  let hiddenDepth = 0;
  let last = 0;
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    if (hiddenDepth === 0) out += html.slice(last, match.index);
    last = tag.lastIndex;
    const [, closing, name, attrs, selfClosing] = match;
    const isVoid = Boolean(selfClosing) || VOID_TAGS.has(name.toLowerCase());
    if (closing) {
      if (hiddenDepth > 0) hiddenDepth -= 1;
    } else if (hiddenDepth > 0) {
      if (!isVoid) hiddenDepth += 1;
    } else if (/\saria-hidden="true"/.test(attrs) && !isVoid) {
      hiddenDepth = 1;
    }
    if (hiddenDepth === 0) out += " ";
  }
  if (hiddenDepth === 0) out += html.slice(last);
  return out.replace(/\s+/g, " ").trim();
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

  it("tells assistive tech the stop's day, because the date plate is aria-hidden", () => {
    const html = renderToStaticMarkup(<FoodTruckStopRow stop={stop()} timing="upcoming" />);

    expect(html).toContain('<time dateTime="2026-10-08T21:00:00.000Z" class="sr-only">');
    const spoken = accessibleText(html);
    expect(spoken).toContain("Thursday, October 8 · 5:00 to 9:00 PM · Steinhardt Brewing Company · Frederick");
    // The plate's own letters stay out of the accessible text.
    expect(spoken).not.toMatch(/\bOct\b/);
    expect(spoken).not.toMatch(/\bThu\b/);
  });

  it("reads the day on the Eastern clock, not UTC", () => {
    // 10:30 PM Eastern on Wed Oct 7 is already Oct 8 in UTC.
    const html = renderToStaticMarkup(
      <FoodTruckStopRow
        stop={stop({ startsAt: "2026-10-08T02:30:00.000Z", endsAt: undefined })}
        timing="upcoming"
      />,
    );
    expect(accessibleText(html)).toContain("Wednesday, October 7 · 10:30 PM");
  });

  it("says nothing about a day when the stop has no usable start", () => {
    const html = renderToStaticMarkup(
      <FoodTruckStopRow stop={stop({ startsAt: "not a date" })} timing="upcoming" />,
    );
    expect(html).not.toContain("<time");
    expect(accessibleText(html)).toContain("Time not listed");
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
    expect(accessibleText(html)).toContain("Thursday, October 8 · Scheduled now · 5:00 to 9:00 PM");
  });
});
