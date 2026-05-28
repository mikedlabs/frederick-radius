import { describe, it, expect } from "vitest";
import { parseGoogleWeekdayHours } from "@/lib/hours-parse";

describe("parseGoogleWeekdayHours", () => {
  it("parses the Hoffman Brothers shape — shared AM/PM and Closed", () => {
    // Real-world example: thin space + narrow no-break space + en dash.
    const lines = [
      "Monday: Closed",
      "Tuesday: 3:00 – 8:00 PM",
      "Wednesday: 3:00 – 8:00 PM",
      "Thursday: 3:00 – 8:00 PM",
      "Friday: 3:00 – 9:00 PM",
      "Saturday: 3:00 – 9:00 PM",
      "Sunday: 3:00 – 8:00 PM",
    ];
    const hours = parseGoogleWeekdayHours(lines);
    expect(hours).toEqual({
      mon: [],
      tue: [{ open: "15:00", close: "20:00" }],
      wed: [{ open: "15:00", close: "20:00" }],
      thu: [{ open: "15:00", close: "20:00" }],
      fri: [{ open: "15:00", close: "21:00" }],
      sat: [{ open: "15:00", close: "21:00" }],
      sun: [{ open: "15:00", close: "20:00" }],
    });
  });

  it("parses lines with full AM and PM on both sides", () => {
    const hours = parseGoogleWeekdayHours(["Sunday: 8:00 AM – 8:00 PM"]);
    expect(hours).toEqual({ sun: [{ open: "08:00", close: "20:00" }] });
  });

  it("parses comma-separated split windows", () => {
    const hours = parseGoogleWeekdayHours([
      "Friday: 11:00 AM – 2:00 PM, 5:00 PM – 9:00 PM",
    ]);
    expect(hours).toEqual({
      fri: [
        { open: "11:00", close: "14:00" },
        { open: "17:00", close: "21:00" },
      ],
    });
  });

  it("returns undefined when input is empty or all malformed", () => {
    expect(parseGoogleWeekdayHours(undefined)).toBeUndefined();
    expect(parseGoogleWeekdayHours([])).toBeUndefined();
    expect(parseGoogleWeekdayHours(["garbage line"])).toBeUndefined();
  });

  it("skips malformed lines without losing parsable ones", () => {
    const hours = parseGoogleWeekdayHours([
      "garbage",
      "Tuesday: 3:00 – 8:00 PM",
    ]);
    expect(hours).toEqual({ tue: [{ open: "15:00", close: "20:00" }] });
  });
});
