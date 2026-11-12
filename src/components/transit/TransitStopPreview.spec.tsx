// @vitest-environment jsdom
import { act, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectedStop } from "./StopArrivalsPopup";

type SheetProps = { present: boolean; onClose: () => void; historyLayerId: string; returnFocusRef: RefObject<HTMLButtonElement | null>; children: (dismiss: () => void) => ReactNode };
const mocked = vi.hoisted(() => ({
  phone: true, sheet: null as SheetProps | null, dismisses: 0,
  historyCalls: [] as string[], historyCallbacks: [] as Array<() => void>, immediateHistory: false,
}));
vi.mock("react-map-gl/mapbox", () => ({ Popup: ({ children, onClose }: { children: ReactNode; onClose: () => void }) => <aside data-desktop-popup><button onClick={onClose}>Close desktop</button>{children}</aside> }));
vi.mock("@/components/ui/BottomSheet", () => ({
  default: (props: SheetProps) => {
    mocked.sheet = props;
    return <section data-phone-sheet data-present={String(props.present)}>{props.children(() => { mocked.dismisses++; props.onClose(); })}</section>;
  },
  SheetHandle: ({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) => <button onClick={onClose}>{closeLabel}</button>,
}));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({ navigateAfterHistoryLayer: (id: string, next: () => void) => {
  mocked.historyCalls.push(id);
  // Model the existing helper's one traversal, with its completion controlled
  // independently from the real component's exit callback.
  window.history.back();
  if (mocked.immediateHistory) next(); else mocked.historyCallbacks.push(next);
} }));
vi.mock("@/components/map/mapContent", () => ({ formatMapTimestamp: () => "original provider observation" }));
import TransitStopPreview from "./TransitStopPreview";

