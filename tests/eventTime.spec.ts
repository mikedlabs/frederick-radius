import { describe, it, expect } from "vitest";
import { formatEventTime, formatEventDate } from "@/lib/format/eventTime";
import { easternWallToUtcISO } from "@/lib/tz";

describe("formatEventTime", () => {
  it("renders the documented acceptance case (P0-1)", () => {
    // 2026-05-17T00:00Z is May 16 2026 8:00 PM EDT.
    expect(formatEventTime("2026-05-17T00:00:00Z")).toBe("8:00 PM");
  });

  it("stays correct across the March 2026 DST boundary", () => {
    // DST starts Sun Mar 8 2026. A 7:00 PM New York event must read
    // 7:00 PM both before (EST) and after (EDT) the switch.
    const beforeDst = easternWallToUtcISO(2026, 3, 7, 19, 0);
    const afterDst = easternWallToUtcISO(2026, 3, 9, 19, 0);
    expect(formatEventTime(beforeDst)).toBe("7:00 PM");
    expect(formatEventTime(afterDst)).toBe("7:00 PM");
    // The same wall time is a different UTC instant on each side.
    expect(beforeDst).not.toBe(afterDst);
  });

  it("handles morning times and date formatting", () => {
    // 2026-05-16T13:00Z = 9:00 AM EDT (the Canal Community Day case).
    expect(formatEventTime("2026-05-16T13:00:00Z")).toBe("9:00 AM");
    expect(formatEventDate("2026-05-17T00:00:00Z")).toBe("Sat, May 16");
  });
});
