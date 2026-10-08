import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HORIZON_PEEK, eventGroupRenderState } from "./EventsExplorer";

const source = readFileSync("src/components/event/EventsExplorer.tsx", "utf8");

/** The body of a named function component in the explorer source. */
function functionBody(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("Events board rows (UI review: three row styles in one section)", () => {
  it("leads every section with its first row, never a poster or glance card", () => {
    expect(source).not.toContain('variant="feature"');
    expect(source).not.toContain('variant="glance"');
    expect(source).not.toContain("PromotedEvent");
    expect(source).not.toContain("data-events-primary-lead");
  });

  it("renders lists as ruled rows with no outer card", () => {
    const list = functionBody("EventRowList");
    expect(list).toContain('variant="compact"');
    expect(list).not.toMatch(/\bborder\b(?!-b-0)/);
    expect(list).not.toContain("rounded-");
    expect(list).not.toContain("--app-elev-1");
    expect(source).not.toContain("CompactEventList");
  });

  it("changes lists in place, without staggered or spring entrances", () => {
    expect(source).not.toContain("framer-motion");
    expect(source).not.toMatch(/\bmotion\./);
    expect(source).not.toContain("staggerChildren");
    expect(source).not.toContain("reveal-up");
  });

  it("caps the list column at 720px from 1024px up, but not the calendar or map", () => {
    expect(source).toContain('const LIST_COLUMN = "space-y-3 lg:max-w-[720px]";');
    expect(source).toContain(
      'className={view === "calendar" || view === "map" ? "space-y-3" : LIST_COLUMN}',
    );
  });

  it("peeks four rows per horizon, all of them the same row", () => {
    expect(HORIZON_PEEK).toBe(4);
    expect(
      eventGroupRenderState({
        loadedCount: 6,
        dataComplete: true,
        anyFilter: false,
        sourceDegraded: false,
        hasLead: false,
        peek: HORIZON_PEEK,
      }),
    ).toEqual({ groupCount: 6, totalRest: 6, canExpand: true });
  });
});

describe("Events flyer rail placement", () => {
  it("sits under the week ribbon and its answer sentence, outside the capped list column", () => {
    const ribbon = source.indexOf("<EventWeekRibbon");
    const answer = source.indexOf("data-events-answer", ribbon);
    const rail = source.indexOf("<EventFlyerRail", ribbon);
    const results = source.indexOf(": LIST_COLUMN}");
    expect(ribbon).toBeGreaterThan(0);
    expect(rail).toBeGreaterThan(answer);
    expect(answer).toBeGreaterThan(ribbon);
    // Only the one answer sentence comes between the ribbon and the rail.
    const between = source.slice(source.indexOf("/>", ribbon), rail);
    expect(between.match(/<(section|div)\b/g) ?? []).toHaveLength(2);
    expect(between).toContain("data-events-answer");
    expect(between).toContain('id="events-partial-why"');
    expect(results).toBeGreaterThan(rail);
  });

  it("feeds the rail from the current filtered window in list view only", () => {
    expect(source).toMatch(
      /view === "list" \? flyerRailItems\(filtered, \{ nowMs: now \}\) : \[\]/,
    );
  });
});
