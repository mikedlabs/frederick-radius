import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Open now scope contract", () => {
  it("does not invent a downtown origin for whole-county browsing", () => {
    expect(source).not.toContain("FREDERICK_CENTER");
    expect(source).toContain("const origin = homeCentroid ?? undefined");
  });

  it("passes the selected-town boundary and origin trust to both inventories", () => {
    expect(source).toContain(
      "municipality: rankingContext.filterMunicipality ?? undefined",
    );
    expect(source).toContain("originSource: rankingContext.source");
    expect(source).toContain(
      "getOpenNowSnapshot(now, origin, 0, openNowRanking)",
    );
    expect(source).toContain(
      "likelyOpenPlaces(origin, now, openNowRanking)",
    );
  });
});

describe("Open now trust contract", () => {
  it("titles the page as an estimate and says the uncertainty once", () => {
    expect(source).toContain("title: OPEN_NOW_TITLE");
    expect(source).toContain("{OPEN_NOW_TITLE}");
    expect(source).toContain("openNowSummary(snapshot.count, likely.length)");
    expect(source).not.toMatch(/confirmed open/i);
    // The likely list no longer repeats the header's caveat in a paragraph.
    expect(source).not.toContain("These places are usually open at this hour");
    expect(source).toContain("label: LIKELY_OPEN_CHECK_HOURS");
  });

  it("names the pin map for what its pinned list claims, never 'open now' for likely rows", () => {
    expect(source).not.toMatch(/name:\s*"places open now"/);
    expect(source).toMatch(
      /pinnedKey === "likely"\s*\?\s*"places likely open at this hour"\s*:\s*"places whose recently checked hours say they are open"/,
    );
    expect(source).toContain("name: pinMapName");
  });

  it("marks happy hour only inside a structured window and never parses notes text", () => {
    expect(source).toContain("happyHourOnAt(p.slug, now)");
    expect(source).not.toContain("fieldNotesFor");
    expect(source).not.toContain("parseHappyHour");
    expect(source).not.toMatch(/\?\s*"deal"/);
  });
});
