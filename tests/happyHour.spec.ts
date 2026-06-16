import { describe, it, expect } from "vitest";
import { parseHappyHour, happyHourStatus } from "@/lib/happyHour";

// Eastern reference instants (June 2026 = EDT, UTC-4). June 15 2026 = Monday.
const wed430 = new Date("2026-06-17T16:30:00-04:00"); // Wed 4:30 PM
const wed1pm = new Date("2026-06-17T13:00:00-04:00"); // Wed 1:00 PM
const wed10pm = new Date("2026-06-17T22:00:00-04:00"); // Wed 10:00 PM
const thu5pm = new Date("2026-06-18T17:00:00-04:00"); // Thu 5:00 PM

describe("parseHappyHour", () => {
  it("parses a day-range + pm window", () => {
    expect(parseHappyHour("Tuesday - Friday 3:30pm-7pm")).toEqual([
      { days: [2, 3, 4, 5], start: 930, end: 1140 },
    ]);
  });
  it("parses daily + infers PM", () => {
    expect(parseHappyHour("Daily 4-7 PM")).toEqual([{ days: [0, 1, 2, 3, 4, 5, 6], start: 960, end: 1140 }]);
  });
  it("parses multi-window (all-day + range)", () => {
    expect(parseHappyHour("All day Monday; 3-6pm Tuesday-Friday")).toEqual([
      { days: [1], start: 0, end: 1440 },
      { days: [2, 3, 4, 5], start: 900, end: 1080 },
    ]);
  });
  it("returns nothing for an unparseable schedule", () => {
    expect(parseHappyHour("Ask the bartender")).toEqual([]);
  });
});

describe("happyHourStatus — what's on now", () => {
  it("flags an active window as 'now'", () => {
    expect(happyHourStatus("Mon-Fri 3-6 PM", wed430).state).toBe("now");
    expect(happyHourStatus("Daily 4-7 PM", wed430).state).toBe("now");
    expect(happyHourStatus("All day Monday; 3-6pm Tuesday-Friday", wed430).state).toBe("now");
  });
  it("handles a late-night 'close' window crossing the evening", () => {
    const s = "Mon-Fri 3:00-6:00 PM and every night 9:00 PM-close (late-night). Bar area only.";
    expect(happyHourStatus(s, wed430).state).toBe("now"); // the 3-6 window
    expect(happyHourStatus(s, wed10pm).state).toBe("now"); // the 9pm-close window
  });
  it("says 'today' with a start time when it's later the same day", () => {
    const st = happyHourStatus("Mon-Fri 3-6 PM", wed1pm);
    expect(st.state).toBe("today");
    if (st.state === "today") expect(st.startsAt).toBe("3 PM");
  });
  it("says 'other' on a non-matching day, 'now' on the right one", () => {
    expect(happyHourStatus("Thu - Fri: 4pm-6pm", wed430).state).toBe("other");
    expect(happyHourStatus("Thu - Fri: 4pm-6pm", thu5pm).state).toBe("now");
  });
  it("is 'unknown' when the schedule can't be parsed (never a false 'now')", () => {
    expect(happyHourStatus("by appointment", wed430).state).toBe("unknown");
  });
});
