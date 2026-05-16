import { describe, it, expect } from "vitest";
import { googleStatusToOperational } from "@/lib/integrations/google-places";
import { isOperational } from "@/lib/loaders/places";
import type { Place } from "@/data/places";

/**
 * P0-2: a mocked Google Places businessStatus must map to our status,
 * and a place Google reports closed must be suppressed.
 */
describe("googleStatusToOperational", () => {
  it("maps every mocked Google businessStatus value", () => {
    expect(googleStatusToOperational("OPERATIONAL")).toBe("operational");
    expect(googleStatusToOperational("CLOSED_TEMPORARILY")).toBe("closed_temporarily");
    expect(googleStatusToOperational("CLOSED_PERMANENTLY")).toBe("closed_permanently");
    expect(googleStatusToOperational("UNKNOWN")).toBe("needs_verification");
  });

  it("suppresses a place Google reports closed, keeps operational and unknown", () => {
    const base = { name: "Test Cafe", slug: "test-cafe" } as unknown as Place;
    const withStatus = (gs: Parameters<typeof googleStatusToOperational>[0]): Place => ({
      ...base,
      is_operational: googleStatusToOperational(gs),
    });
    expect(isOperational(withStatus("CLOSED_PERMANENTLY"))).toBe(false);
    expect(isOperational(withStatus("CLOSED_TEMPORARILY"))).toBe(false);
    expect(isOperational(withStatus("OPERATIONAL"))).toBe(true);
    expect(isOperational(withStatus("UNKNOWN"))).toBe(true);
  });
});
