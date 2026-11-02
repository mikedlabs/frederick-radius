// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonthGrid from "./MonthGrid";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  it("renders native day destinations and a selected-day panel before JavaScript", () => {
    const html = renderToStaticMarkup(<MonthGrid month="2030-02" initialDay="2030-02-01" byDay={{}} total={0} degraded />);
    const host = document.createElement("div");
    host.innerHTML = html;
    const day = host.querySelector('[aria-label="0 events on 2030-02-01"]');
    expect(day?.tagName).toBe("A");
    expect(day?.getAttribute("href")).toBe("/events/calendar?m=2030-02&d=2030-02-01");
    expect(day?.getAttribute("aria-current")).toBe("date");
    expect(host.textContent).toContain("No listings are available for this day.");
    expect(host.querySelector('a[aria-label="Next month"]')?.className).toContain("h-11 w-11");
    expect(host.querySelector('a[aria-label="Previous month"]')?.className).toContain("h-11 w-11");
  });

  it("follows changed server selection props instead of retaining a previous client day", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (day: string | null) => act(async () => root.render(<MonthGrid month="2030-02" initialDay={day} byDay={{}} total={0} degraded />));
    try {
      await render("2030-02-01");
      expect(host.querySelector('[aria-current="date"]')?.getAttribute("href")).toBe("/events/calendar?m=2030-02&d=2030-02-01");
      await render("2030-02-02");
      expect(host.querySelector('[aria-current="date"]')?.getAttribute("href")).toBe("/events/calendar?m=2030-02&d=2030-02-02");
      // Back to the unselected future-month URL must remove the old panel.
      await render(null);
      expect(host.querySelector('[aria-current="date"]')).toBeNull();
      expect(host.textContent).not.toContain("No listings are available for this day.");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
