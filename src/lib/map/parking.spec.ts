import { describe, expect, it } from "vitest";
import {
  parkingHasLive,
  parkingSpacesLabel,
  parkingTone,
  type ParkingPin,
} from "./parking";

/** A dormant garage: no live data at all (the default, feed unwired). */
const dormant: Pick<
  ParkingPin,
  "available" | "percentFull" | "isClosed" | "isFull" | "isFilling"
> = {
  available: null,
  percentFull: null,
  isClosed: false,
  isFull: false,
  isFilling: false,
};

describe("parkingTone — availability → marker tint", () => {
  it("plenty of spaces reads positive (green)", () => {
    expect(parkingTone({ ...dormant, available: 240, percentFull: 20 })).toBe("positive");
  });

  it("filling up reads warning (amber)", () => {
    expect(parkingTone({ ...dormant, available: 30, percentFull: 80, isFilling: true })).toBe("warning");
  });

  it("full reads danger (red)", () => {
    expect(parkingTone({ ...dormant, available: 0, percentFull: 98, isFull: true })).toBe("danger");
  });

  it("closed reads danger without pretending the garage is full", () => {
    expect(parkingTone({ ...dormant, isClosed: true })).toBe("danger");
  });

  it("full wins over filling when both are set", () => {
    expect(parkingTone({ ...dormant, isFull: true, isFilling: true })).toBe("danger");
  });

  it("full-by-status with no number is still danger", () => {
    expect(parkingTone({ ...dormant, isFull: true })).toBe("danger");
  });

  it("unknown / dormant reads neutral, never a fake green", () => {
    expect(parkingTone(dormant)).toBe("neutral");
  });

  it("a bare percentFull with no count still counts as live (positive)", () => {
    expect(parkingTone({ ...dormant, percentFull: 40 })).toBe("positive");
  });
});

describe("parkingHasLive", () => {
  it("is false when every live field is empty", () => {
    expect(parkingHasLive(dormant)).toBe(false);
  });
  it("is true when any live signal is present", () => {
    expect(parkingHasLive({ ...dormant, available: 0 })).toBe(true);
    expect(parkingHasLive({ ...dormant, percentFull: 0 })).toBe(true);
    expect(parkingHasLive({ ...dormant, isClosed: true })).toBe(true);
    expect(parkingHasLive({ ...dormant, isFilling: true })).toBe(true);
  });
});

describe("parkingSpacesLabel — the honest no-number rule", () => {
  it("shows a real count when the feed has one", () => {
    expect(parkingSpacesLabel({ available: 42, isClosed: false, isFull: false })).toBe("42 spaces open");
  });

  it("uses the singular for exactly one space", () => {
    expect(parkingSpacesLabel({ available: 1, isClosed: false, isFull: false })).toBe("1 space open");
  });

  it("says Closed before considering counts or fullness", () => {
    expect(parkingSpacesLabel({ available: 0, isClosed: true, isFull: true })).toBe("Closed");
  });

  it("says Full when the deck is full", () => {
    expect(parkingSpacesLabel({ available: 0, isClosed: false, isFull: true })).toBe("Full");
  });

  it("returns null (NO number) when availability is unknown", () => {
    expect(parkingSpacesLabel({ available: null, isClosed: false, isFull: false })).toBeNull();
  });

  it("Full wins over a null count", () => {
    expect(parkingSpacesLabel({ available: null, isClosed: false, isFull: true })).toBe("Full");
  });
});
