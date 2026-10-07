import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventsBoardDock, {
  EVENTS_PRIMARY_WHEN_PRESETS,
  type EventsBoardDockProps,
} from "./EventsBoardDock";

const noop = () => undefined;

function renderDock(overrides: Partial<EventsBoardDockProps> = {}): string {
  const props: EventsBoardDockProps = {
    nowISO: "2026-10-07T14:00:00.000Z",
    tonightListed: true,
    todayListed: true,
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

/** The chip row's markup, from its opening tag to the sr-only status. */
function chipRow(html: string): string {
  const start = html.indexOf('class="eb-chiprow"');
  const end = html.indexOf('role="status"', start);
  return html.slice(start, end);
}

describe("EventsBoardDock hierarchy (UI audit: events board)", () => {
  it("keeps one preset row that ends on the one Filters doorway", () => {
    expect(EVENTS_PRIMARY_WHEN_PRESETS.map((preset) => preset.label)).toEqual([
      "Today",
      "Tonight",
      "This weekend",
    ]);
    const row = chipRow(renderDock());
    expect(row).toContain('aria-label="When"');
    const lastChip = Math.max(row.lastIndexOf(">Today<"), row.lastIndexOf(">This weekend<"));
    expect(row.indexOf(">Filters<")).toBeGreaterThan(lastChip);
  });

  it("prints no count row: the count is announced, not shown", () => {
    const html = renderDock();
    expect(html).not.toContain("eb-countline");
    expect(html).not.toContain("eb-subbar");
    expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite">1149 event listings · 10 towns<\/p>/);
  });

  it("puts Display in the title row as one 44px icon button on every width", () => {
    const html = renderDock({ view: "map", sort: "time" });
    expect(html.match(/class="eb-display-options"/g)).toHaveLength(1);
    expect(html).not.toContain("eb-display-desktop");
    expect(html).toContain('aria-label="Change event display. Map view, Soonest order."');
    const styles = readFileSync("src/app/globals.css", "utf8");
    const summaryRule = styles.slice(styles.indexOf(".eb-display-options > summary {"));
    expect(summaryRule).toMatch(/width: 44px;\s+height: 44px;/);
  });

  it("offers Tomorrow instead of an empty Tonight once tonight is spent", () => {
    const row = chipRow(renderDock({ tonightListed: false, todayListed: false }));
    expect(row).toContain(">Tomorrow<");
    expect(row).toContain(">This weekend<");
    expect(row).not.toContain(">Tonight<");
    expect(row).not.toContain(">Today<");
  });

  it("keeps a chosen Tonight pressed as one chip, with the summary in the Filters name", () => {
    const html = renderDock({ lens: "tonight", tonightListed: false, todayListed: false, anyFilter: true });
    const row = chipRow(html);
    expect(row).toMatch(/aria-pressed="true"[^>]*>(?:<span[^>]*><\/span>)?<span class="truncate">Tonight</);
    expect(row).toContain('<span class="eb-filter-summary">Tonight</span>');
    // Reset moved into the sheet head, so the row still ends on Filters.
    expect(row).not.toContain("Reset all event filters");
    expect(html).toContain("Reset all event filters");
  });

  it("moves the week ribbon out of the When pane", () => {
    const source = readFileSync("src/components/event/EventsBoardDock.tsx", "utf8");
    expect(source).not.toContain("EventWeekRibbon");
    expect(source).not.toContain("Pick a day");
    expect(source).toContain('aria-label="Event filter sections"');
    expect(source).toContain('aria-label="Event interests"');
    expect(source).toContain("More specific categories");
    expect(source).toContain('label="Order"');
  });
});
