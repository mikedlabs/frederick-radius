// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_VISIT_INSTALL_DELAY_MS, type BeforeInstallPromptEvent } from "@/hooks/useInstallPrompt";
import { RETURN_BRIDGE_OPEN_EVENT } from "@/lib/return-bridge";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import InstallPrompt from "./InstallPrompt";

let host: HTMLDivElement, root: Root;
let originalUrl: string, originalState: unknown;
const phone = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const bridge = () => host.querySelector<HTMLElement>("[data-return-bridge]");
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === name)!;
async function render(path: string) {
  history.replaceState({}, "", path);
  await act(async () => root.render(<>
    <button type="button" onClick={() => window.dispatchEvent(new Event(RETURN_BRIDGE_OPEN_EVENT))}>Install Radius deliberately</button>
    <button type="button">Rider task</button>
    <InstallPrompt />
  </>));
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(phone);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  originalUrl = location.href; originalState = history.state;
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  history.replaceState(originalState, "", originalUrl);
  delete (window as Window & { __frBeforeInstallPrompt?: BeforeInstallPromptEvent }).__frBeforeInstallPrompt;
  localStorage.clear(); sessionStorage.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("installation promotion preserves focused journeys", () => {
  it.each(["/transit?stop=162950#my-stop-heading", "/map?place=carroll-creek-linear-park-frederick", "/events?in=county", "/ask"])("does not automatically interrupt %s after the real first-visit delay", async path => {
    await render(path); button("Rider task").focus();
    await advance(FIRST_VISIT_INSTALL_DELAY_MS + 1000);
    expect(bridge()).toBeNull(); expect(document.activeElement).toBe(button("Rider task"));
  });

  it("keeps the existing secondary-page timed invitation available", async () => {
    await render("/about"); await advance(FIRST_VISIT_INSTALL_DELAY_MS - 1); expect(bridge()).toBeNull();
    await advance(1); expect(bridge()).not.toBeNull(); expect(button("Not now")).toBeDefined();
  });

  it("does not reveal a queued automatic invitation when a rider's native history layer closes", async () => {
    await render("/transit?stop=162950#my-stop-heading");
    const base = { state: history.state, href: location.href };
    const dialog = document.createElement("section"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
    await act(async () => { history.pushState({ ...base.state, __frederickRadiusLayer: "declared-rider-sheet" }, "", location.href); document.body.append(dialog); });
    await advance(FIRST_VISIT_INSTALL_DELAY_MS + 1000); expect(bridge()).toBeNull();
    await act(async () => { history.back(); await vi.advanceTimersByTimeAsync(20); dialog.remove(); button("Rider task").focus(); });
    await advance(20);
    expect(history.state).toEqual(base.state); expect(location.href).toBe(base.href);
    expect(bridge()).toBeNull(); expect(document.activeElement).toBe(button("Rider task"));
  });

  it.each(["/transit?stop=162950", "/map", "/events", "/ask"])("retains deliberate native installation on %s without calling the browser until tapped", async path => {
    await render(path);
    const prompt = vi.fn(async () => undefined);
    const install = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }) });
    await act(async () => window.dispatchEvent(install));
    expect(install.defaultPrevented).toBe(true); expect(prompt).not.toHaveBeenCalled();
    await act(async () => button("Install Radius deliberately").click()); await advance(16);
    expect(bridge()).not.toBeNull(); expect(host.querySelector('[aria-label="Close Keep Radius"]')).toBe(document.activeElement);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => button("Add to Home Screen").click());
    expect(prompt).toHaveBeenCalledTimes(1); expect(bridge()).toBeNull();
  });

  it("retains the existing one-modal priority for an explicitly requested install panel", async () => {
    await render("/transit");
    const dialog = document.createElement("section"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
    await act(async () => document.body.append(dialog));
    await act(async () => button("Install Radius deliberately").click()); await advance(16);
    expect(bridge()).toBeNull();
    await act(async () => dialog.remove()); await advance(16);
    expect(bridge()).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Close Keep Radius"]')!.click());
    expect(bridge()).toBeNull();
  });
});
