import { describe, it, expect } from "vitest";
import { toBreakdownRow } from "./plausible-stats";

describe("toBreakdownRow", () => {
  it("reads the label from whichever field is not a metric", () => {
    expect(toBreakdownRow({ page: "/events", visitors: 12, events: 30 })).toEqual({
      label: "/events",
      visitors: 12,
      events: 30,
    });
    expect(toBreakdownRow({ name: "ask_submit", visitors: 4 })).toEqual({
      label: "ask_submit",
      visitors: 4,
      events: 4, // falls back to visitors when the events metric is absent
    });
    expect(toBreakdownRow({ query: "vegan brunch thurmont", visitors: 2, events: 3 })).toEqual({
      label: "vegan brunch thurmont",
      visitors: 2,
      events: 3,
    });
  });

  it("rejects rows with no usable label", () => {
    expect(toBreakdownRow({ visitors: 5, events: 5 })).toBeNull();
    expect(toBreakdownRow({ page: "   ", visitors: 5 })).toBeNull();
  });
});
