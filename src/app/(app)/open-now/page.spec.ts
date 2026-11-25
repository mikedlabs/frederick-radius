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

describe("Open now honesty contract", () => {
  it("qualifies a repeated name from the rows it renders, and only those rows", () => {
    // The qualifier is computed over the same two lists the page prints, so
    // a store whose namesake is not on the page keeps a plain row. The rule
    // itself, town callback included, is behavior-tested in
    // name-qualifiers.spec.ts.
    expect(source).toContain("const likelyShown = likely.slice(0, 12);");
    expect(source).toContain("openNowNameQualifiers([...verified, ...likelyShown])");
    expect(source).toContain("rows: likelyShown.map((p) => toRow(p, false))");
    expect(source).toContain(
      'meta: [cat?.name ?? p.category, nameQualifiers.get(p.slug), hook].filter(Boolean).join(" · ")',
    );
  });

  it("prints the lede and coverage sentence from openNowHeaderCopy, before the /trust link", () => {
    // Which sentence prints in which lede state is behavior-tested in
    // coverage-note.spec.ts. This pins only the page's wiring and order.
    expect(source).toContain("confirmedOpen: snapshot.count,");
    expect(source).toContain("likelyOpen: likely.length,");
    expect(source).toContain(
      "coverage = { current: counts.placesWithCurrentHours.value, total: counts.activePublicPlaces.value };",
    );
    const lede = source.indexOf("{lede}");
    const note = source.indexOf("{coverageNote}");
    const trust = source.indexOf('href="/trust"');
    const headerEnd = source.indexOf("</GuideHeader>");
    expect(lede).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(lede);
    expect(trust).toBeGreaterThan(note);
    expect(headerEnd).toBeGreaterThan(trust);
    // The heading stays the plain interface label, never the count.
    expect(source).toContain('<GuideHeader title="Open now"');
  });

  it("describes the page as confirmed-open places, not everything that is open", () => {
    expect(source).not.toContain("What's open right now across Frederick County");
    expect(source).toContain("Places confirmed open right now in Frederick County, from recently checked hours");
  });
});
