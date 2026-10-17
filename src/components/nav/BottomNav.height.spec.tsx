// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/map", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

import BottomNav from "./BottomNav";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const property = "--app-tabbar-h";
let container: HTMLDivElement;
let root: Root;
let height = 56;
let notify: ResizeObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  height = 56;
  state.pathname = "/map";
  observe.mockReset();
  disconnect.mockReset();
  document.documentElement.style.removeProperty(property);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const nativeBounds = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-app-tabbar")
      ? { x: 0, y: 700, left: 0, top: 700, right: 320, bottom: 700 + height, width: 320, height, toJSON: () => ({}) }
      : nativeBounds.call(this);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.style.removeProperty(property);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() { await act(async () => root.render(<BottomNav />)); }
function resize(nextHeight: number) {
  height = nextHeight;
  notify([], {} as ResizeObserver);
}

describe("BottomNav measured map tab strip", () => {
  it("publishes the strip height on /map, follows growth, and ignores a zero reading", async () => {
    await mount();
    expect(observe).toHaveBeenCalledWith(container.querySelector("[data-app-tabbar]"));
    expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
    resize(112.4);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("112px");
    resize(0);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("112px");
  });

  it("does not publish on other primary destinations", async () => {
    state.pathname = "/today";
    await mount();
    expect(observe).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
    expect(container.querySelector("[data-map-bottom-nav]")).toBeNull();
  });

  it("restores an earlier owned value on unmount", async () => {
    document.documentElement.style.setProperty(property, "68px");
    await mount();
    resize(96);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("96px");
    await act(async () => root.unmount());
    expect(document.documentElement.style.getPropertyValue(property)).toBe("68px");
  });
});
