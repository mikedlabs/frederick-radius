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

  it("keeps an all-day special soft until venue hours are authoritative", () => {
    expect(todayDealAvailability("All day", "Tuesday", tue6pm)).toEqual({
      state: "today",
      label: "Today",
      when: "All day",
      rank: 2,
    });
  });

  it("uses soft copy when a time cannot be interpreted as a range", () => {
    expect(todayDealAvailability("6 PM", "Tuesday", tue6pm)).toEqual({
      state: "today",
      label: "Today",
      when: "6 PM",
      rank: 2,
    });
    // Missing time → empty `when`: the row's soft "Today" label already
    // carries the claim; renderers skip an empty string instead of
    // printing "Time not listed" down the whole stack.
    expect(todayDealAvailability(undefined, "Tuesday", tue6pm)).toEqual({
      state: "today",
      label: "Today",
      when: "",
      rank: 2,
    });
  });

  it("keeps only specials whose window is active now", () => {
    const deals = [
      { slug: "active", hours: "5–9 PM" },
      { slug: "later", hours: "8–10 PM" },
      { slug: "earlier", hours: "11 AM–2 PM" },
      { slug: "single-time", hours: "6 PM" },
      { slug: "all-day", hours: "All day" },
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
