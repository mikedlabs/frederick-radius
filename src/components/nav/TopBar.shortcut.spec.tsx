// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/events" }));
const overlay = vi.hoisted(() => ({ openerRef: null as RefObject<HTMLElement | null> | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
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
// The shortcut contract ends where Find opens. The real overlay is covered by
// TopBar.find-continuity.spec.tsx.
vi.mock("@/components/search/SearchOverlay", () => ({
  default: ({ openerRef }: { openerRef: RefObject<HTMLElement | null> }) => {
    overlay.openerRef = openerRef;
    return <div id="radius-find-dialog" role="dialog" aria-modal="true" aria-label="Find" />;
  },
}));

import TopBar from "./TopBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let pageButton: HTMLButtonElement;
let pageField: HTMLInputElement;

const dialog = () => document.querySelector("#radius-find-dialog");
const badge = () => container.querySelector("kbd");
const desktopFind = () => container.querySelector<HTMLButtonElement>("button[aria-keyshortcuts]");

async function mount() {
  // The first act hydrates the header; the readiness microtask needs a second.
  await act(async () => { root.render(<TopBar />); });
  await act(async () => { await Promise.resolve(); });
}
async function press(target: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.focus();
    target.dispatchEvent(event);
    await vi.dynamicImportSettled();
  });
  return event;
}

beforeEach(() => {
  navigation.pathname = "/events";
  overlay.openerRef = null;
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/events");
  container = document.createElement("div");
  pageButton = document.createElement("button");
  pageField = document.createElement("input");
  document.body.append(container, pageButton, pageField);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  pageButton.remove();
  pageField.remove();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("Find keyboard shortcuts", () => {
  it.each([
    ["Cmd+K", { key: "k", metaKey: true }],
    ["Ctrl+K", { key: "k", ctrlKey: true }],
    ["Cmd+K with Caps Lock", { key: "K", metaKey: true }],
    ["slash", { key: "/" }],
  ])("opens Find with %s and remembers where focus was", async (_name, init) => {
    await mount();
    const event = await press(pageButton, init);
    expect(dialog()).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(overlay.openerRef?.current).toBe(pageButton);
  });

  it("opens with the chord from inside a field, where slash stays a typed character", async () => {
    await mount();
    const slash = await press(pageField, { key: "/" });
    expect(dialog()).toBeNull();
    expect(slash.defaultPrevented).toBe(false);

    const chord = await press(pageField, { key: "k", metaKey: true });
    expect(dialog()).not.toBeNull();
    expect(chord.defaultPrevented).toBe(true);
    expect(overlay.openerRef?.current).toBe(pageField);
  });

  it("leaves Control+K in a field to the Apple delete-to-end-of-line command", async () => {
    await mount();
    const kill = await press(pageField, { key: "k", ctrlKey: true });
    expect(dialog()).toBeNull();
    expect(kill.defaultPrevented).toBe(false);
  });

  it("opens with Control+K from inside a field on keyboards where that is the chord", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    await mount();
    const chord = await press(pageField, { key: "k", ctrlKey: true });
    expect(dialog()).not.toBeNull();
    expect(chord.defaultPrevented).toBe(true);
    expect(overlay.openerRef?.current).toBe(pageField);
  });

  it.each([
    ["Cmd+Shift+K", { key: "K", metaKey: true, shiftKey: true }],
    ["Ctrl+Alt+K", { key: "k", ctrlKey: true, altKey: true }],
    ["a bare K", { key: "k" }],
  ])("leaves %s to the browser", async (_name, init) => {
    await mount();
    const event = await press(pageButton, init);
    expect(dialog()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps the first opener when the chord repeats while Find is open", async () => {
    await mount();
    await press(pageButton, { key: "k", metaKey: true });
    const repeat = await press(pageField, { key: "k", metaKey: true });
    expect(document.querySelectorAll("#radius-find-dialog")).toHaveLength(1);
    expect(repeat.defaultPrevented).toBe(true);
    expect(overlay.openerRef?.current).toBe(pageButton);
  });

  it("hands the chord to the map's own search field on the map", async () => {
    navigation.pathname = "/map";
    window.history.replaceState({}, "", "/map");
    const focusMapSearch = vi.fn();
    window.addEventListener("fr:focus-map-search", focusMapSearch);
    try {
      await mount();
      const event = await press(pageButton, { key: "k", ctrlKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(focusMapSearch).toHaveBeenCalledOnce();
      expect(dialog()).toBeNull();
    } finally {
      window.removeEventListener("fr:focus-map-search", focusMapSearch);
      delete (window as Window & { __frPendingFind?: string }).__frPendingFind;
    }
  });
});

describe("Find shortcut hint", () => {
  it.each([
    ["MacIntel", "⌘K", "Meta+K"],
    ["iPad", "⌘K", "Meta+K"],
    ["Win32", "Ctrl K", "Control+K"],
    ["Linux x86_64", "Ctrl K", "Control+K"],
  ])("prints the key a %s keyboard has", async (platform, label, shortcut) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    await mount();
    expect(badge()?.textContent).toBe(label);
    expect(desktopFind()?.getAttribute("aria-keyshortcuts")).toBe(shortcut);
    expect(desktopFind()?.getAttribute("aria-label")).toBe("Ask or find across Frederick County");
  });

  it("renders no key on the server, so hydration never corrects a wrong one", () => {
    const html = renderToString(<TopBar />);
    expect(html).toContain("What do you need?");
    expect(html).not.toContain("<kbd");
    expect(html).not.toContain("aria-keyshortcuts");
  });
});
