// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { PLACE_LOOKUP_TIMEOUT_MS } from "@/lib/place-sheet-lookup";

const harness = vi.hoisted(() => ({
  pathname: "/today/tonight",
  push: vi.fn(),
  recent: vi.fn(),
  leave: vi.fn((_id: string, next: () => void) => next()),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => harness.pathname,
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/hooks/useRecentPlaces", () => ({ usePushRecentPlace: () => harness.recent }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedGeoPosition: () => null }));
vi.mock("@/lib/geo", () => ({ isInFrederickCountyArea: () => true }));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({ navigateAfterHistoryLayer: harness.leave }));
vi.mock("@/components/ui/LazySheetFallback", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">Loading place details<button onClick={onClose}>Cancel lookup</button></div>
  ),
}));
vi.mock("./PlaceSheet", () => ({
  default: ({ place, mapReturnTo }: { place: PlaceCardData; mapReturnTo: string }) => (
    <div role="dialog" data-return-to={mapReturnTo}>{place.name}</div>
  ),
}));

import { PlaceSheetProvider, usePlaceSheet } from "./PlaceSheetProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = "/today/tonight?intent=pizza&in=brunswick";
function Actions() {
  const { openSheetBySlug, closeSheet } = usePlaceSheet();
  return <>
    <button onClick={() => openSheetBySlug("first-place")}>First</button>
    <button onClick={() => openSheetBySlug("second-place")}>Second</button>
    <button onClick={closeSheet}>Close</button>
  </>;
}

describe("on-demand place sheet recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted: boolean;

  beforeEach(async () => {
    vi.useFakeTimers();
    harness.pathname = "/today/tonight";
    harness.push.mockClear();
    harness.recent.mockClear();
    harness.leave.mockClear();
    window.history.replaceState({}, "", origin);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    unmounted = false;
    await render();
  });

  afterEach(async () => {
    if (!unmounted) await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render() {
    await act(async () => root.render(<PlaceSheetProvider><Actions /></PlaceSheetProvider>));
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === text)!;
    await act(async () => button.click());
  }

  it("leaves a hung lookup through the canonical page with the exact Tonight return path", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    expect(container.textContent).toContain("Loading place details");
    await act(async () => { await vi.advanceTimersByTimeAsync(PLACE_LOOKUP_TIMEOUT_MS); });
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Loading place details");
    expect(harness.leave).toHaveBeenCalledTimes(1);
    const destination = new URL(harness.push.mock.calls[0][0], "https://frederickradius.app");
    expect(destination.pathname).toBe("/places/first-place");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a closed sheet and ignores a late body without navigating or reopening", async () => {
    let signal: AbortSignal | undefined;
    let finishBody!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
    }));
    await click("First");
    await click("Cancel lookup");
    expect(signal?.aborted).toBe(true);
    await act(async () => finishBody({ places: [{ slug: "first-place", name: "Late place" }] }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the previous lookup when another place is opened", async () => {
    const signals: AbortSignal[] = [];
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signals.push(init.signal);
      return new Promise<Response>((resolve) => finish.push(resolve));
    }));
    await click("First");
    await click("Second");
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await act(async () => finish[0](Response.json({ places: [{ slug: "first-place", name: "Old place" }] })));
    expect(container.textContent).toContain("Loading place details");
    expect(container.textContent).not.toContain("Old place");
    await act(async () => finish[1](Response.json({ places: [{ slug: "second-place", name: "Second place" }] })));
    expect(harness.recent).toHaveBeenCalledExactlyOnceWith("second-place");
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts when route navigation dismisses the lookup", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    harness.pathname = "/today";
    await render();
    expect(signal?.aborted).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts on provider unmount without redirecting after cancellation", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    await act(async () => root.unmount());
    unmounted = true;
    expect(signal?.aborted).toBe(true);
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
