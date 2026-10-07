// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
const EVENT_LOOKUP_TIMEOUT_MS = 15_000;

const harness = vi.hoisted(() => ({
  pathname: "/events",
  push: vi.fn(),
  leave: vi.fn((_id: string, next: () => void) => next()),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => harness.pathname,
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({ navigateAfterHistoryLayer: harness.leave }));
vi.mock("@/components/ui/LazySheetFallback", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">Loading event details<button onClick={onClose}>Cancel lookup</button></div>
  ),
}));
vi.mock("./EventSheet", () => ({
  default: ({ event, onClose, onOpenFullPage }: { event: EventWithMeta | null; onClose: () => void; onOpenFullPage?: () => void }) => (
    <div role="dialog">{event?.title ?? "Loading event details"}<button onClick={onClose}>Cancel lookup</button><button onClick={onOpenFullPage}>Open full page</button></div>
  ),
}));

import { EventSheetProvider, useEventSheet } from "./EventSheetProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = "/events?in=brunswick&q=music";
function Actions() {
  const { openEventSheetBySlug, closeEventSheet } = useEventSheet();
  return <>
    <button onClick={() => openEventSheetBySlug("first-place")}>First</button>
    <button onClick={() => openEventSheetBySlug("second-place")}>Second</button>
    <button onClick={closeEventSheet}>Close</button>
  </>;
}

describe("on-demand event sheet recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted: boolean;

  beforeEach(async () => {
    vi.useFakeTimers();
    harness.pathname = "/events";
    harness.push.mockClear();
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
    await act(async () => root.render(<EventSheetProvider><Actions /></EventSheetProvider>));
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === text)!;
    await act(async () => button.click());
  }

  it("leaves a hung lookup through the canonical page with the exact Tonight return path", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init?.signal;
      return new Promise(() => {});
    }));
    await click("First");
    expect(container.textContent).toContain("Loading event details");
    await act(async () => { await vi.advanceTimersByTimeAsync(EVENT_LOOKUP_TIMEOUT_MS); });
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Loading event details");
    expect(harness.leave).toHaveBeenCalledTimes(1);
    const destination = new URL(harness.push.mock.calls[0][0], "https://frederickradius.app");
    expect(destination.pathname).toBe("/events/first-place");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a closed sheet and ignores a late body without navigating or reopening", async () => {
    let signal: AbortSignal | undefined;
    let finishBody!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init?.signal;
      return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
    }));
    await click("First");
    await click("Cancel lookup");
    expect(signal?.aborted).toBe(true);
    await act(async () => finishBody({ event: { slug: "first-place", title: "Late event" } }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the previous lookup when another place is opened", async () => {
    const signals: AbortSignal[] = [];
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signals.push(init?.signal);
      return new Promise<Response>((resolve) => finish.push(resolve));
    }));
    await click("First");
    await click("Second");
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await act(async () => finish[0](Response.json({ event: { slug: "first-place", title: "Old event" } })));
    expect(container.textContent).toContain("Loading event details");
    expect(container.textContent).not.toContain("Old event");
    await act(async () => finish[1](Response.json({ event: { slug: "second-place", title: "Second event" } })));
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts when route navigation dismisses the lookup", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init?.signal;
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

  it("offers an immediate full-page escape with the original browse context", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init?.signal;
      return new Promise(() => {});
    }));
    await click("First");
    await click("Open full page");
    expect(signal?.aborted).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const destination = new URL(harness.push.mock.calls[0][0], "https://frederickradius.app");
    expect(destination.pathname).toBe("/events/first-place");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts on provider unmount without redirecting after cancellation", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init?.signal;
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
