// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIND_FRAME_PANEL_CLASS,
  FIND_FRAME_ROOT_CLASS,
  FIND_FRAME_SCRIM_CLASS,
} from "@/components/search/find-frame";

// The header keeps one request for the Find chunk in module state. Each test
// loads a fresh copy of the header, and of React with it, so one test's
// loaded chunk never answers the next test's first open.
const chunk = vi.hoisted(() => ({
  requests: 0,
  /** How many of the next requests fail, as a stale deploy or a dropped
   * connection would. */
  fail: 0,
  gate: Promise.resolve(),
  release: () => {},
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/events",
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
vi.mock("@/components/brand/RippleMark", () => ({ default: () => null }));
// Stands in for the lazy chunk. The gate holds the import open so a test can
// open Find before the chunk arrives. The real overlay is covered by
// TopBar.find-continuity.spec.tsx. Registered again before every mount,
// because a module reset keeps the result of a factory that already ran.
function mockChunk() {
  vi.doMock("@/components/search/SearchOverlay", async () => {
    chunk.requests += 1;
    await chunk.gate;
    if (chunk.fail > 0) {
      chunk.fail -= 1;
      throw new Error("ChunkLoadError: fixture");
    }
    return {
      default: () => <div id="radius-find-dialog" role="dialog" aria-modal="true" aria-label="Find" />,
    };
  });
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Act = typeof import("react").act;
type Root = import("react-dom/client").Root;

let act: Act;
let root: Root;
let container: HTMLDivElement;
let mounted = false;

const dialog = () => document.querySelector<HTMLElement>("#radius-find-dialog");
const findControl = () => {
  const control = container.querySelector<HTMLButtonElement>("button[data-find-interaction-ready]");
  if (!control) throw new Error("The header Find control is missing");
  return control;
};

function holdChunk() {
  chunk.gate = new Promise<void>((resolve) => { chunk.release = resolve; });
}
let resetBoundary: () => void = () => {};
const boundaryShown = () => container.querySelector("[data-test-boundary]") !== null;
async function mount({ withBoundary = false }: { withBoundary?: boolean } = {}) {
  vi.resetModules();
  mockChunk();
  const React = await import("react");
  ({ act } = React);
  const { createRoot } = await import("react-dom/client");
  const { default: TopBar } = await import("./TopBar");
  // Stands in for the app's error boundary, with a reset like its Try again.
  class Boundary extends React.Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
      resetBoundary = () => this.setState({ failed: false });
      return this.state.failed ? <p data-test-boundary>Something went wrong.</p> : this.props.children;
    }
  }
  root = createRoot(container, { onCaughtError: () => {} });
  // The first act hydrates the header; the readiness microtask needs a second.
  await act(async () => { root.render(withBoundary ? <Boundary><TopBar /></Boundary> : <TopBar />); });
  await act(async () => { await Promise.resolve(); });
  mounted = true;
}
async function chunkSettled() {
  await act(async () => {
    chunk.release();
    await vi.dynamicImportSettled();
  });
}
/** Every dialog the document showed since `watch` was called, in order. */
function watchDialogs() {
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const added = node.matches('[role="dialog"]') ? [node] : [...node.querySelectorAll<HTMLElement>('[role="dialog"]')];
        for (const each of added) seen.push(each.getAttribute("aria-label") ?? "");
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return async () => {
    await Promise.resolve();
    observer.disconnect();
    return seen;
  };
}

beforeEach(() => {
  chunk.requests = 0;
  chunk.fail = 0;
  chunk.gate = Promise.resolve();
  chunk.release = () => {};
  mounted = false;
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/events");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  chunk.release();
  if (mounted) await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
  window.history.replaceState({}, "", "/");
});

describe("Find chunk preload", () => {
  it.each([
    ["keyboard focus", () => findControl().focus()],
    ["a pointer over the control", () => findControl().dispatchEvent(new MouseEvent("pointerover", { bubbles: true }))],
    ["a press", () => findControl().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))],
  ])("asks for the chunk on %s, before any click", async (_name, reach) => {
    await mount();
    expect(chunk.requests).toBe(0);
    await act(async () => { reach(); });
    expect(chunk.requests).toBe(1);
    expect(dialog()).toBeNull();
    // A second signal reuses the same request.
    await act(async () => { findControl().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(chunk.requests).toBe(1);
  });

  it("asks once the page is idle, and cancels that if the header leaves first", async () => {
    let idle: (() => void) | undefined;
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => { idle = callback; return 7; }));
    vi.stubGlobal("cancelIdleCallback", cancel);
    await mount();
    expect(window.requestIdleCallback).toHaveBeenCalledOnce();
    expect(chunk.requests).toBe(0);
    await act(async () => { idle?.(); });
    expect(chunk.requests).toBe(1);
    await act(async () => { root.unmount(); });
    mounted = false;
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("leaves the idle request out when the visitor asked the browser to save data", async () => {
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 7));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    await mount();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(chunk.requests).toBe(0);
    // Reaching for the control is still a reason to fetch it.
    await act(async () => { findControl().focus(); });
    expect(chunk.requests).toBe(1);
  });

  it("draws the workspace itself, with no loading frame, once the chunk is present", async () => {
    await mount();
    await act(async () => {
      findControl().focus();
      await vi.dynamicImportSettled();
    });
    const dialogsShown = watchDialogs();
    await act(async () => { findControl().click(); });
    expect(dialog()?.getAttribute("aria-label")).toBe("Find");
    expect(await dialogsShown()).toEqual(["Find"]);
  });
});

