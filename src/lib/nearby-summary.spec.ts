import { describe, expect, it } from "vitest";
import { keepListedRows, nearbyCountSentence, openNowThinNote } from "./nearby-summary";

describe("Nearby summary copy", () => {
  it("states confirmed-open counts as a complete supporting sentence", () => {
    expect(nearbyCountSentence({ mode: "hours", total: 204, openCount: 1, mayReportNoneOpen: false }))
      .toBe("1 of 204 places is confirmed open right now.");
    expect(nearbyCountSentence({ mode: "hours", total: 40, openCount: 3, mayReportNoneOpen: true, phrase: "for dinner" }))
      .toBe("3 of 40 places are confirmed open for dinner right now.");
    expect(nearbyCountSentence({ mode: "open-only", total: 40, openCount: 5, mayReportNoneOpen: true }))
      .toBe("5 places are confirmed open right now.");
    expect(nearbyCountSentence({ mode: "closing-soon", total: 40, openCount: 1, mayReportNoneOpen: true }))
      .toBe("1 place is open and closing within the hour.");
    expect(nearbyCountSentence({ mode: "no-hours", total: 1, openCount: 0, mayReportNoneOpen: false }))
      .toBe("1 place matches.");
    expect(nearbyCountSentence({ mode: "legacy-filter", total: 9, openCount: 2, mayReportNoneOpen: false }))
      .toBe("2 places match this link's hours filter.");
  });

  it("never turns missing hours into a claim that places are closed", () => {
    expect(nearbyCountSentence({ mode: "hours", total: 204, openCount: 0, mayReportNoneOpen: false }))
      .toBe("None of the 204 places have confirmed open hours right now.");
    expect(nearbyCountSentence({ mode: "hours", total: 12, openCount: 0, mayReportNoneOpen: true }))
      .toBe("None of the 12 places are open right now.");
    expect(nearbyCountSentence({ mode: "hours", total: 1, openCount: 0, mayReportNoneOpen: false }))
      .toBe("This place has no confirmed open hours right now.");
  });

  it("keeps the nearest places under one plain line when Open now is thin", () => {
    expect(openNowThinNote({ nearbyOpen: 0, area: "nearby" }))
      .toBe("Nothing nearby is confirmed open right now, so the nearest places are shown instead.");
    expect(openNowThinNote({ nearbyOpen: 0, area: "nearby", closestOpen: { distance_m: 9_978, town: "Walkersville" } }))
      .toBe("Nothing nearby is confirmed open right now, so the nearest places are shown instead. The closest place confirmed open is 6.2 mi away, in Walkersville.");
    expect(openNowThinNote({ nearbyOpen: 1, area: "in Thurmont", phrase: "for dinner" }))
      .toBe("Only 1 place in Thurmont is confirmed open for dinner right now, so it is marked among the nearest places.");
    expect(openNowThinNote({ nearbyOpen: 2, area: "nearby" }))
      .toBe("Only 2 places nearby are confirmed open right now, so they are marked among the nearest places.");
  });

  it("names best matches, not the nearest places, when the list has no distance origin", () => {
    expect(openNowThinNote({ nearbyOpen: 0, area: "in the county", order: "best" }))
      .toBe("Nothing in the county is confirmed open right now, so the best matches are shown instead.");
    expect(openNowThinNote({ nearbyOpen: 2, area: "in the county", order: "best" }))
      .toBe("Only 2 places in the county are confirmed open right now, so they are marked among the best matches.");
    expect(openNowThinNote({ nearbyOpen: 0, area: "nearby", order: "rated" }))
      .toBe("Nothing nearby is confirmed open right now, so the top rated places are shown instead.");
  });

  it("keeps every row the note promises even past the list limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: i, open: i === 18 }));
    const shown = keepListedRows(rows, 16, (r) => r.open);
    expect(shown.map((r) => r.id)).toEqual([...Array.from({ length: 16 }, (_, i) => i), 18]);
    expect(keepListedRows(rows, 16, () => false)).toHaveLength(16);
  });

  it("writes no em dashes", () => {
    const copy = [
      nearbyCountSentence({ mode: "hours", total: 3, openCount: 0, mayReportNoneOpen: false }),
      openNowThinNote({ nearbyOpen: 0, area: "nearby", closestOpen: { distance_m: 5_000, town: null } }),
    ].join(" ");
    expect(copy).not.toMatch(/—/);
  });
});
