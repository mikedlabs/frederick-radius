// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FairArrivalStatus as FairArrivalStatusValue } from "@/lib/fair/arrival-status";

import FairArrivalStatus from "./FairArrivalStatus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const STATUS: FairArrivalStatusValue = {
  schemaVersion: 1,
  generatedAt: "2026-09-18T16:00:00.000Z",
  state: "no-current-update",
  coverage: "configured-sources-current",
  headline: "No official arrival update needs your attention right now.",
  summary: "Check again before you leave.",
  signals: [],
  hiddenSignalCount: 0,
  sources: [
    {
      id: "nws",
      label: "National Weather Service",
      url: "https://www.weather.gov/lwx/",
      state: "current",
      checkedAt: "2026-09-18T16:00:00.000Z",
      providerUpdatedAt: "2026-09-18T15:59:00.000Z",
    },
  ],
  transit: null,
  limitsLabel:
    "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
};

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("FairArrivalStatus refresh", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows an unavailable state when a refresh fails after a successful check", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => STATUS,
      } as Response)
      .mockRejectedValueOnce(new Error("Provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        createElement(FairArrivalStatus, {
          selectedDate: "2026-09-18",
          transitSelected: false,
        }),
      );
    });
    await settle();

    expect(container.textContent).toContain(
      "No official update needs attention.",
    );
    const detailsToggle = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (button) =>
        button.getAttribute("aria-label") ===
        "Show official arrival check details",
    );
    if (!detailsToggle) throw new Error("Expected the arrival details control.");
    const compactStatus = container.querySelector<HTMLElement>(
      '[data-fair-arrival-status="compact"]',
    );
    if (!compactStatus) throw new Error("Expected the compact arrival status.");
    const scrollIntoView = vi.fn();
    Object.defineProperty(compactStatus, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
    );
    expect(detailsToggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector<HTMLElement>("[data-fair-arrival-details]")
        ?.hidden,
    ).toBe(true);

    await act(async () => detailsToggle.click());
    await settle();
    expect(detailsToggle.getAttribute("aria-expanded")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    expect(
      container.querySelector<HTMLElement>("[data-fair-arrival-details]")
        ?.hidden,
    ).toBe(false);

    const refresh = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Check again"));
    if (!refresh) throw new Error("Expected the arrival refresh control.");

    await act(async () => refresh.click());
    await settle();

    expect(container.textContent).toContain(
      "Live arrival information could not be checked.",
    );
    expect(container.textContent).not.toContain(STATUS.headline);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
