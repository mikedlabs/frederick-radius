// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleFindReturnScroll } from "./find-return-scroll";

const layerKey = "__frederickRadiusLayer";
const layerId = "find:test";
let position = 120;
let cancels: Array<() => void> = [];
const schedule = (target = 120) => cancels.push(settleFindReturnScroll(target, layerId));
function returnFromLayer() {
  window.history.replaceState({ page: "library" }, "", "/places/brunswick-branch-library-brunswick");
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}
function scrollToPosition(next: number, emit = true) {
  position = next;
  if (emit) window.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  vi.useFakeTimers();
  position = 120;
  cancels = [];
  document.body.innerHTML = "";
  window.history.replaceState({ page: "library", [layerKey]: layerId }, "", "/places/brunswick-branch-library-brunswick");
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  for (const cancel of cancels) cancel();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Find's delayed return yields to the next action", () => {
  it("preserves the quiet return after Close and a late rail layout settles", () => {
    schedule();
    returnFromLayer();
    document.body.innerHTML = '<main><section style="height:600px">Late rail</section></main>';
    window.dispatchEvent(new Event("scroll")); // the existing two-frame restore reaches its target
    vi.advanceTimersByTime(219);
    expect(window.scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 120, behavior: "auto" });
  });

  it("preserves quiet browser Back after the layer was already removed", () => {
    returnFromLayer();
    schedule();
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 120, behavior: "auto" });
  });

  it("does not pull centered library hours back under the toolbar", () => {
    schedule(0);
    returnFromLayer();
    scrollToPosition(370);
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(position).toBe(370);
  });

  it("detects a newer programmatic scroll even before its scroll event arrives", () => {
    schedule(); returnFromLayer(); scrollToPosition(450, false);
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("does not regain ownership if a newer scroll happens to return to the old coordinate", () => {
    schedule(); returnFromLayer(); scrollToPosition(450); scrollToPosition(120);
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each(["pointerdown", "wheel", "touchstart", "keydown"])("yields to %s after Close without waiting for scrolling", (type) => {
    schedule(); returnFromLayer(); window.dispatchEvent(new Event(type));
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each(["/today", "/places/brunswick-branch-library-brunswick?chapter=hours", "/places/brunswick-branch-library-brunswick#hours"])("cannot restore after navigation to %s", (href) => {
    schedule(); returnFromLayer(); window.history.replaceState({ page: "next" }, "", href);
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("cannot restore over newer same-URL history state", () => {
    schedule(); returnFromLayer(); window.history.pushState({ page: "new state" }, "");
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("yields to another history traversal after its own close traversal", () => {
    schedule(); returnFromLayer(); window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("cannot restore over a reopened Find history layer", () => {
    schedule(); returnFromLayer(); window.history.pushState({ [layerKey]: "find:new" }, "");
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("cannot restore while a newly opened lazy Find dialog is present", () => {
    schedule(); returnFromLayer(); document.body.innerHTML = '<div id="radius-find-dialog" role="dialog">Find</div>';
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("drops the delayed restore before document navigation or BFCache suspension", () => {
    schedule(); returnFromLayer(); window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(220);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("only lets the newest close retain a delayed restore", () => {
    schedule(); returnFromLayer(); vi.advanceTimersByTime(100);
    scrollToPosition(500, false); schedule(500);
    vi.advanceTimersByTime(120); expect(window.scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100); expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 500, behavior: "auto" });
  });

  it("releases every temporary event listener after its quiet completion", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    schedule(); returnFromLayer(); vi.advanceTimersByTime(220);
    expect(add.mock.calls.length).toBeGreaterThan(0);
    for (const [type, handler] of add.mock.calls) {
      expect(remove.mock.calls.some(([removedType, removedHandler]) => removedType === type && removedHandler === handler)).toBe(true);
    }
  });

  it("releases every temporary event listener immediately after cancellation", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    schedule(); returnFromLayer(); window.dispatchEvent(new Event("wheel"));
    expect(add.mock.calls.length).toBeGreaterThan(0);
    for (const [type, handler] of add.mock.calls) {
      expect(remove.mock.calls.some(([removedType, removedHandler]) => removedType === type && removedHandler === handler)).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