describe("Find loading frame", () => {
  it("is the same panel over the same scrim when the open beats the chunk, then gives way at once", async () => {
    holdChunk();
    await mount();
    const opener = findControl();
    await act(async () => {
      opener.focus();
      opener.click();
    });
    const loading = dialog();
    expect(loading?.getAttribute("aria-label")).toBe("Loading search");
    expect(loading?.getAttribute("aria-modal")).toBe("true");
    expect(loading?.className).toBe(FIND_FRAME_ROOT_CLASS);
    const scrim = loading?.querySelector<HTMLElement>("[data-find-loading-scrim]");
    expect(scrim?.className).toBe(FIND_FRAME_SCRIM_CLASS);
    // The focus trap counts every enabled button, so the scrim is not one.
    expect(scrim?.tagName).toBe("DIV");
    expect(loading?.querySelector("[data-find-loading-panel]")?.className).toBe(FIND_FRAME_PANEL_CLASS);
    expect(loading?.textContent).toContain("What do you need?");
    // The loading frame owns the same page lock, focus and Back step as Find.
    expect(document.documentElement.style.overflowY).toBe("hidden");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close search");
    const layer = window.history.state.__frederickRadiusLayer;
    expect(layer).toMatch(/^find:/);

    await chunkSettled();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog()?.getAttribute("aria-label")).toBe("Find");
    expect(chunk.requests).toBe(1);
  });

  it.each([
    ["Escape", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))],
    ["a click on the scrim", () => dialog()!.querySelector<HTMLElement>("[data-find-loading-scrim]")!.click()],
    ["Close", () => dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Close search"]')!.click()],
  ])("closes on %s and stays closed when the chunk arrives late", async (_name, dismiss) => {
    holdChunk();
    await mount();
    const opener = findControl();
    await act(async () => {
      opener.focus();
      opener.click();
    });
    expect(dialog()?.getAttribute("aria-label")).toBe("Loading search");
    await act(async () => { dismiss(); });
    // Let the real history-layer Back event and the focus return settle.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(dialog()).toBeNull();
    expect(document.documentElement.style.overflowY).toBe("");
    expect(document.activeElement).toBe(opener);
    expect(window.history.state?.__frederickRadiusLayer).toBeUndefined();

    await chunkSettled();
    expect(dialog()).toBeNull();
  });
});

describe("Find chunk failure", () => {
  // The open makes the first request, so the idle preload stays out.
  async function openWhileFailing(failures: number) {
    chunk.fail = failures;
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    await mount({ withBoundary: true });
    await act(async () => { findControl().click(); });
    await act(async () => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  }

  it("asks again on the next open instead of rethrowing the old failure", async () => {
    await openWhileFailing(1);
    expect(boundaryShown()).toBe(true);
    expect(chunk.requests).toBe(1);
    await act(async () => { resetBoundary(); });
    await act(async () => { await Promise.resolve(); });
    // Try again, then Find straight away: the press starts a new request and
    // the click opens before it lands.
    holdChunk();
    await act(async () => {
      findControl().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      findControl().click();
    });
    expect(boundaryShown()).toBe(false);
    expect(dialog()?.getAttribute("aria-label")).toBe("Loading search");
    await chunkSettled();
    expect(dialog()?.getAttribute("aria-label")).toBe("Find");
    expect(chunk.requests).toBe(2);
  });

  it("does not keep asking on its own while the chunk keeps failing", async () => {
    await openWhileFailing(5);
    expect(boundaryShown()).toBe(true);
    expect(chunk.requests).toBe(1);
  });
});
