// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import LiveOpenStatus from "./LiveOpenStatus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// A dinner house with the Il Porto shape: closed until 11:30am, open to 10pm.
const day = [{ open: "11:30", close: "22:00" }];
const hours: Hours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };

// What a build at 9:50pm Eastern baked into the page.
const bakedAtNight: OpenStatus = { state: "closing-soon", closesAt: "22:00" };
// Wednesday, October 14, 2026 at 9:00am Eastern, the next morning's first visit.
const nextMorning = new Date("2026-10-14T13:00:00Z");

describe("LiveOpenStatus", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(nextMorning);
    container = document.createElement("div");
    document.body.append(container);
    root = null;
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it.each<[string, OpenStatus]>([
    ["closing-soon", bakedAtNight],
    ["open", { state: "open", closesAt: "22:00", closingSoon: false }],
    ["closed", { state: "closed", opensAt: "11:30", opensDay: "wed", opensToday: true }],
  ])("never puts a baked %s state in the server HTML when the hours are present", (_state, initial) => {
    const html = renderToString(<LiveOpenStatus hours={hours} verified initial={initial} />);
    expect(html).not.toContain("Closing soon");
    expect(html).not.toContain("Open until");
    expect(html).not.toContain("Closed");
    expect(html).not.toContain("Opens");
    // The line is held open by an empty placeholder that assistive
    // technology skips, so nothing below it moves when the state arrives.
    container.innerHTML = html;
    const pending = container.querySelector("[data-place-status-pending]")!;
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    expect(pending.textContent?.trim()).toBe("");
    expect(pending.className).toContain("text-xs");
    // It also holds roughly a typical state's width, so a fact beside it in
    // the same row (a price band) moves little when the state arrives.
    expect(pending.className).toContain("min-w-[8.5rem]");
  });

  it("replaces the placeholder with the state for the visitor's own clock after hydration", async () => {
    container.innerHTML = renderToString(<LiveOpenStatus hours={hours} verified initial={bakedAtNight} />);
    await act(async () => {
      root = hydrateRoot(container, <LiveOpenStatus hours={hours} verified initial={bakedAtNight} />);
    });
    expect(container.textContent).toBe("Closed · Opens 11:30am");
    expect(container.querySelector("[data-place-status-pending]")).toBeNull();
  });

  it("keeps a confirmed state as the whole answer, with no date beside it", async () => {
    vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
    await act(async () => {
      root = createRoot(container);
      root.render(<LiveOpenStatus hours={hours} verified initial={bakedAtNight} hoursCheckedAt="2026-10-12T09:13:00.000Z" />);
    });
    expect(container.textContent).toBe("Open until 10pm");
    expect(container.querySelector("[data-place-status-line]")).toBeNull();
  });

  it("keeps the state current on the minute tick", async () => {
    vi.setSystemTime(new Date("2026-10-14T15:29:30Z"));
    await act(async () => {
      root = createRoot(container);
      root.render(<LiveOpenStatus hours={hours} verified initial={bakedAtNight} />);
    });
    expect(container.textContent).toBe("Closed · Opens 11:30am");
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(container.textContent).toBe("Open until 10pm");
  });

  it("still paints the states that do not depend on the time of day from the server value", () => {
    expect(renderToString(<LiveOpenStatus hours={hours} verified={false} initial={{ state: "unverified" }} />))
      .toContain("Hours not confirmed");
    expect(renderToString(<LiveOpenStatus hours={hours} verified initial={{ state: "unknown" }} />))
      .toContain("Hours not recently confirmed");
  });

  it("keeps the server state for a place with no structured hours, because nothing fresher can be computed", () => {
    const html = renderToString(<LiveOpenStatus verified initial={{ state: "open", closesAt: "21:00", closingSoon: false }} />);
    expect(html).toContain("Open until 9pm");
    expect(html).not.toContain("data-place-status-pending");
  });
});
