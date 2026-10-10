// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: {
    children?: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => {
    void prefetch;
    return createElement("a", { href, ...props }, children);
  },
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

import CompassHub from "./CompassHub";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE_DECK = {
  readAt: "2026-10-10T16:00:00.000Z",
  keys: [
    {
      id: "events",
      status: "ok",
      source: "Unified events",
      checkedAt: "2026-10-10T16:00:00.000Z",
      validUntil: "2026-10-10T16:10:00.000Z",
      faces: [{ value: "4", label: "on today" }],
    },
    {
      id: "buses",
      status: "ok",
      source: "TransIT",
      checkedAt: "2026-10-10T16:00:00.000Z",
      validUntil: "2026-10-10T16:10:00.000Z",
      faces: [{ value: "10", label: "buses moving" }],
    },
    {
      id: "weather",
      status: "ok",
      source: "NWS",
      checkedAt: "2026-10-10T16:00:00.000Z",
      validUntil: "2026-10-10T16:10:00.000Z",
      faces: [{ value: "1", label: "active alert" }],
    },
  ],
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Compass direction live-fact slots", () => {
  it("keeps the Choose a direction section the same height when counts arrive", async () => {
    let resolveDeck!: (response: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveDeck = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(pending),
    );

    await act(async () => {
      root.render(createElement(CompassHub));
    });

    const section = host.querySelector(
      'section[aria-labelledby="compass-browse-heading"]',
    );
    expect(section).toBeTruthy();
    expect(section?.getAttribute("aria-busy")).toBe("true");
    const pendingSlots = [
      ...host.querySelectorAll("[data-compass-live-slot]"),
    ];
    expect(pendingSlots.map((slot) => slot.getAttribute("data-compass-live-slot"))).toEqual([
      "pending",
      "pending",
      "pending",
    ]);

    await act(async () => {
      resolveDeck({
        ok: true,
        json: async () => LIVE_DECK,
      });
      await pending;
    });

    expect(section?.getAttribute("aria-busy")).toBeNull();
    const settledSlots = [
      ...host.querySelectorAll("[data-compass-live-slot]"),
    ];
    expect(settledSlots).toHaveLength(pendingSlots.length);
    expect(
      settledSlots.every((slot) => slot.getAttribute("data-compass-live-slot") === "ready"),
    ).toBe(true);
    expect(host.textContent).toContain("4 on today");
    expect(host.textContent).toContain("10 buses moving");
  });
});
