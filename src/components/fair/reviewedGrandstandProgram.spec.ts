import { describe, expect, it } from "vitest";

import { greatFrederickFair2026Pack } from "@/data/fair/great-frederick-fair-2026-pack";

import { reviewedGrandstandPresentation } from "./reviewedGrandstandProgram";

const reviewedRows = greatFrederickFair2026Pack.schedule.days
  .flatMap((day) => day.items)
  .map((item) => ({
    item,
    presentation: reviewedGrandstandPresentation(item),
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
          nameStatus: "not-published",
        },
        headliner: {
          name: "Daughtry",
          timeLabel: "8 p.m.",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: "Mark Wills",
          timeLabel: "6:30 p.m.",
          nameStatus: "named",
        },
        headliner: {
          name: "Neal McCoy",
          timeLabel: "8 p.m.",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: "Bay Turner",
          timeLabel: "6:30 p.m.",
          nameStatus: "named",
        },
        headliner: {
          name: "Danny Gokey",
          timeLabel: "8 p.m.",
          nameStatus: "named",
        },
      },
      {
        mode: "opener-headliner",
        opener: {
          name: null,
          timeLabel: "6:30 p.m.",
          nameStatus: "to-be-announced",
        },
        headliner: {
          name: "Warren Zeiders",
          timeLabel: "8 p.m.",
          nameStatus: "named",
        },
      },
    ]);
  });

  it("fails closed when a reviewed source row changes", () => {
    const daughtry = reviewedRows.find(
      ({ item }) => item.fairDate === "2026-09-18",
    )?.item;
    expect(daughtry).toBeDefined();
    if (!daughtry) return;

    expect(
      reviewedGrandstandPresentation({
        ...daughtry,
        text: daughtry.text.replace("Daughtry -", "Updated billing -"),
      }),
    ).toBeNull();
  });
});
