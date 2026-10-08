import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventWeekRibbon from "./EventWeekRibbon";
import type { TimeKey } from "./boardCaption";

// Wednesday, October 7, 2026, 10 AM Eastern.
const NOW = "2026-10-07T14:00:00.000Z";
const WEEKEND = ["2026-10-09", "2026-10-10", "2026-10-11"];

function render(
  countByDate: Record<string, number> | null,
  options: { day?: string | null; lens?: TimeKey } = {},
) {
  return renderToStaticMarkup(
    createElement(EventWeekRibbon, {
      nowISO: NOW,
      countByDate,
      lens: options.lens ?? "all",
      day: options.day ?? null,
      weekendDays: WEEKEND,
      onPickDay: () => undefined,
      onToggleWeekend: () => undefined,
    }),
  );
}

/** The markup of one day cell, found by its accessible name's prefix. */
function cell(html: string, namePrefix: string): string {
  const start = html.indexOf(`aria-label="${namePrefix}`);
  expect(start, `${namePrefix} cell`).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<button", start);
  return html.slice(open, html.indexOf("</button>", start));
}

describe("EventWeekRibbon (the one date control on /events)", () => {
  it("is the When group: seven day cells plus one This weekend button", () => {
    const html = render({ "2026-10-07": 41 });
    expect(html).toContain('role="group" aria-label="When"');
    expect(html.match(/<button/g)).toHaveLength(8);
    expect(html).toMatch(/aria-pressed="false"[^>]*>This weekend<\/button>/);
    // No eighth day: seven cells fit 320px only at seven.
    expect(html.match(/aria-label="(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day \d+/g)).toHaveLength(7);
  });

  it("names the month the numerals belong to on the caption line", () => {
    expect(render(null)).toContain(">October</p>");
    const crossing = renderToStaticMarkup(
      createElement(EventWeekRibbon, {
        nowISO: "2026-10-28T14:00:00.000Z",
        countByDate: null,
        lens: "all",
        day: null,
        weekendDays: [],
        onPickDay: () => undefined,
        onToggleWeekend: () => undefined,
      }),
    );
    expect(crossing).toContain(">October and November</p>");
  });

  it("marks days with events by a dot and keeps the count in the name, not on the face", () => {
    const html = render({ "2026-10-07": 41, "2026-10-09": 63, "2026-10-10": 120 });
    expect(html).not.toContain(">41<");
    expect(html).not.toContain(">63<");
    expect(html).not.toContain(">120<");
    expect(html.match(/data-has-events="true"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Friday 9, 63 events"');
    expect(html).toContain('aria-label="Thursday 8, 0 events"');
  });

  it("shows no dots and announces no numbers while a narrowed board is still loading", () => {
    const html = render(null);
    expect(html.match(/<button/g)).toHaveLength(8);
    expect(html).toContain('aria-label="Wednesday 7, today"');
    expect(html).not.toMatch(/, \d+ events?"/);
    expect(html).not.toContain('data-has-events="true"');
  });

  it("outlines a picked day in Ink and marks it pressed, never with a Brick fill", () => {
    const html = render({ "2026-10-10": 5 }, { day: "2026-10-10" });
    const saturday = cell(html, "Saturday 10");
    expect(saturday).toContain('aria-pressed="true"');
    expect(saturday).toContain("inset 1.5px 0 0 0 var(--app-ink)");
    expect(saturday).toContain("inset -1.5px 0 0 0 var(--app-ink)");
    expect(html).not.toMatch(/background:\s*color-mix\(in srgb, var\(--app-brand\)/);
    expect(html).not.toContain("var(--app-brand-press);color:var(--app-on-brand)");
  });

  it("keeps today's weekday letter in Brick press", () => {
    const today = cell(render(null), "Wednesday 7, today");
    expect(today).toContain("color:var(--app-brand-press)");
  });

  it("maps ?lens=tonight and ?lens=tomorrow onto one pressed cell", () => {
    expect(cell(render(null, { lens: "tonight" }), "Wednesday 7")).toContain('aria-pressed="true"');
    expect(cell(render(null, { lens: "tomorrow" }), "Thursday 8")).toContain('aria-pressed="true"');
    expect(render(null, { lens: "all" })).not.toMatch(/aria-pressed="true"/);
  });

  it("draws the weekend as one outlined run with This weekend pressed", () => {
    const html = render({ "2026-10-10": 5 }, { lens: "weekend" });
    expect(html).toMatch(/aria-pressed="true"[^>]*>This weekend<\/button>/);
    const friday = cell(html, "Friday 9");
    const saturday = cell(html, "Saturday 10");
    const sunday = cell(html, "Sunday 11");
    // Tapping Saturday still means Saturday alone, so no cell is pressed.
    for (const day of [friday, saturday, sunday]) {
      expect(day).toContain('aria-pressed="false"');
      expect(day).toContain(", part of this weekend");
      expect(day).toContain('data-selected="true"');
    }
    // Only the run's ends close the outline.
    expect(friday).toContain("inset 1.5px 0 0 0 var(--app-ink)");
    expect(friday).not.toContain("inset -1.5px 0 0 0 var(--app-ink)");
    expect(saturday).not.toContain("inset 1.5px 0 0 0 var(--app-ink)");
    expect(saturday).not.toContain("inset -1.5px 0 0 0 var(--app-ink)");
    expect(sunday).toContain("inset -1.5px 0 0 0 var(--app-ink)");
  });

  it("drops the frosted blur and the weekend gray tint", () => {
    const source = readFileSync("src/components/event/EventWeekRibbon.tsx", "utf8");
    expect(source).not.toContain("backdrop-blur");
    expect(source).not.toContain("--app-cool");
    expect(source).not.toMatch(/text-\[\d/);
    expect(source).toContain("min-h-16 min-w-11");
  });
});
