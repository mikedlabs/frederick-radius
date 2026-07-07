import { describe, it, expect } from "vitest";
import { ticketStubDate, stubEyebrow } from "./ticketStub";

// 6:00 PM Eastern on Tue, Jul 7 2026 (EDT = UTC-4 → 22:00Z).
const JUL7_6PM = "2026-07-07T22:00:00Z";

describe("ticketStubDate", () => {
  it("splits the start into county-local stub parts", () => {
    // Evaluate the day before so the event is >24h out (not "soon").
    const s = ticketStubDate(JUL7_6PM, new Date("2026-07-06T12:00:00Z"));
    expect(s.month).toBe("JUL");
    expect(s.day).toBe("07");
    expect(s.weekday).toBe("Tue");
    expect(s.time).toBe("6:00 PM");
    expect(s.soon).toBe(false);
  });

  it("marks an event within the day as soon", () => {
    const s = ticketStubDate(JUL7_6PM, new Date("2026-07-07T14:00:00Z"));
    expect(s.soon).toBe(true);
  });

  it("still counts an event a couple hours past as soon", () => {
    const s = ticketStubDate(JUL7_6PM, new Date("2026-07-07T23:30:00Z"));
    expect(s.soon).toBe(true);
  });

  it("zero-pads single-digit days for a stable stub width", () => {
    const s = ticketStubDate("2026-07-07T22:00:00Z", new Date("2026-01-01T00:00:00Z"));
    expect(s.day).toBe("07");
  });
});

describe("stubEyebrow", () => {
  it("reads Today when soon", () => {
    const s = ticketStubDate(JUL7_6PM, new Date("2026-07-07T14:00:00Z"));
    expect(stubEyebrow(s)).toBe("Today · 6:00 PM");
  });

  it("restates the full date when not soon", () => {
    const s = ticketStubDate(JUL7_6PM, new Date("2026-07-06T12:00:00Z"));
    expect(stubEyebrow(s)).toBe("Tue · Jul 7 · 6:00 PM");
  });
});
