// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
vi.mock("./LocationChip", () => ({ default: () => null }));
vi.mock("./PulseIndicator", () => ({ default: () => null }));

import TopBar from "./TopBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const property = "--app-topbar-h";
let container: HTMLDivElement;
let root: Root;
let height = 56;
let notify: ResizeObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  height = 56;
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
    return this.hasAttribute("data-app-topbar-row")
      ? { x: 0, y: 24, left: 0, top: 24, right: 320, bottom: 24 + height, width: 320, height, toJSON: () => ({}) }
      : nativeBounds.call(this);
  });
  window.history.replaceState({}, "", "/search");
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
async function mount() { await act(async () => root.render(<TopBar />)); }
function resize(nextHeight: number) {
  height = nextHeight;
  notify([], {} as ResizeObserver);
}

describe("TopBar measured chrome height", () => {
  it("publishes only the row height, follows growth and shrink, and preserves the offset fallback", async () => {
    document.documentElement.style.setProperty("--app-topbar-offset", "var(--app-topbar-h)");
    try {
      await mount();
      expect(observe).toHaveBeenCalledWith(container.querySelector("[data-app-topbar-row]"));
      expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
      resize(111.1875);
      expect(document.documentElement.style.getPropertyValue(property)).toBe("111.1875px");
      // A separate safe-top inset and header border must not be added again.
      expect(document.documentElement.style.getPropertyValue(property)).not.toBe("136.1875px");
      resize(56);
      expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
      expect(document.documentElement.style.getPropertyValue("--app-topbar-offset")).toBe("var(--app-topbar-h)");
    } finally { document.documentElement.style.removeProperty("--app-topbar-offset"); }
  });

  it("restores an earlier owned value and ignores notifications after unmount", async () => {
    document.documentElement.style.setProperty(property, "73px");
    await mount();
    resize(104);
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("73px");
    resize(200);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("73px");
  });

  it("does not erase a newer owner's property on unmount", async () => {
    await mount();
    document.documentElement.style.setProperty(property, "80px");
    await act(async () => root.unmount());
    expect(document.documentElement.style.getPropertyValue(property)).toBe("80px");
  });

  it("keeps the initial measurement and resize fallback when ResizeObserver is unavailable", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    height = 63.1875;
    await mount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("63.1875px");
    height = 56;
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
  });

  it("never publishes a hidden or invalid row as zero chrome height", async () => {
    await mount();
    resize(0);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
    resize(Number.NaN);
    expect(document.documentElement.style.getPropertyValue(property)).toBe("56px");
  });
});
