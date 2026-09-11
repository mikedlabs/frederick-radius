import { describe, expect, it } from "vitest";
import { commandDestination } from "./command-routing";

describe("universal command routing", () => {
  it("sends an urgent deterministic need to its direct answer", () => {
    expect(
      commandDestination({
        query: "where is a trash can",
        quickHref: "/amenities?need=trash",
        bestHref: "/search?q=trash",
        status: "done",
      }),
    ).toBe("/amenities?need=trash");
  });

  it("opens the best exact index match when there is no quick answer", () => {
    expect(
      commandDestination({
        query: "Gravel and Grind",
        bestHref: "/places/gravel-and-grind-frederick",
        status: "done",
      }),
    ).toBe("/places/gravel-and-grind-frederick");
  });

  it("uses Ask for a completed miss and Search while retrieval is unsettled", () => {
    expect(
      commandDestination({ query: "help me plan a rainy afternoon", status: "done" }),
    ).toBe("/ask?q=help%20me%20plan%20a%20rainy%20afternoon");
    expect(
      commandDestination({ query: "Gravel", status: "loading" }),
    ).toBe("/search?q=Gravel");
  });

  it("does nothing for an empty command", () => {
    expect(commandDestination({ query: "  ", status: "idle" })).toBeNull();
  });
});
