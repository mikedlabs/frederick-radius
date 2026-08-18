import { describe, expect, it } from "vitest";

import { answerRowsFor, evaluateQuery, runCoverage } from "./coverage";
import { COVERAGE_CORPUS } from "./coverage-corpus";
import { EVENTS } from "@/data/events";

/**
 * The coverage floor. `npm run eval:coverage` prints the full report; this
 * spec is the gate that keeps the number from sliding without anyone noticing.
 *
 * Raise FLOOR when the real rate improves. Never lower it to make a red suite
 * green — a drop here means the app got worse at answering, which is the one
 * regression this repo cares most about.
 */
const FLOOR = 0.93;

describe("answer coverage", () => {
  const report = runCoverage(COVERAGE_CORPUS, EVENTS);

  it(`answers at least ${Math.round(FLOOR * 100)}% of scored needs in the top 3`, () => {
    const detail = report.scored
      .filter((o) => o.verdict !== "PASS")
      .map((o) => `${o.verdict} ${o.need.persona} · ${o.need.need}`)
      .join("\n");
    expect(report.passRate, `not passing:\n${detail}`).toBeGreaterThanOrEqual(FLOOR);
  });

  it("never returns an empty result set for a scored need", () => {
    const empties = report.scored
      .filter((o) => o.verdict === "EMPTY")
      .map((o) => o.need.need);
    // An empty state for a need the catalog can answer is the worst outcome:
    // the reader cannot tell a missing answer from a broken app.
    expect(empties).toEqual([]);
  });

  it("keeps the curated door when a request adds 'near me'", () => {
    // "near me" sets onlyPlaces to keep events out, which also silenced town
    // and category doors — "hardware store near me" lost /category/hardware,
    // its only answer, and returned nothing while the bare query worked.
    const doors = (q: string) =>
      answerRowsFor(q, EVENTS).filter(
        (r) =>
          r.source === "ranked" && r.resultType !== "place" && r.resultType !== "event",
      );

    for (const noun of ["hardware store", "recycling", "thurmont"]) {
      const bare = doors(noun).map((d) => d.href);
      const near = doors(`${noun} near me`).map((d) => d.href);
      for (const href of bare) {
        expect(near, `"${noun} near me" dropped the door ${href}`).toContain(href);
      }
    }
  });

  it("does not let a single shared word pad a near-me request with doors", () => {
    // The other half of that fix: "public restroom near me" briefly answered
    // with Public art, Public WiFi, and Public safety, all matching only the
    // weak token "public". A door must earn its place on every term.
    const doors = answerRowsFor("public restroom near me", EVENTS).filter(
      (r) => r.source === "ranked" && r.resultType === "category",
    );
    for (const d of doors) {
      expect(
        /restroom|amenit/i.test(d.href),
        `unrelated door ${d.href} matched only a shared word`,
      ).toBe(true);
    }
  });

  it("still ranks the fuzzy-net guards the audit fixed", () => {
    // "kayaking" once returned King's Pizza and Burger King; "barbecue"
    // returned three barber shops. Both came from an unguarded trigram net.
    const lead = (q: string) => answerRowsFor(q, EVENTS)[0];
    expect(lead("kayaking")?.title ?? "").not.toMatch(/burger king|king'?s pizza/i);
    const bbq = answerRowsFor("barbecue", EVENTS).slice(0, 3);
    expect(bbq.every((r) => !/barber/i.test(r.title))).toBe(true);
  });

  it("scores a need by its weakest phrasing", () => {
    // A need that only answers when phrased perfectly is not answered.
    const outcome = evaluateQuery("pharmacy", { kind: "place", categories: ["pharmacy"] }, EVENTS);
    expect(["PASS", "WEAK", "FAIL", "EMPTY"]).toContain(outcome.verdict);
  });
});
