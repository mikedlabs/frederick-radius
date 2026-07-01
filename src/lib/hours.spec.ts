import { describe, it, expect } from "vitest";
import { formatTime, formatWindows, isAllDayWindow, getOpenStatus, formatHoursLine } from "./hours";
import type { Hours } from "@/data/places";

describe("formatTime", () => {
  it("renders 24:00 as midnight (12am), not 12pm", () => {
    expect(formatTime("24:00")).toBe("12am");
  });
  it("renders 00:00 as 12am and 12:00 as 12pm", () => {
    expect(formatTime("00:00")).toBe("12am");
    expect(formatTime("12:00")).toBe("12pm");
  });
  it("renders ordinary times", () => {
    expect(formatTime("09:00")).toBe("9am");
    expect(formatTime("17:30")).toBe("5:30pm");
  });
});

describe("all-day windows", () => {
  it("detects 00:00-24:00 and 00:00-00:00 as all-day", () => {
    expect(isAllDayWindow({ open: "00:00", close: "24:00" })).toBe(true);
    expect(isAllDayWindow({ open: "00:00", close: "00:00" })).toBe(true);
  });
  it("does not treat a normal close-at-midnight window as all-day", () => {
    expect(isAllDayWindow({ open: "17:00", close: "00:00" })).toBe(false);
  });
  it("formats an all-day window as 'Open 24 hours', never '12am-12pm'", () => {
    expect(formatWindows([{ open: "00:00", close: "24:00" }])).toBe("Open 24 hours");
  });
  it("formats a normal window and a closed day", () => {
    expect(formatWindows([{ open: "09:00", close: "17:00" }])).toBe("9am–5pm");
    expect(formatWindows([])).toBe("Closed");
  });
  it("reports an open-24h place as 'Open 24 hours' in the status line", () => {
    const allDay: Hours = {
      mon: [{ open: "00:00", close: "24:00" }],
      tue: [{ open: "00:00", close: "24:00" }],
      wed: [{ open: "00:00", close: "24:00" }],
      thu: [{ open: "00:00", close: "24:00" }],
      fri: [{ open: "00:00", close: "24:00" }],
      sat: [{ open: "00:00", close: "24:00" }],
      sun: [{ open: "00:00", close: "24:00" }],
    };
    const status = getOpenStatus(allDay, { verified: true }, new Date());
    expect(status.state).toBe("open");
    expect(formatHoursLine(status)).toBe("Open 24 hours");
  });
});
