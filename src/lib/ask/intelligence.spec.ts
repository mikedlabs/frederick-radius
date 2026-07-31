import { describe, expect, it } from "vitest";
import { parkingStatusForAsk } from "./intelligence";

describe("parkingStatusForAsk", () => {
  it("describes an explicitly closed garage as closed", () => {
    expect(parkingStatusForAsk({
      isClosed: true,
      isFull: true,
      isFilling: true,
    })).toBe("closed");
  });

  it("keeps the remaining live states distinct", () => {
    expect(parkingStatusForAsk({
      isClosed: false,
      isFull: true,
      isFilling: false,
    })).toBe("full");
    expect(parkingStatusForAsk({
      isClosed: false,
      isFull: false,
      isFilling: true,
    })).toBe("filling");
    expect(parkingStatusForAsk({
      isClosed: false,
      isFull: false,
      isFilling: false,
    })).toBe("available");
  });
});
