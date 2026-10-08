import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventsBoardDock, { type EventsBoardDockProps } from "./EventsBoardDock";

const noop = () => undefined;

function renderDock(overrides: Partial<EventsBoardDockProps> = {}): string {
  const props: EventsBoardDockProps = {
    nowISO: "2026-10-07T14:00:00.000Z",
    filteredCount: 1149,
    resultTownCount: 10,
    countComplete: true,
    categories: [],
    towns: [],
    intent: null,
    setIntent: noop,
    sub: null,
    setSub: noop,
    cat: null,
    setCat: noop,
    lens: "all",
    setLens: noop,
    tod: null,
    setTod: noop,
    day: null,
    setDay: noop,
    town: null,
    setTown: noop,
    q: "",
    setQ: noop,
    freeOnly: false,
    setFreeOnly: noop,
    happyOnly: false,
    setHappyOnly: noop,
    kidsOnly: false,
    setKidsOnly: noop,
    lgbtqOnly: false,
    setLgbtqOnly: noop,
    communicationAccessOnly: false,
    setCommunicationAccessOnly: noop,
    recurringOnly: false,
    setRecurringOnly: noop,
    anyFilter: false,
    clear: noop,
    view: "list",
    setView: noop,
    sort: "recommended",
    setSort: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(EventsBoardDock, props));
}

/** The Filters row's markup, from its opening tag to the sr-only status. */
function chipRow(html: string): string {
  const start = html.indexOf('class="eb-chiprow"');
  const end = html.indexOf('role="status"', start);
  return html.slice(start, end);
}

describe("EventsBoardDock hierarchy (UI audit: events board)", () => {
  it("titles the board in Ink only, with no two-tone accent", () => {
    const html = renderDock();
    expect(html).toContain('<h2 class="eb-title font-serif">What’s on</h2>');
    expect(html).not.toContain("eb-title-on");
  });

  it("keeps no date chips: the week ribbon is the one date control", () => {
    const html = renderDock();
    expect(html).not.toContain('aria-label="When"');
    expect(html).not.toContain("eb-whenribbon");
    const row = chipRow(html);
    expect(row).not.toContain(">Tomorrow<");
    expect(row).not.toContain(">This weekend<");
    expect(row).not.toContain(">Tonight<");
    expect(row).not.toContain(">Today<");
  });

  it("puts Display at the end of the Filters row as one 44px icon button", () => {
    const html = renderDock({ view: "map", sort: "time" });
    const row = chipRow(html);
    expect(row.indexOf(">Filters<")).toBeGreaterThan(-1);
    expect(row.indexOf("data-events-display")).toBeGreaterThan(row.indexOf(">Filters<"));
    expect(html.match(/data-events-display/g)).toHaveLength(1);
    expect(html).not.toContain("eb-display-options");
    expect(html).toContain('aria-label="Change event display. Map view, Soonest order."');
    // 44px square summary, pushed to the row's end, and never squeezed.
    expect(row).toMatch(/class="group relative ml-auto shrink-0"/);
    expect(row).toMatch(/<summary class="grid h-11 w-11 /);
    // The Filters button may shrink and truncate, so at 320px the two never
    // overlap.
    expect(row).toContain("eb-filter-trigger tap-44-y !min-w-0 !flex-[0_1_auto]");
  });

  it("prints no count row: the count is announced, not shown", () => {
    const html = renderDock();
    expect(html).not.toContain("eb-countline");
    expect(html).not.toContain("eb-subbar");
    expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite">1149 event listings · 10 towns<\/p>/);
  });

  it("keeps the full readout in the Filters name but shows only the sheet's choices", () => {
    const weekend = chipRow(renderDock({ lens: "weekend", freeOnly: true, anyFilter: true }));
    expect(weekend).toContain('<span class="eb-filter-summary">Free · This weekend</span>');
    // The ribbon already draws the weekend, so the eye reads only "Free".
    expect(weekend).toMatch(/data-filter-visible-summary="true"[^>]*>Free<\/span>/);
    expect(weekend).toMatch(/<span class="eb-filter-count" aria-hidden="true">1<\/span>/);

    const picked = chipRow(renderDock({ day: "2026-10-10", tod: "evening", anyFilter: true }));
    expect(picked).toContain('<span class="eb-filter-summary">Sat 10 · Evening</span>');
    expect(picked).toMatch(/data-filter-visible-summary="true"[^>]*>Evening<\/span>/);

    const farDate = chipRow(renderDock({ day: "2026-12-05", anyFilter: true }));
    expect(farDate).toMatch(/data-filter-visible-summary="true"[^>]*>Sat 5<\/span>/);

    const plain = chipRow(renderDock());
    expect(plain).not.toContain("data-filter-visible-summary");
    expect(plain).not.toContain("eb-filter-count");
  });

  it("keeps Reset in the sheet head, so the row ends on Display", () => {
    const html = renderDock({ lens: "tonight", anyFilter: true });
    const row = chipRow(html);
    expect(row).not.toContain("Reset all event filters");
    expect(html).toContain("Reset all event filters");
  });

  it("keeps What, When and Where in the sheet, with When down to dayparts and a date", () => {
    const source = readFileSync("src/components/event/EventsBoardDock.tsx", "utf8");
    expect(source).not.toContain("EventWeekRibbon");
    expect(source).not.toContain("Pick a day");
    expect(source).not.toContain("WHEN_PRESETS");
    expect(source).not.toContain("Jump to next weekend");
    expect(source).toContain("<Sect>Time of day</Sect>");
    expect(source).toContain("Jump to a date");
    expect(source).toContain('aria-label="Event filter sections"');
    expect(source).toContain('aria-label="Event interests"');
    expect(source).toContain("More specific categories");
    expect(source).toContain('label="Order"');
  });
});
