import { describe, expect, it } from "vitest";
import { eventTown, backfillMunicipalityName } from "./eventTown";

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

describe("backfillMunicipalityName", () => {
  it("returns existing municipality_name when present", () => {
    expect(
      backfillMunicipalityName("frederick", "Frederick City"),
    ).toBe("Frederick City");
  });

  it("backfills from municipality slug when name is missing", () => {
    expect(
      backfillMunicipalityName("brunswick", ""),
    ).toBe("Brunswick");

    expect(
      backfillMunicipalityName("thurmont", undefined),
    ).toBe("Thurmont");
  });

  it("returns empty string when both are missing", () => {
    expect(
      backfillMunicipalityName("", ""),
    ).toBe("");

    expect(
      backfillMunicipalityName(undefined, undefined),
    ).toBe("");
  });

  it("returns empty string for unknown municipality slugs", () => {
    expect(
      backfillMunicipalityName("unknown-town", ""),
    ).toBe("");
  });

  it("preserves whitespace-trimmed existing names", () => {
    expect(
      backfillMunicipalityName("frederick", "  Frederick  "),
    ).toBe("Frederick");
  });
});
