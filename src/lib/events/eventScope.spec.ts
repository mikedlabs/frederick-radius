import { describe, expect, it } from "vitest";
import { classifyEventScope, eventHiddenFromToday } from "./eventScope";

describe("classifyEventScope", () => {
  it("marks Mount St. Mary's intramurals and student trips as campus", () => {
    expect(
      classifyEventScope({
        title: "4v4 Intramural Beach Volleyball",
        source: "mount-st-marys",
      }),
    ).toBe("campus");
    expect(
      classifyEventScope({
        title: "Intramural Pickleball",
        source: "mount-st-marys",
      }),
    ).toBe("campus");
    expect(
      classifyEventScope({
        title: "Bus Trip to Hersheypark",
        source: "mount-st-marys",
      }),
    ).toBe("campus");
    expect(
      classifyEventScope({
        title: "Philadelphia Law Fair (Trip to Drexel University)",
        source: "mount-st-marys",
      }),
    ).toBe("campus");
  });

  it("keeps public Mount St. Mary's games and lectures public", () => {
    expect(
      classifyEventScope({
        title: "Mount St. Mary's Men's Basketball vs. Navy",
        source: "mount-st-marys",
      }),
    ).toBe("public");
    expect(
      classifyEventScope({
        title: "Inquiry: How do I read the Bible?",
        source: "mount-st-marys",
      }),
    ).toBe("public");
  });

  it("marks school and admin notices", () => {
    expect(
      classifyEventScope({
        title: "Noon Dismissal for Students",
        source: "msd",
      }),
    ).toBe("notice");
    expect(
      classifyEventScope({ title: "WFS- No School", source: "elc" }),
    ).toBe("notice");
    expect(
      classifyEventScope({
        title: "Membership Photo's Last Name G-L",
        source: "elc",
      }),
    ).toBe("notice");
  });

  it("defaults ordinary public events to public", () => {
    expect(
      classifyEventScope({
        title: "The Hot Sardines",
        source: "venue-extract",
      }),
    ).toBe("public");
  });
});

describe("eventHiddenFromToday", () => {
  it("hides campus and notice from Today, and leaves public visible", () => {
    expect(eventHiddenFromToday("campus")).toBe(true);
    expect(eventHiddenFromToday("notice")).toBe(true);
    expect(eventHiddenFromToday("public")).toBe(false);
  });
});
