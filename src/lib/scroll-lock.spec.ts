// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScrollLock } from "@/hooks/useScrollLock";
import { acquireScrollLock } from "./scroll-lock";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const root = document.documentElement;
const realInnerWidth = window.innerWidth;

/** jsdom has no layout, so give the root a viewport and a classic scrollbar. */
function layout(innerWidth: number, clientWidth: number) {
  window.innerWidth = innerWidth;
  Object.defineProperty(root, "clientWidth", { configurable: true, value: clientWidth });
}

beforeEach(() => layout(1024, 1024));
afterEach(() => {
  root.removeAttribute("style");
  document.body.removeAttribute("style");
  window.innerWidth = realInnerWidth;
  Reflect.deleteProperty(root, "clientWidth");
});

describe("acquireScrollLock", () => {
  it("locks the scroll root and leaves body alone", () => {
    const release = acquireScrollLock();
    expect(root.style.overflowY).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.getAttribute("style")).toBeNull();
    release();
    expect(root.style.overflowY).toBe("");
    expect(document.body.getAttribute("style")).toBeNull();
  });

  it.each([
    ["first holder first", [0, 1]],
    ["last holder first", [1, 0]],
  ])("stays locked until the last of two holders releases (%s)", (_name, order) => {
    const releases = [acquireScrollLock(), acquireScrollLock()];
    releases[order[0]]();
    expect(root.style.overflowY).toBe("hidden");
    releases[order[1]]();
    expect(root.style.overflowY).toBe("");
  });

  it("ignores a second call to the same release", () => {
    const first = acquireScrollLock();
    const second = acquireScrollLock();
    first();
    first();
    expect(root.style.overflowY).toBe("hidden");
    second();
    expect(root.style.overflowY).toBe("");
  });

  it("restores inline values that were set before the lock", () => {
    root.style.overflowY = "clip";
    root.style.paddingRight = "3px";
    layout(1024, 1016);
    const outer = acquireScrollLock();
    const inner = acquireScrollLock();
    expect(root.style.overflowY).toBe("hidden");
    expect(root.style.paddingRight).toBe("8px");
    outer();
    inner();
    expect(root.style.overflowY).toBe("clip");
    expect(root.style.paddingRight).toBe("3px");
  });

  it("pads the root by the classic scrollbar width and removes it on release", () => {
    layout(1024, 1016);
    const release = acquireScrollLock();
    expect(root.style.paddingRight).toBe("8px");
    // The scrollbar is gone once locked. A nested holder must not re-measure.
    layout(1024, 1024);
    const nested = acquireScrollLock();
    expect(root.style.paddingRight).toBe("8px");
    nested();
    release();
    expect(root.style.paddingRight).toBe("");
  });

  it("adds no padding for overlay scrollbars or a root without layout", () => {
    const overlay = acquireScrollLock();
    expect(root.style.paddingRight).toBe("");
    overlay();
    layout(1024, 0);
    const noLayout = acquireScrollLock();
    expect(root.style.overflowY).toBe("hidden");
    expect(root.style.paddingRight).toBe("");
    noLayout();
  });

  it("locks again cleanly after a full release", () => {
    acquireScrollLock()();
    root.style.overflowY = "clip";
    const release = acquireScrollLock();
    expect(root.style.overflowY).toBe("hidden");
    release();
    expect(root.style.overflowY).toBe("clip");
  });
});

describe("useScrollLock", () => {
  function Lock({ active }: { active: boolean }) {
    useScrollLock(active);
    return null;
  }
  const lock = (active: boolean, key?: string) => createElement(Lock, { active, key });

  it("holds the lock while active and releases on deactivate and unmount", async () => {
    const container = document.createElement("div");
    const reactRoot = createRoot(container);
    await act(async () => reactRoot.render(lock(false)));
    expect(root.style.overflowY).toBe("");
    await act(async () => reactRoot.render(lock(true)));
    expect(root.style.overflowY).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    await act(async () => reactRoot.render(lock(false)));
    expect(root.style.overflowY).toBe("");
    await act(async () => reactRoot.render(lock(true)));
    await act(async () => reactRoot.unmount());
    expect(root.style.overflowY).toBe("");
  });

  it("keeps the page locked while either of two stacked overlays is open", async () => {
    const container = document.createElement("div");
    const reactRoot = createRoot(container);
    const render = (sheet: boolean, lightbox: boolean) =>
      act(async () => reactRoot.render([lock(sheet, "sheet"), lock(lightbox, "lightbox")]));
    await render(true, true);
    await render(false, true);
    expect(root.style.overflowY).toBe("hidden");
    await render(false, false);
    expect(root.style.overflowY).toBe("");
    await act(async () => reactRoot.unmount());
  });
});
