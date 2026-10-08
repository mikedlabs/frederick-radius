import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source contracts for the lower half of Today: the day program under its
 * pin map, the one-line weather row, and the two-column desktop briefing.
 * The program and weather render inside async server components that read
 * live feeds, so these checks read the page source the way TodayHierarchy
 * does; TonightMap, TomorrowPreview and TodayCard carry the rendered tests.
 */
const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");
const layoutCss = readFileSync("src/components/today/TodayLayout.module.css", "utf8");

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `${start} is present`).toBeGreaterThan(-1);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
}

const programRow = slice(todayPage, "function ProgramRow(", "\n}\n");
const whatsOn = slice(todayPage, "async function WhatsOn(", "\n}\n");
const weather = slice(todayPage, "<section data-today-weather", "</section>");

describe("Today's day program rows", () => {
  it("numbers a row with the pin it shares with the map, in Brick with a Cream numeral", () => {
    expect(programRow).toContain("data-today-pin-disc");
    expect(programRow).toContain('background: "var(--app-brand)", color: "var(--app-bg)"');
    expect(programRow).toMatch(/text-caption[^"]*h-\[22px\] w-\[22px\][^"]*font-bold/);
  });

  it("drops the raw-hex category dot and marks a live row with the Amber dot", () => {
    expect(todayPage).not.toContain("CATEGORY_BY_SLUG");
    expect(programRow).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(programRow).toContain('background: "var(--app-amber)"');
    expect(programRow).toContain('{live ? "Now" : time}');
  });

  it("sets time, title and place on the named type scale", () => {
    expect(programRow).toContain("text-meta-lg flex w-[60px]");
    expect(programRow).toContain("tabular-nums");
    expect(programRow).toContain('"text-title-sm"');
    expect(programRow).toContain("line-clamp-2");
    expect(programRow).not.toMatch(/text-\[\d/);
  });

  it("shows only a publisher flyer, whole on paper, and hides a frame that fails", () => {
    expect(programRow).toContain('eventVisualTreatment(visual) === "flyer"');
    expect(programRow).toContain('<RadiusPhotoWhen is="visible">');
    expect(programRow).toContain('fit="contain"');
    expect(programRow).toContain('alt=""');
    // Nothing is drawn over the flyer: the RadiusPhoto takes no children.
    expect(programRow).toMatch(/<RadiusPhoto\b[^>]*\/>/);
  });
});

describe("Today's day program", () => {
  it("leads the rows with the pin map and numbers rows from the same plan", () => {
    const map = whatsOn.indexOf("<TonightMap");
    const rows = whatsOn.indexOf("{programGroups.map(");
    expect(map).toBeGreaterThan(-1);
    expect(map).toBeLessThan(rows);
    expect(whatsOn).toContain(
      "tonightMapPlan(programMapRows(programRows), PROGRAM_COMPACT_MAX)",
    );
    expect(whatsOn).toContain("pin={mapPlan.numbers.get(programRowKey(e)) ?? null}");
  });

  it("keeps one route to the full board under the rows, named for the daypart", () => {
    expect(whatsOn).toContain('href="/events"');
    expect(whatsOn).toContain(
      '{tonight ? "All of tonight\'s events" : "All of today\'s events"}',
    );
    expect(whatsOn).not.toContain("DismissibleSection");
    expect(whatsOn).not.toContain("more {late");
  });

  it("never calls a failed read an empty day", () => {
    // The degraded, row-less state hands over to the recovery sentence.
    expect(whatsOn).toMatch(/<TodayEventsRecovery \/>/);
    // A partial read keeps its rows and says the list may be incomplete.
    expect(whatsOn).toContain(
      "Some calendars did not load, so this list may be missing events.",
    );
    expect(whatsOn).toContain("sourceHealth.degraded ? null : (");
  });
});

describe("Today's weather row", () => {
  it("is one link row to the full forecast with no second link inside the section", () => {
    expect(weather).toContain('href="/pulse?open=weather"');
    expect(weather).toContain("styles.weatherRow");
    expect(weather.match(/<AppTransitionLink\b/g)).toHaveLength(1);
    expect(weather).not.toContain("<TodayPlanTonightLink");
    expect(weather).not.toContain("Countywide weather</span>");
  });

  it("replaces the sunken card with a 56px row under a 1px rule", () => {
    const weatherRule = slice(layoutCss, ".weather {", "}");
    expect(weatherRule).toContain("border-top: 1px solid var(--app-border);");
    expect(weatherRule).not.toContain("background");
    expect(weatherRule).not.toContain("border-radius");
    expect(slice(layoutCss, ".weatherRow {", "}")).toContain("min-height: 56px;");
  });
});

describe("Today's briefing columns", () => {
  it("drops the card chrome from the place and event columns", () => {
    const columns = slice(layoutCss, ".places,\n.events {", "}");
    expect(columns).not.toMatch(/border|box-shadow|padding|background/);
    expect(layoutCss).not.toMatch(/\.events\s*\{[^}]*border/);
  });

  it("sets the desktop briefing at five parts places and seven parts events", () => {
    const desktop = slice(layoutCss, "@media (min-width: 1024px) {", "\n}\n");
    expect(desktop).toContain("grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);");
    expect(desktop).toContain("gap: 32px;");
    // DOM order stays places first, then the events chapter.
    expect(todayPage.indexOf("className={styles.places}")).toBeLessThan(
      todayPage.indexOf("className={styles.events}"),
    );
  });
});
