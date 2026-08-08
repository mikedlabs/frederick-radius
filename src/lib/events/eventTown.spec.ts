import { describe, expect, it } from "vitest";
import { eventTown } from "./eventTown";

describe("eventTown", () => {
  it("does not overstate a City-of-Frederick event as downtown", () => {
    expect(
      eventTown({ municipality: "frederick", municipality_name: "Frederick" }),
    ).toBe("Frederick");
  });

  it("passes other towns through unchanged", () => {
    expect(
      eventTown({ municipality: "brunswick", municipality_name: "Brunswick" }),
    ).toBe("Brunswick");
  });

  it("returns null when the town is unknown", () => {
    expect(eventTown({})).toBeNull();
    expect(eventTown({ municipality_name: "   " })).toBeNull();
  });
});
