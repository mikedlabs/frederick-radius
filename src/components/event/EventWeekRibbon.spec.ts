import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventWeekRibbon from "./EventWeekRibbon";

// Wednesday, October 7, 2026, 10 AM Eastern.
const NOW = "2026-10-07T14:00:00.000Z";

function render(countByDate: Record<string, number> | null, activeDay: string | null = null) {
  return renderToStaticMarkup(
    createElement(EventWeekRibbon, {
      nowISO: NOW,
      countByDate,
      activeDay,
      onPickDay: () => undefined,
    }),
  );
}

describe("EventWeekRibbon (visual first: seven days with real counts)", () => {
  it("prints the real count on every day that has events, not only today", () => {
    const html = render({ "2026-10-07": 41, "2026-10-09": 63, "2026-10-10": 120 });
    expect(html.match(/<button/g)).toHaveLength(7);
    expect(html).toContain(">41<");
    expect(html).toContain(">63<");
    expect(html).toContain(">120<");
    expect(html).toContain('aria-label="Friday 9, 63 events"');
    expect(html).toContain('aria-label="Thursday 8, 0 events"');
  });

  it("prints no numbers while a narrowed board is still loading", () => {
    const html = render(null);
    expect(html.match(/<button/g)).toHaveLength(7);
    expect(html).toContain('aria-label="Wednesday 7, today"');
    expect(html).not.toMatch(/, \d+ events?"/);
  });

  it("marks the picked day pressed", () => {
    const html = render({ "2026-10-10": 5 }, "2026-10-10");
    expect(html).toMatch(/aria-pressed="true" aria-label="Saturday 10, 5 events"/);
  });
});
