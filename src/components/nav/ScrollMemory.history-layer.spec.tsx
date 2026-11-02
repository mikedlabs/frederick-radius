// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import ScrollMemory from "./ScrollMemory";

const route = vi.hoisted(() => ({ pathname: "/events", search: "when=today&in=frederick&free=true" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const source = "/events?when=today&in=frederick&free=true", key = `fr:scroll:${source}`;
let root: Root, host: HTMLDivElement, position: number;
beforeEach(() => {
  window.dispatchEvent(new Event("pagehide")); window.dispatchEvent(new Event("pageshow"));
  vi.useFakeTimers(); sessionStorage.clear(); history.replaceState({}, "", source);
  route.pathname = "/events"; route.search = source.split("?")[1]; position = 19;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2400);
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" }] as unknown as PerformanceEntryList);
  vi.stubGlobal("scrollTo", vi.fn((options: ScrollToOptions) => { position = options.top ?? 0; window.dispatchEvent(new Event("scroll")); }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div"); const board = document.createElement("main");
  board.dataset.eventsInteractionReady = "true"; board.dataset.eventsComplete = "true"; board.setAttribute("aria-busy", "false");
  document.body.append(host, board); root = createRoot(host);
});
afterEach(async () => {
  window.dispatchEvent(new Event("pagehide")); await act(async () => root.unmount());
  document.body.replaceChildren(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear();
});
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
function Fixture({ preserve }: { preserve: boolean }) {
  const [open, setOpen] = useState(true);
  useReversibleHistoryLayer({ active: open, id: "actual-layer", onDismiss: () => setOpen(false), preserveUrlOnDismiss: preserve });
  return <><ScrollMemory />{open && <div role="dialog">Actual temporary layer</div>}</>;
}
describe("temporary layer and browse scroll ownership", () => {
  it.each([
    "q=live%20music&in=frederick",
    "q=caf%c3%a9%20music&in=frederick",
    "q=C%2b%2b%20music&in=frederick",
    "q=live%20music&q=caf%C3%A9%2B&in=frederick",
  ])("records owned return/remount and later genuine query navigation for encoded %s", async rawSearch => {
    const encoded = `/events?${rawSearch}`, canonical = `/events?${new URLSearchParams(rawSearch)}`;
    const canonicalKey = `fr:scroll:${canonical}`;
    route.search = rawSearch; history.replaceState({}, "", encoded);
    await act(async () => root.render(<Fixture preserve={false} />));
    await act(async () => {
      history.replaceState({}, "", encoded); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32);
    await act(async () => root.render(<ScrollMemory key="encoded-remount" />));
    position = 866; window.dispatchEvent(new Event("scroll")); await advance(4000);
    expect(position).toBe(866); expect(sessionStorage.getItem(canonicalKey)).toBe("866");
    const freshSearch = "in=brunswick&q=different%20phrase&q=x%2By", fresh = `/events?${freshSearch}`;
    const freshKey = `fr:scroll:/events?${new URLSearchParams(freshSearch)}`;
    sessionStorage.setItem(freshKey, "612"); route.search = freshSearch; history.pushState({}, "", fresh);
    await act(async () => root.render(<ScrollMemory key="encoded-fresh" />));
    await advance(500); expect(sessionStorage.getItem(freshKey)).toBeNull();
    position = 0; route.search = rawSearch;
    await act(async () => {
      history.replaceState({}, "", encoded); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      root.render(<ScrollMemory key="encoded-real-back" />);
    });
    await advance(16); expect(position).toBe(866);
  });
  it.each([
    "in=frederick&q=live%20music&q=C%2B%2B",
    "q=C%2B%2B&q=live%20music&in=frederick",
    "q=live%20music&in=frederick",
  ])("does not merge a different query order or duplicate sequence: %s", async destinationSearch => {
    const rawSearch = "q=live%20music&q=C%2B%2B&in=frederick", encoded = `/events?${rawSearch}`;
    route.search = rawSearch; history.replaceState({}, "", encoded);
    await act(async () => root.render(<Fixture preserve={false} />));
    await act(async () => {
      history.replaceState({}, "", encoded); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32);
    const destination = `/events?${destinationSearch}`;
    sessionStorage.setItem(`fr:scroll:/events?${new URLSearchParams(destinationSearch)}`, "612");
    route.search = destinationSearch;
    await act(async () => {
      history.replaceState({}, "", destination); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      root.render(<ScrollMemory key="different-query-order" />);
    });
    await advance(16); expect(position).toBe(612);
  });
  it.each([false, true])("does not pin later card centering to a competing stored clamp after an owned Back (editor=%s)", async preserve => {
    await act(async () => root.render(<Fixture preserve={preserve} />));
    // An in-layer programmatic scroll can differ from the actual pre-open
    // coordinate. Back belongs to the layer, not this incidental 4px value.
    position = 4; window.dispatchEvent(new Event("scroll")); await advance(16);
    expect(sessionStorage.getItem(key)).toBe("4");
    await act(async () => {
      history.replaceState({}, "", source);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32); expect(position).toBe(19);
    // This models actual card scrollIntoView after the dialog is gone. No
    // artificial input event is needed to cancel a competing corrector.
    position = 866; window.dispatchEvent(new Event("scroll")); await advance(4000);
    expect(position).toBe(866); expect(sessionStorage.getItem(key)).toBe("866");
  });
  it("keeps generic correction for a real different-query history destination", async () => {
    await act(async () => root.render(<Fixture preserve={false} />));
    const destination = "/events?in=brunswick"; sessionStorage.setItem(`fr:scroll:${destination}`, "612");
    await act(async () => {
      history.replaceState({}, "", destination);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32); expect(position).toBe(612);
  });
  it("retains the layer's coordinate when ScrollMemory remounts after its two-frame return", async () => {
    await act(async () => root.render(<Fixture preserve />));
    position = 4; window.dispatchEvent(new Event("scroll")); await advance(16);
    await act(async () => {
      history.replaceState({}, "", source); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32); expect(position).toBe(19);
    await act(async () => root.render(<ScrollMemory key="new-route-effect" />));
    await advance(500);
    expect(sessionStorage.getItem(key)).toBe("19");
  });
  it("does not resurrect an older generic pop correction on a remounted owned return", async () => {
    sessionStorage.setItem(key, "19"); window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("pointerdown")); // Actual input opening a newer layer wins.
    await act(async () => root.render(<Fixture preserve />));
    position = 4; window.dispatchEvent(new Event("scroll")); await advance(16);
    await act(async () => {
      history.replaceState({}, "", source); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await act(async () => root.render(<ScrollMemory key="early-remount" />));
    await advance(32);
    position = 866; window.dispatchEvent(new Event("scroll")); await advance(4000);
    expect(position).toBe(866); expect(sessionStorage.getItem(key)).toBe("866");
  });
  it("keeps the owned decision through an intermediate query context and a late final remount", async () => {
    await act(async () => root.render(<Fixture preserve />));
    position = 4; window.dispatchEvent(new Event("scroll")); await advance(16);
    await act(async () => {
      history.replaceState({}, "", source); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32);
    route.search = "when=today&in=frederick"; // Address bar already retains free=true.
    await act(async () => root.render(<ScrollMemory key="intermediate-context" />));
    await advance(4000); expect(sessionStorage.getItem(key)).toBe("19");
    route.search = source.split("?")[1];
    await act(async () => root.render(<ScrollMemory key="final-context" />));
    await advance(500); expect(sessionStorage.getItem(key)).toBe("19");
    position = 866; window.dispatchEvent(new Event("scroll")); await advance(4000);
    expect(position).toBe(866); expect(sessionStorage.getItem(key)).toBe("866");
  });
  it("releases the owned decision for a genuinely new query and its later native Back", async () => {
    await act(async () => root.render(<Fixture preserve />));
    await act(async () => {
      history.replaceState({}, "", source); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await advance(32);
    const fresh = "/events?in=brunswick", freshKey = `fr:scroll:${fresh}`;
    sessionStorage.setItem(freshKey, "612"); route.search = "in=brunswick";
    history.pushState({}, "", fresh);
    await act(async () => root.render(<ScrollMemory key="fresh-query" />));
    await advance(500); expect(sessionStorage.getItem(freshKey)).toBeNull();
    position = 0; route.search = source.split("?")[1];
    await act(async () => {
      history.replaceState({}, "", source); window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      root.render(<ScrollMemory key="real-back" />);
    });
    await advance(16); expect(position).toBe(19);
  });
});
