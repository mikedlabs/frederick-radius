import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMonthEvents: vi.fn() }));
vi.mock("@/lib/loaders/calendar", () => ({ getMonthEvents: mocks.getMonthEvents }));
import CalendarPage from "./page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
  mocks.getMonthEvents.mockReset().mockResolvedValue({ byDay: {}, total: 0,
    sourceHealth: { degraded: true, unavailable: ["The event schedule is temporarily unavailable."] } });
});
afterEach(() => vi.useRealTimers());

describe("server-rendered calendar selection", () => {
  it("renders the requested valid day immediately from its native URL", async () => {
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ m: "2030-02", d: "2030-02-01" }) }));
    expect(html).toContain("February 2030");
    expect(html).toContain('href="/events/calendar?m=2030-02&amp;d=2030-02-01"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("Friday, February 1");
    expect(html).toContain("No listings are available for this day.");
    expect(html).not.toContain("No events are scheduled");
    expect(mocks.getMonthEvents).toHaveBeenCalledExactlyOnceWith(new Date("2030-02-01T12:00:00Z"));
  });

  it.each([
    "2030-02-29", "2030-02-30", "2030-02-00", "2030-03-01", "2030-2-01",
    "2030-02-01T12:00:00Z", ["2030-02-01", "2030-02-02"],
  ])("does not select the invalid or mismatched day %s", async d => {
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ m: "2030-02", d }) }));
    expect(html).not.toContain('aria-current="date"');
    expect(html).not.toContain("No listings are available for this day.");
  });

  it("accepts a genuine leap day in the displayed month", async () => {
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ m: "2028-02", d: "2028-02-29" }) }));
    expect(html).toContain("Tuesday, February 29");
    expect(html).toContain('aria-current="date"');
  });

  it("defaults to today only within the displayed Eastern month", async () => {
    const current = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({}) }));
    expect(current).toContain("Monday, November 2");
    expect(current).toContain('aria-current="date"');
    const future = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ m: "2030-02" }) }));
    expect(future).not.toContain('aria-current="date"');
    expect(future).not.toContain("No listings are available for this day.");
  });

  it("uses the Eastern calendar day at a UTC month boundary", async () => {
    vi.setSystemTime(new Date("2026-12-01T04:30:00Z"));
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("November 2026");
    expect(html).toContain("Monday, November 30");
  });
});
