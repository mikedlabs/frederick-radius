import { describe, expect, it } from "vitest";
import { todayDealAvailability } from "./dealAvailability";

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
});
