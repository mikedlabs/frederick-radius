import { describe, expect, it } from "vitest";
import { snapshotFreshnessAnomaly } from "./curated-freshness";

const NOW = new Date("2026-07-23T12:00:00Z");

describe("snapshotFreshnessAnomaly", () => {
  it("reports an empty materialization", () => {
    expect(
      snapshotFreshnessAnomaly(
        "hours.json",
        [],
        NOW,
        8,
        "Run the refresh.",
      ),
    ).toMatchObject({
      source: "hours.json",
      kind: "snapshot_expired",
    });
  });

  it("uses the newest valid row and ignores malformed timestamps", () => {
    expect(
      snapshotFreshnessAnomaly(
        "hours.json",
        ["bad", "2026-07-22T12:00:00Z", "2026-06-01T00:00:00Z"],
        NOW,
        8,
        "Run the refresh.",
      ),
    ).toBeNull();
  });

  it("reports a snapshot older than its allowed window", () => {
    expect(
      snapshotFreshnessAnomaly(
        "status.json",
        ["2026-07-18T12:00:00Z"],
        NOW,
        2,
        "Check the workflow.",
      )?.detail,
    ).toContain("5 days old");
  });
});
