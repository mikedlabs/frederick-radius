import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonthGrid from "./MonthGrid";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T15:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("calendar coverage copy", () => {
  it("states no events are scheduled when the calendar read is healthy and empty", () => {
    const html = renderToStaticMarkup(<MonthGrid month="2026-11" byDay={{}} total={0} />);
    expect(html).toContain("No events are scheduled for this day.");
    expect(html).not.toContain("listings available");
  });
  it("describes unavailable listings when an empty calendar read is degraded", () => {
    const html = renderToStaticMarkup(<MonthGrid month="2026-11" byDay={{}} total={0} degraded />);
    expect(html).toContain("No listings are available for this day.");
    expect(html).toContain("listings available");
    expect(html).not.toContain("No events are scheduled");
  });
});
