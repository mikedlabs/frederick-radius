import { describe, expect, it } from "vitest";
import { eventTown } from "./eventTown";

describe("eventTown", () => {
  it("labels City-of-Frederick events as Downtown Frederick", () => {
    expect(
      eventTown({ municipality: "frederick", municipality_name: "Frederick" }),
    ).toBe("Downtown Frederick");
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
