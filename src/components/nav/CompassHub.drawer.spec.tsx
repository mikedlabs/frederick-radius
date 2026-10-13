// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompassHub from "./CompassHub";
import InterceptedDrawer from "./InterceptedDrawer";

const navigation = vi.hoisted(() => ({ back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next/link", () => ({ default: ({ prefetch, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
  void prefetch; return <a {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }} />;
} }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime("2026-10-12T16:00:00.000Z");
  navigation.back.mockClear(); navigation.prefetch.mockClear();
  window.localStorage.clear(); window.history.replaceState({}, "", "/compass");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); await act(async () => vi.advanceTimersByTimeAsync(600)); host.remove();
  window.localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function render() {
  await act(async () => root.render(<InterceptedDrawer title="All tools" bareHeader inlineToolsPanels><div className="p-4"><CompassHub embeddedInToolsDrawer /></div></InterceptedDrawer>));
  await act(async () => vi.advanceTimersByTimeAsync(50));
}
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]')!; }
function button(name: string) { return [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === name)!; }
async function click(target: HTMLElement) { await act(async () => target.click()); await act(async () => vi.advanceTimersByTimeAsync(32)); }
async function escape(target: HTMLElement) {
  await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await act(async () => vi.advanceTimersByTimeAsync(300));
}

describe("actual Radix Tools drawer delegation", () => {
  it("prevents outer dismissal at document capture and returns from the inline index once", async () => {
    await render(); const outer = dialog(); const launcher = button("Browse the full tool index");
    await click(launcher);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const inner = outer.querySelector<HTMLElement>("[data-tool-deck-inline]")!;
    expect(inner).not.toBeNull(); expect(document.activeElement).toBe(inner.querySelector("button"));
    await escape(inner.querySelector<HTMLButtonElement>("button")!);
    expect(navigation.back).not.toHaveBeenCalled();
    expect(dialog()).toBe(outer); expect(outer.querySelector("[data-tool-deck-inline]")).toBeNull();
    expect(window.location.search).toBe(""); expect(document.activeElement).toBe(launcher);
  });
  it("keeps normal outer Escape dismissal when no inner panel owns input", async () => {
    await render(); const close = dialog().querySelector<HTMLButtonElement>('button[aria-label="Close All tools"]')!;
    await escape(close); expect(navigation.back).toHaveBeenCalledTimes(1);
  });
});
