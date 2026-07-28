import { describe, expect, it } from "vitest";
import { pulseStatusWord } from "./PulseBoard";

describe("Pulse status language", () => {
  it("keeps missing data visually distinct from an active alert", () => {
    expect(pulseStatusWord({
      allClear: false,
      degraded: true,
      hasLead: false,
      tone: "warning",
    })).toBe("Partial data");

    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: true,
      tone: "danger",
    })).toBe("Urgent");
  });

  it("keeps verified quiet conditions separate from advisories", () => {
    expect(pulseStatusWord({
      allClear: true,
      degraded: false,
      hasLead: false,
      tone: "positive",
    })).toBe("Checked");

    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: true,
      tone: "warning",
    })).toBe("Advisory");
  });
});
