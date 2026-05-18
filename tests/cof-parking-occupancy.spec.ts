import { describe, it, expect } from "vitest";
import { transform } from "../transforms/cof_parking_occupancy";
import type { CofParkingOccupancyRaw } from "../pipeline/schemas_ts/cof_parking_occupancy";

// SCAFFOLD fixture. The real endpoint is unconfirmed (pending_review);
// these values exercise the defensive logic, they are not a recorded
// real reading.
const raw = {
  as_of: "2026-05-18T23:10:00Z",
  decks: [
    { name: "Court Street", available: 40, capacity: 400 },
    { name: "Carroll Creek", occupied: 250, capacity: 300 },
    { name: "West Patrick Street", status: "OPEN" },
  ],
} as unknown as CofParkingOccupancyRaw;

describe("transform(cof_parking_occupancy) — scaffold", () => {
  it("derives occupied from available and capacity", () => {
    const d = transform(raw).data as {
      decks: { slug: string; occupied: number | null; percent_full: number | null }[];
    };
    const court = d.decks.find((x) => x.slug === "court-street")!;
    expect(court.occupied).toBe(360);
    expect(court.percent_full).toBe(90);
  });

  it("derives available from occupied and capacity", () => {
    const d = transform(raw).data as { decks: { slug: string; available: number | null }[] };
    expect(d.decks.find((x) => x.slug === "carroll-creek")!.available).toBe(50);
  });

  it("never fabricates counts when capacity is unknown", () => {
    const d = transform(raw).data as {
      decks: { slug: string; available: number | null; occupied: number | null; percent_full: number | null }[];
    };
    const wp = d.decks.find((x) => x.slug === "west-patrick")!;
    expect(wp.available).toBeNull();
    expect(wp.occupied).toBeNull();
    expect(wp.percent_full).toBeNull();
  });

  it("normalizes the as_of timestamp to ISO 8601", () => {
    const d = transform(raw).data as { as_of: string };
    expect(d.as_of).toBe("2026-05-18T23:10:00.000Z");
  });
});
