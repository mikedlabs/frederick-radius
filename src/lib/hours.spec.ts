import { describe, it, expect } from "vitest";
import { formatTime, formatWindows, isAllDayWindow, getOpenStatus, formatHoursLine, isClosedNow } from "./hours";
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
  it("drops the day token when the place opens later TODAY", () => {
    // Tuesday 8:00 AM ET; doors open at 11. "Closed · Opens Tue 11am" read
    // like a next-week wait.
    const now = new Date("2026-07-07T12:00:00.000Z"); // Tue 8:00 AM EDT
    const hours: Hours = { tue: [{ open: "11:00", close: "17:00" }] };
    const status = getOpenStatus(hours, { verified: true }, now);
    expect(formatHoursLine(status)).toBe("Closed · Opens 11am");
  });

  it("keeps the day token when the next open day is not today", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // Tue 8:00 AM EDT
    const hours: Hours = { wed: [{ open: "09:00", close: "17:00" }] };
    const status = getOpenStatus(hours, { verified: true }, now);
    expect(formatHoursLine(status)).toBe("Closed · Opens Wed 9am");
  });

  it("isClosedNow only suppresses on VERIFIED-closed hours (DQ-019)", () => {
    // The White Rabbit case: verified hours 11am-10pm, checked at 3:41 AM ET.
    const earlyAm = new Date("2026-07-07T07:41:00.000Z"); // Tue 3:41 AM EDT
    const hours: Hours = { tue: [{ open: "11:00", close: "22:00" }] };
    // Verified + outside every window → provably closed → suppress the pour.
    expect(isClosedNow(hours, true, earlyAm)).toBe(true);
    // Same hours but UNVERIFIED → we can't prove closed → never suppress.
    expect(isClosedNow(hours, false, earlyAm)).toBe(false);
    // No hours at all → unknown → never suppress.
    expect(isClosedNow(undefined, true, earlyAm)).toBe(false);
    // Verified and inside the window → open → not closed.
    const midday = new Date("2026-07-07T16:00:00.000Z"); // Tue 12:00 PM EDT
    expect(isClosedNow(hours, true, midday)).toBe(false);
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
