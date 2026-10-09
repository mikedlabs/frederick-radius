// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PulseBoard, { type PulseHero, type PulseTile } from "./PulseBoard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/components/ui/Sheet", () => ({ default: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const key = "fr.pulse.snapshot.v2";
const now = Date.UTC(2026, 9, 8, 16);
const hero: PulseHero = {
  allClear: false, tone: "warning", leadKey: "traffic",
  line: "A traffic advisory is active.",
  sub: "Open the traffic details for the current advisory.", renderedAt: now,
};
const traffic: PulseTile = {
  key: "traffic", label: "Traffic", iconName: "TrafficCone",
  sourceLabel: "Test traffic source", countLabel: "1 active",
  accent: "var(--app-warning)", active: true, attention: true,
  kind: "status", body: null,
};
let container: HTMLDivElement;
let root: Root;
async function render(tiles: PulseTile[], strict = false) {
  const board = createElement(PulseBoard, { hero, chips: [], tiles });
  await act(async () => {
    root.render(strict ? createElement(StrictMode, null, board) : board);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  window.localStorage.clear();
  window.history.replaceState({}, "", "/pulse");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Pulse visit history", () => {
  it.each([false, true])("keeps the first visit free of recency framing after live tiles change (StrictMode: %s)", async (strict) => {
    await render([traffic], strict);
    expect(container.textContent).not.toContain("Since your last look");
    expect(JSON.parse(window.localStorage.getItem(key)!)).toMatchObject({ at: now, active: { traffic: "1 active" } });
    await render([{ ...traffic, countLabel: "2 active" }], strict);
    expect(container.textContent).not.toContain("Since your last look");
    expect(container.textContent).not.toMatch(/changed since|cleared since/);
  });

  it("frames a later visit using the snapshot this device actually recorded", async () => {
    await render([traffic]);
    expect(container.textContent).not.toContain("Since your last look");
    await act(async () => root.unmount());
    root = createRoot(container);
    vi.setSystemTime(now + 3_600_000);
    await render([{ ...traffic, countLabel: "2 active" }]);
    expect(container.textContent).toContain("Traffic has changed since 1h ago.");
  });

  it("compares a return visit only with the recorded prior visit", async () => {
    window.localStorage.setItem(key, JSON.stringify({ at: now - 13 * 86_400_000, active: { traffic: "1 active" } }));
    await render([{ ...traffic, countLabel: "2 active" }]);
    expect(container.textContent).toContain("Traffic has changed since 13d ago.");
    await render([{ ...traffic, countLabel: "3 active" }]);
    expect(container.textContent).toContain("Traffic has changed since 13d ago.");
    expect(container.textContent).not.toContain("since 1m ago");
  });

  it.each([
    "not json",
    JSON.stringify({ at: "2026-09-25", active: {} }),
    JSON.stringify({ at: -1, active: {} }),
    JSON.stringify({ at: now + 60_000, active: {} }),
    JSON.stringify({ at: now - 60_000, active: null }),
    JSON.stringify({ at: now - 60_000, active: { traffic: 1 } }),
  ])("does not turn an invalid stored record into visit history: %s", async (stored) => {
    window.localStorage.setItem(key, stored);
    await render([traffic]);
    expect(container.textContent).not.toContain("Since your last look");
    expect(container.textContent).not.toMatch(/changed since|cleared since/);
  });

  it("keeps blocked storage from creating visit history", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    try {
      await render([traffic]);
      await render([{ ...traffic, countLabel: "2 active" }]);
      expect(container.textContent).not.toContain("Since your last look");
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("clears the comparison when the current reading matches the prior visit", async () => {
    window.localStorage.setItem(key, JSON.stringify({ at: now - 3_600_000, active: { traffic: "1 active" } }));
    await render([{ ...traffic, countLabel: "2 active" }]);
    expect(container.textContent).toContain("Since your last look");
    await render([traffic]);
    expect(container.textContent).not.toContain("Since your last look");
  });
});