const STOP: SelectedStop = { id: "162950", name: "10th Street at Motter Avenue", lat: 39.42717, lng: -77.40899 };
const NEXT_STOP: SelectedStop = { id: "162951", name: "14th Street at Motter Avenue", lat: 39.43342, lng: -77.41007 };
let host: HTMLDivElement, root: Root, launcher: HTMLButtonElement, markerRef: RefObject<HTMLButtonElement | null>;
let frames: FrameRequestCallback[], fetcher: ReturnType<typeof vi.fn>, back: ReturnType<typeof vi.spyOn>;
const close = vi.fn(), useStop = vi.fn();
async function render(stop = STOP) { await act(async () => root.render(<TransitStopPreview stop={stop} returnFocusRef={markerRef} onClose={close} onUseStop={useStop} />)); }
async function click(name: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === name);
  expect(button, name).toBeDefined(); await act(async () => button!.click());
}
async function exit() { await act(async () => mocked.sheet!.onClose()); }
async function historyComplete() { await act(async () => mocked.historyCallbacks.shift()!()); }
async function frame() { const current = frames.splice(0); await act(async () => current.forEach(callback => callback(performance.now()))); }
async function focusCleanup() { await frame(); await frame(); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-10-23T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocked.phone = true; mocked.sheet = null; mocked.dismisses = 0; mocked.historyCalls = []; mocked.historyCallbacks = []; mocked.immediateHistory = false;
  close.mockReset(); useStop.mockReset(); frames = [];
  vi.stubGlobal("matchMedia", () => ({ matches: mocked.phone }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  fetcher = vi.fn(async () => Response.json({ available: false, status: "unavailable", predictions: [] })); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  launcher = document.createElement("button"); document.body.append(launcher); markerRef = { current: launcher };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); launcher.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("TransitStopPreview presentation and handoff coordination", () => {
  it("mounts one real phone reader, explicit marker return target and one sticky Use stop action", async () => {
    await render();
    expect(host.querySelector("[data-phone-sheet]")).not.toBeNull(); expect(host.querySelector("[data-desktop-popup]")).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe(STOP.name);
    expect(host.textContent).toContain("Live arrivals are unavailable.");
    expect([...host.querySelectorAll("button")].filter(node => node.textContent === "Use this stop")).toHaveLength(1);
    expect(mocked.sheet?.returnFocusRef).toBe(markerRef); expect(mocked.sheet?.historyLayerId).toBe("transit-stop-preview");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/transit/stop-predictions?stop=${STOP.id}`, { cache: "no-store" });
  });

  it.each(["history-first", "exit-first"])("delivers the exact stop once only after %s plus both focus-cleanup frames", async (order) => {
    await render(); await click("Use this stop");
    expect(mocked.sheet?.present).toBe(false); expect(mocked.dismisses).toBe(0);
    expect(back).toHaveBeenCalledTimes(1); expect(mocked.historyCalls).toEqual(["transit-stop-preview"]);
    if (order === "history-first") { await historyComplete(); expect(useStop).not.toHaveBeenCalled(); await exit(); }
    else { await exit(); await focusCleanup(); expect(useStop).not.toHaveBeenCalled(); await historyComplete(); }
    if (order === "history-first") {
      expect(useStop).not.toHaveBeenCalled(); await frame(); expect(useStop).not.toHaveBeenCalled(); await frame();
    }
    expect(close).toHaveBeenCalledExactlyOnceWith(false); expect(useStop).toHaveBeenCalledExactlyOnceWith(STOP);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(useStop.mock.invocationCallOrder[0]);
    await exit(); await focusCleanup(); expect(useStop).toHaveBeenCalledTimes(1); expect(back).toHaveBeenCalledTimes(1);
  });

  it("also waits for exit cleanup if history has already disappeared", async () => {
    mocked.immediateHistory = true; await render(); await click("Use this stop");
    expect(useStop).not.toHaveBeenCalled(); await exit(); await focusCleanup();
    expect(useStop).toHaveBeenCalledExactlyOnceWith(STOP);
  });

  it("latches a phone preview across resize without reopening or duplicating history/source ownership", async () => {
    await render(); mocked.phone = false; window.dispatchEvent(new Event("resize")); await render();
    expect(host.querySelector("[data-phone-sheet]")).not.toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
    await click("Use this stop"); await render();
    expect(mocked.sheet?.present).toBe(false); expect(mocked.historyCalls).toHaveLength(1);
    await historyComplete(); await exit(); await focusCleanup(); expect(useStop).toHaveBeenCalledTimes(1);
  });

  it("delegates ordinary modal dismissal/focus to BottomSheet without a Use-stop history handoff", async () => {
    await render(); await click(`Close arrivals at ${STOP.name}`);
    expect(mocked.dismisses).toBe(1); expect(close).toHaveBeenCalledExactlyOnceWith(false);
    expect(useStop).not.toHaveBeenCalled(); expect(mocked.historyCalls).toEqual([]);
    await exit(); expect(close).toHaveBeenCalledTimes(1);
  });

  it("pins the activated stop even if props change before exit and history finish", async () => {
    await render(); await click("Use this stop"); await render(NEXT_STOP);
    await exit(); await historyComplete(); await focusCleanup();
    expect(useStop).toHaveBeenCalledExactlyOnceWith(STOP);
  });

  it("cancels an obsolete queued intent if its owning preview unmounts", async () => {
    await render(); await click("Use this stop"); await exit();
    await act(async () => root.render(null)); await historyComplete(); await focusCleanup();
    expect(close).not.toHaveBeenCalled(); expect(useStop).not.toHaveBeenCalled();
  });

  it("keeps the desktop Popup path latched with its original callbacks and a single reader", async () => {
    mocked.phone = false; await render(); mocked.phone = true; await render();
    expect(host.querySelector("[data-desktop-popup]")).not.toBeNull(); expect(host.querySelector("[data-phone-sheet]")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1); await click("Use this stop"); expect(useStop).toHaveBeenCalledExactlyOnceWith(STOP);
    await click("Close desktop"); expect(close).toHaveBeenCalledExactlyOnceWith(true); expect(back).not.toHaveBeenCalled();
  });
});
