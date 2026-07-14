import { describe, expect, it } from "vitest";
import { dealsAvailableNow, todayDealAvailability } from "./dealAvailability";

const tue6pm = new Date("2026-07-14T18:00:00-04:00");

describe("todayDealAvailability", () => {
  it("labels a currently active range", () => {
    expect(todayDealAvailability("5–9 PM", "Tuesday", tue6pm)).toEqual({
      state: "now",
      label: "Available now",
      when: "5–9 PM",
      rank: 0,
    });
  });

  it("distinguishes later and earlier ranges", () => {
    expect(todayDealAvailability("8–10 PM", "Tuesday", tue6pm).state).toBe("later");
    expect(todayDealAvailability("11 AM–2 PM", "Tuesday", tue6pm).state).toBe("earlier");
  });

  it("treats an all-day special as currently available", () => {
    expect(todayDealAvailability("All day", "Tuesday", tue6pm).state).toBe("now");
  });

  it("uses soft copy when a time cannot be interpreted as a range", () => {
    expect(todayDealAvailability("6 PM", "Tuesday", tue6pm)).toEqual({
      state: "today",
      label: "Today",
      when: "6 PM",
      rank: 2,
    });
    expect(todayDealAvailability(undefined, "Tuesday", tue6pm)).toEqual({
      state: "today",
      label: "Today",
      when: "Time not listed",
      rank: 2,
    });
  });

  it("keeps only specials whose window is active now", () => {
    const deals = [
      { slug: "active", hours: "5–9 PM" },
      { slug: "later", hours: "8–10 PM" },
      { slug: "earlier", hours: "11 AM–2 PM" },
      { slug: "single-time", hours: "6 PM" },
      { slug: "unknown" },
    ];

    expect(dealsAvailableNow(deals, "Tuesday", tue6pm)).toEqual([
      { slug: "active", hours: "5–9 PM" },
    ]);
  });

  it("returns no live specials late at night when every window has ended or is unknown", () => {
    const tue1130pm = new Date("2026-07-14T23:30:00-04:00");
    const deals = [
      { slug: "lunch", hours: "11 AM–2 PM" },
      { slug: "dinner", hours: "5–9 PM" },
      { slug: "single-time", hours: "6 PM" },
      { slug: "unknown" },
    ];

    expect(dealsAvailableNow(deals, "Tuesday", tue1130pm)).toEqual([]);
  });
});
