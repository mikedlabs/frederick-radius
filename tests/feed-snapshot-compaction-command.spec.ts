import { describe, expect, it } from "vitest";
import { requestedCompactionBatches } from "../scripts/compact-feed-snapshots";

describe("feed snapshot compaction command", () => {
  it("defaults to one bounded batch", () => {
    expect(requestedCompactionBatches([])).toBe(1);
  });

  it("accepts an explicit bounded maintenance window", () => {
    expect(requestedCompactionBatches(["--batches=10"])).toBe(10);
    expect(requestedCompactionBatches(["--batches", "4"])).toBe(4);
  });

  it.each(["0", "11", "1.5", "many"])("rejects unsafe batch count %s", (value) => {
    expect(() => requestedCompactionBatches([`--batches=${value}`])).toThrow(
      "--batches must be an integer from 1 to 10.",
    );
  });
});
