import { describe, it, expect } from "vitest";
import { parseGoogleHours } from "@/lib/googleHours";
import { getOpenStatus } from "@/lib/hours";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type Weekday = (typeof WEEKDAYS)[number];

function fullWeek(
  overrides: Partial<Record<Weekday, string>> = {},
): string[] {
  return WEEKDAYS.map(
    (day) => `${day}: ${overrides[day] ?? "Closed"}`,
  );
}

/**
 * Guardrail for the hours parser — the link that lifts open-now coverage
 * from ~3.6% to ~80% by turning Google's `weekday_hours` strings into the
 * structured shape getOpenStatus reads. These run in CI (`npm test`) so a
 * regression in the real-world formats (split windows, omitted meridiem,
 * past-midnight, 24h, closed) fails the build instead of silently
 * reverting the catalog to "Hours not posted".
 */

describe("parseGoogleHours", () => {
  it("parses a simple single window", () => {
    expect(parseGoogleHours(fullWeek({
      Monday: "9:00 AM – 5:00 PM",
    }))).toEqual({
      mon: [{ open: "09:00", close: "17:00" }],
    });
  });

  it("accepts a plain hyphen as well as an en dash", () => {
    expect(parseGoogleHours(fullWeek({
      Tuesday: "9:00 AM - 5:00 PM",
    }))).toEqual({
      tue: [{ open: "09:00", close: "17:00" }],
    });
  });

  it("maps 'Open 24 hours' to a full day", () => {
    expect(parseGoogleHours(fullWeek({
      Saturday: "Open 24 hours",
    }))).toEqual({
      sat: [{ open: "00:00", close: "24:00" }],
    });
  });

  it("omits a closed day entirely", () => {
    expect(parseGoogleHours(fullWeek())).toBeUndefined();
  });

  it("inherits the close meridiem when the open omits it", () => {
    // "1:00 – 4:00 PM" means 1 PM, not 1 AM.
    expect(parseGoogleHours(fullWeek({
      Friday: "1:00 – 4:00 PM",
    }))).toEqual({
      fri: [{ open: "13:00", close: "16:00" }],
    });
  });

  it("handles noon and split windows", () => {
    expect(
      parseGoogleHours(fullWeek({
        Wednesday: "11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      })),
    ).toEqual({
      wed: [
        { open: "11:00", close: "15:00" },
        { open: "17:00", close: "21:00" },
      ],
    });
  });

  it("keeps a past-midnight close as-is (the engine wraps it)", () => {
    expect(parseGoogleHours(fullWeek({
      Thursday: "11:00 AM – 1:00 AM",
    }))).toEqual({
      thu: [{ open: "11:00", close: "01:00" }],
    });
  });

  it("returns undefined for empty / unreadable input rather than guessing", () => {
    expect(parseGoogleHours(undefined)).toBeUndefined();
    expect(parseGoogleHours([])).toBeUndefined();
    expect(parseGoogleHours(["nonsense with no colon"])).toBeUndefined();
    expect(parseGoogleHours(["Monday: see website"])).toBeUndefined();
  });

  it("rejects an entire schedule when one recognized day is unreadable", () => {
    expect(
      parseGoogleHours(fullWeek({
        Monday: "9:00 AM – 5:00 PM",
        Tuesday: "hours vary seasonally",
        Wednesday: "9:00 AM – 5:00 PM",
      })),
    ).toBeUndefined();
  });

  it("rejects a split day instead of keeping only the parseable window", () => {
    expect(
      parseGoogleHours(fullWeek({
        Thursday: "9:00 AM – 1:00 PM, evenings by appointment",
      })),
    ).toBeUndefined();
  });

  it("rejects duplicate weekday descriptions as ambiguous", () => {
    expect(
      parseGoogleHours([
        ...fullWeek({ Friday: "9:00 AM – 5:00 PM" }),
        "Friday: 10:00 AM – 4:00 PM",
      ]),
    ).toBeUndefined();
  });

  it("does not treat commentary containing '24 hours' as an all-day schedule", () => {
    expect(
      parseGoogleHours(fullWeek({
        Saturday: "Open 24 hours, holiday access varies",
      })),
    ).toBeUndefined();
  });

  it("rejects a window with extra range separators", () => {
    expect(
      parseGoogleHours(fullWeek({
        Saturday: "9:00 AM - 1:00 PM - 5:00 PM",
      })),
    ).toBeUndefined();
  });

  it("rejects zero as a 12-hour clock value", () => {
    expect(
      parseGoogleHours(fullWeek({
        Saturday: "0:30 AM - 5:00 PM",
      })),
    ).toBeUndefined();
  });

  it("rejects unknown day labels, missing separators, and incomplete weeks", () => {
    const abbreviated = fullWeek();
    abbreviated[0] = "Mon: 9:00 AM – 5:00 PM";
    const missingColon = fullWeek();
    missingColon[0] = "Monday 9:00 AM – 5:00 PM";

    expect(parseGoogleHours(abbreviated)).toBeUndefined();
    expect(parseGoogleHours(missingColon)).toBeUndefined();
    expect(parseGoogleHours(fullWeek().slice(0, 6))).toBeUndefined();
  });

  it("parses a full week", () => {
    const hours = parseGoogleHours([
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: 9:00 AM – 5:00 PM",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 5:00 PM",
      "Friday: 9:00 AM – 9:00 PM",
      "Saturday: 10:00 AM – 9:00 PM",
      "Sunday: Closed",
    ]);
    expect(Object.keys(hours ?? {})).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ]);
    expect(hours?.fri).toEqual([{ open: "09:00", close: "21:00" }]);
  });
});

describe("parseGoogleHours -> getOpenStatus integration", () => {
  it("resolves a real open-now from parsed Google hours", () => {
    const hours = parseGoogleHours([
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: 9:00 AM – 5:00 PM",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 5:00 PM",
      "Friday: 9:00 AM – 5:00 PM",
      "Saturday: Closed",
      "Sunday: Closed",
    ]);
    // 2026-06-01 14:00 UTC = Monday 10:00 in America/New_York (EDT).
    const monday10am = new Date("2026-06-01T14:00:00Z");
    const status = getOpenStatus(hours, { verified: true }, monday10am);
    expect(status.state).toBe("open");
    if (status.state === "open") expect(status.closesAt).toBe("17:00");
  });

  it("stays open after midnight for an overnight window, then closes once it ends", () => {
    // The Friday-night-into-Saturday case: open 5 PM Fri to 2 AM Sat.
    const hours = parseGoogleHours(fullWeek({
      Friday: "5:00 PM – 2:00 AM",
    }));
    expect(hours).toEqual({ fri: [{ open: "17:00", close: "02:00" }] });
    // 2026-06-06 04:30 UTC = Saturday 00:30 in America/New_York (EDT),
    // 90 minutes before the Friday-night window closes at 2 AM. Before the
    // overnight-spillover fix this read "closed" because getOpenStatus only
    // checked Saturday's (empty) hours, never Friday's past-midnight tail.
    const satHalfPastMidnight = new Date("2026-06-06T04:30:00Z");
    const open = getOpenStatus(hours, { verified: true }, satHalfPastMidnight);
    expect(open.state).toBe("open");
    if (open.state === "open") expect(open.closesAt).toBe("02:00");
    // 2026-06-06 07:00 UTC = Saturday 03:00 EDT, an hour after it closed.
    const afterClose = getOpenStatus(hours, { verified: true }, new Date("2026-06-06T07:00:00Z"));
    expect(afterClose.state).toBe("closed");
  });
});
