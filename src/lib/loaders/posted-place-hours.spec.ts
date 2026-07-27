import { describe, expect, it } from "vitest";
import { storedPostedHoursPlaces } from "./posted-place-hours";

describe("stored posted-hours analytics", () => {
  it("keeps a useful historical schedule set separate from current assertions", () => {
    const rows = storedPostedHoursPlaces();

    expect(rows.length).toBeGreaterThan(500);
    expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
    expect(rows.every((row) => Object.keys(row.hours).length > 0)).toBe(true);
    expect(rows.every((row) => !("hours_verified" in row))).toBe(true);
    expect(rows.every((row) => !("open_status" in row))).toBe(true);
  });
});
