import { describe, expect, it } from "vitest";
import { parkingStatusForAsk } from "./intelligence";

describe("parkingStatusForAsk", () => {
  it("describes an explicitly closed garage as closed", () => {
    expect(parkingStatusForAsk({
      availabilityState: "closed",
    })).toBe("closed");
  });

  it("keeps the remaining live states distinct", () => {
    expect(parkingStatusForAsk({
      availabilityState: "full",
    })).toBe("full");
    expect(parkingStatusForAsk({
      availabilityState: "filling",
    })).toBe("filling");
    expect(parkingStatusForAsk({
      availabilityState: "available",
    })).toBe("available");
  });

  it("does not describe status-only OPEN or incomplete counts as available", () => {
    expect(parkingStatusForAsk({ availabilityState: "open" })).toBe("open");
    expect(parkingStatusForAsk({ availabilityState: "unknown" })).toBe("unknown");
  });
});
