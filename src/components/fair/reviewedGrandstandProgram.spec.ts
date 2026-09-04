import { describe, expect, it } from "vitest";

import { greatFrederickFair2026Pack } from "@/data/fair/great-frederick-fair-2026-pack";

import { reviewedGrandstandPresentation } from "./reviewedGrandstandProgram";

const reviewedRows = greatFrederickFair2026Pack.schedule.days
  .flatMap((day) => day.items)
  .map((item) => ({
    item,
    presentation: reviewedGrandstandPresentation(
      item,
      new Date("2026-09-04T12:00:00-04:00"),
    ),
  }))
  .filter(
    (
      candidate,
    ): candidate is typeof candidate & {
      presentation: NonNullable<typeof candidate.presentation>;
    } => candidate.presentation !== null,
  );

describe("reviewedGrandstandPresentation", () => {
  it("recognizes exactly the six reviewed evening musical Grandstand rows", () => {
    expect(reviewedRows).toHaveLength(6);
    expect(reviewedRows.map(({ item }) => item.fairDate)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
  });

  it("keeps opener and headliner names and times in separate reviewed slots", () => {
    const splitBills = reviewedRows
      .map(({ presentation }) => presentation.billing)
      .filter((billing) => billing.mode === "opener-headliner");

    expect(splitBills).toHaveLength(4);
    expect(splitBills).toEqual([
      {
        mode: "opener-headliner",
        opener: {
          name: null,
          timeLabel: "6:30 p.m.",
          startsAt: "2026-09-18T18:30:00-04:00",
          role: "opener",
          nameStatus: "not-published",
        },
        headliner: {
          name: "Daughtry",
          timeLabel: "8 p.m.",
          startsAt: "2026-09-18T20:00:00-04:00",
          role: "headliner",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: "Mark Wills",
          timeLabel: "6:30 p.m.",
          startsAt: "2026-09-20T18:30:00-04:00",
          role: "opener",
          nameStatus: "named",
        },
        headliner: {
          name: "Neal McCoy",
          timeLabel: "8 p.m.",
          startsAt: "2026-09-20T20:00:00-04:00",
          role: "headliner",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: null,
          timeLabel: "6:30 p.m.",
          startsAt: "2026-09-24T18:30:00-04:00",
          role: "opener",
          nameStatus: "to-be-announced",
        },
        headliner: {
          name: "Danny Gokey",
          timeLabel: "8 p.m.",
          startsAt: "2026-09-24T20:00:00-04:00",
          role: "headliner",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: "Chris Darlington",
          timeLabel: "6:30 p.m.",
          startsAt: "2026-09-26T18:30:00-04:00",
          role: "opener",
          nameStatus: "named",
        },
        headliner: {
          name: "Warren Zeiders",
          timeLabel: "8 p.m.",
          startsAt: "2026-09-26T20:00:00-04:00",
          role: "headliner",
          nameStatus: "named",
        },
      },
    ]);
  });

  it("keeps current first-party corrections separate from the imported snapshot", () => {
    const byDate = new Map(
      reviewedRows.map(({ item, presentation }) => [
        item.fairDate,
        { sourceText: item.text, presentation },
      ]),
    );

    expect(byDate.get("2026-09-19")?.presentation.detail).toContain(
      "named different lead performers",
    );
    expect(byDate.get("2026-09-19")?.presentation.detail).toContain(
      "LFO, OTOWN, and Ryan Cabrera",
    );
    expect(byDate.get("2026-09-24")?.sourceText).toContain("Bay Turner");
    expect(byDate.get("2026-09-24")?.presentation.detail).toContain(
      "opener as TBA",
    );
    expect(byDate.get("2026-09-26")?.sourceText).toContain("w/ TBA");
    expect(byDate.get("2026-09-26")?.presentation.detail).toContain(
      "listed Chris Darlington",
    );
  });

  it("fails closed when a reviewed source row changes", () => {
    const daughtry = reviewedRows.find(
      ({ item }) => item.fairDate === "2026-09-18",
    )?.item;
    expect(daughtry).toBeDefined();
    if (!daughtry) return;

    expect(
      reviewedGrandstandPresentation(
        {
          ...daughtry,
          text: daughtry.text.replace("Daughtry -", "Updated billing -"),
        },
        new Date("2026-09-04T12:00:00-04:00"),
      ),
    ).toBeNull();
  });

  it("expires manual Grandstand corrections at midnight after the Fair in Frederick", () => {
    const daughtry = reviewedRows.find(
      ({ item }) => item.fairDate === "2026-09-18",
    )?.item;
    expect(daughtry).toBeDefined();
    if (!daughtry) return;

    expect(
      reviewedGrandstandPresentation(
        daughtry,
        new Date("2026-09-27T03:59:59Z"),
      ),
    ).not.toBeNull();
    expect(
      reviewedGrandstandPresentation(
        daughtry,
        new Date("2026-09-27T04:00:00Z"),
      ),
    ).toBeNull();
  });
});
