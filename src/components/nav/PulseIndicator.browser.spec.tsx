// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => harness.pathname }));
vi.mock("./AppTransitionLink", () => ({ default: (props: Record<string, unknown>) => {
  const { prefetch: _prefetch, ...anchorProps } = props;
  void _prefetch;
  return createElement("a", anchorProps);
} }));
import PulseIndicator, { PULSE_STATUS_TIMEOUT_MS, pulseChipWord } from "./PulseIndicator";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const quiet = { active: false, count: 0, tone: "quiet", ok: true, lastUpdated: "2026-10-07T03:00:00.000Z" };
const alerts = { ...quiet, active: true, count: 2, tone: "alert" };
function response(payload: unknown): Response { return { ok: true, json: async () => payload } as Response; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
describe("PulseIndicator status transport", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T03:00:00.000Z"));
    harness.pathname = "/today";
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  });
  it("marks a failed later poll unavailable instead of retaining a current all-clear", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ active: false, count: 0, tone: "quiet", ok: true, lastUpdated: "2026-10-07T03:00:00.000Z" }) }).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Quiet, no active alerts");
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
  });
  it("keeps earlier alerts but labels them unverified after a failed check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(alerts)).mockRejectedValueOnce(new Error("offline")));
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown. Earlier report had 2 alerts; current alerts are unverified.");
    // An earlier report is not a current claim, so the chip says Unknown.
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unknown");
    expect(container.querySelector("[data-pulse-indicator]")?.getAttribute("data-pulse-state")).toBe("unavailable");
  });
  it.each([
    ["missing coverage", { ...quiet, ok: undefined }],
    ["inconsistent active count", { ...quiet, active: true }],
    ["negative count", { ...quiet, count: -1 }],
    ["unsupported tone", { ...quiet, tone: "safe" }],
    ["quiet positive report", { ...alerts, tone: "quiet" }],
    ["invalid timestamp", { ...quiet, lastUpdated: "unknown" }],
    ["absent payload", null],
  ])("rejects %s without promoting it to all-clear", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unknown");
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("inline-flex");
  });
  it("bounds a delayed body and ignores its late outcome, then clears stale on valid recovery", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(alerts)).mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response({ ...quiet, lastUpdated: new Date().toISOString() }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("checking");
    await act(async () => vi.advanceTimersByTimeAsync(PULSE_STATUS_TIMEOUT_MS));
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await act(async () => body.resolve(quiet));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Quiet, no active alerts");
    expect(container.querySelector("[data-pulse-mobile-state]")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
  });
  it("consumes a late body rejection after its deadline", async () => {
    const body = deferred<unknown>(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(PULSE_STATUS_TIMEOUT_MS));
    await act(async () => body.reject(new Error("late body failure")));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
  });
  it("bounds ignored header abort and schedules one later retry instead of overlapping polls", async () => {
    const transport = deferred<Response>(); const fetchMock = vi.fn().mockReturnValue(transport.promise); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(PULSE_STATUS_TIMEOUT_MS));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does no hidden work, aborts an old body and checks again when visible", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const body = deferred<unknown>(); const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response({ ...quiet, lastUpdated: new Date().toISOString() })); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60 * 1000)); expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60 * 1000)); expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => body.resolve(alerts));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Quiet, no active alerts");
  });
  it("reports known alerts with incomplete coverage without suggesting an all-clear", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, ok: false })));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Urgent, 2 alerts reported; some sources unavailable");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Urgent");
  });
  // Oct 7, 2 AM: the header read "Unknown" in alert red beside a red dot while
  // its accessible name said "1 alert reported; some sources unavailable".
  it.each([
    ["alert", "Urgent", "var(--app-danger)"],
    ["caution", "Advisory", "var(--app-warning)"],
  ])("names a report in the %s tone with a source down instead of calling it Unknown", async (tone, word, color) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, count: 1, tone, ok: false })));
    await act(async () => root.render(createElement(PulseIndicator)));
    const link = container.querySelector<HTMLElement>("[data-pulse-indicator]");
    const mobile = container.querySelector<HTMLElement>("[data-pulse-mobile-state]");
    const desktop = container.querySelector<HTMLElement>("[data-pulse-desktop-state]");
    expect(link?.getAttribute("aria-label")).toBe(`County status: ${word}, 1 alert reported; some sources unavailable`);
    expect(link?.textContent).not.toContain("Unknown");
    expect(mobile?.textContent).toBe(word);
    expect(desktop?.textContent).toBe(word);
    expect(mobile?.style.color).toBe(color);
    expect(desktop?.style.color).toBe(color);
    expect(container.querySelector(`[data-pulse-dot="${tone}"]`)).not.toBeNull();
    expect(container.querySelector('[data-pulse-dot="unknown"]')).toBeNull();
  });
  it("keeps the alert word in its tone on /pulse, where the link takes the current-page color", async () => {
    harness.pathname = "/pulse";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, count: 1, ok: false })));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector<HTMLElement>("[data-pulse-indicator]")?.style.color).toBe("var(--app-brand-press)");
    expect(container.querySelector<HTMLElement>("[data-pulse-mobile-state]")?.style.color).toBe("var(--app-danger)");
  });
  it("keeps Unknown neutral with the hollow ring when a partial check reported nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...quiet, ok: false })));
    await act(async () => root.render(createElement(PulseIndicator)));
    const mobile = container.querySelector<HTMLElement>("[data-pulse-mobile-state]");
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
    expect(mobile?.textContent).toBe("Unknown");
    expect(mobile?.className).toContain("text-caption");
    expect(mobile?.style.color).toBe("var(--app-ink-3)");
    expect(container.querySelector<HTMLElement>("[data-pulse-indicator]")?.style.color).toBe("var(--app-ink-3)");
    expect(container.querySelector('[data-pulse-dot="unknown"]')).not.toBeNull();
    expect(container.querySelector('[data-pulse-dot="alert"]')).toBeNull();
  });
  it("prints the readable word on the phone and moves the count to the name and the dot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, count: 3, tone: "caution" })));
    await act(async () => root.render(createElement(PulseIndicator)));
    const link = container.querySelector<HTMLElement>("[data-pulse-indicator]");
    const mobile = container.querySelector<HTMLElement>("[data-pulse-mobile-state]");
    expect(link?.getAttribute("aria-label")).toBe("County status: Advisory, 3 alerts reported");
    expect(mobile?.textContent).toBe("Advisory");
    expect(mobile?.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-caption", "font-semibold"]));
    expect(mobile?.className).not.toMatch(/text-\[/);
    expect(link?.textContent).not.toContain("alert");
    const dot = container.querySelector<HTMLElement>('[data-pulse-dot="caution"]');
    expect(dot?.textContent).toBe("3");
    expect(dot?.getAttribute("data-pulse-dot-count")).toBe("3");
    expect(dot?.className).toContain("text-caption");
  });
  it("keeps a single report's dot plain, without a numeral", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, count: 1 })));
    await act(async () => root.render(createElement(PulseIndicator)));
    const dot = container.querySelector<HTMLElement>('[data-pulse-dot="alert"]');
    expect(dot?.textContent).toBe("");
    expect(dot?.hasAttribute("data-pulse-dot-count")).toBe(false);
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Urgent");
  });
  it("says Quiet on /pulse, the word the page's own masthead uses for a calm county", async () => {
    harness.pathname = "/pulse";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quiet)));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Quiet");
    expect(container.querySelector("[data-pulse-desktop-state]")?.textContent).toBe("Quiet");
  });
  it("cancels pending work and all polling on unmount", async () => {
    const body = deferred<unknown>(); const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => root.render(null));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => body.reject(new Error("old request")));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["old", -6 * 60 * 1000],
    ["far-future", 5 * 60 * 1000 + 1],
  ])("does not promote an %s successful cached report to all-clear", async (_label, offset) => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() + offset).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unknown");
  });
  it("expires a still-displayed quiet snapshot at its age boundary without another provider request", async () => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(response(payload)); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Quiet, no active alerts");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps an expired positive snapshot labeled earlier rather than current", async () => {
    const payload = { ...alerts, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await act(async () => root.render(createElement(PulseIndicator)));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Earlier report had 2 alerts; current alerts are unverified");
  });

  it("preserves the existing bounded future clock tolerance", async () => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Quiet, no active alerts");
  });

  it("keeps mobile checking visible after failure until a valid recovery clears it", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unknown");
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("inline-flex");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Checking");
    await act(async () => body.resolve({ ...quiet, lastUpdated: new Date().toISOString() }));
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("hidden");
    expect(container.querySelector("[data-pulse-mobile-state]")).toBeNull();
  });

});

describe("pulseChipWord", () => {
  it.each([
    [{ active: true, tone: "alert", ok: true }, "ready", "Urgent"],
    [{ active: true, tone: "caution", ok: true }, "ready", "Advisory"],
    [{ active: true, tone: "caution", ok: false }, "ready", "Advisory"],
    [{ active: false, tone: "quiet", ok: true }, "ready", "Quiet"],
    [{ active: false, tone: "quiet", ok: false }, "ready", "Unknown"],
    [{ active: true, tone: "alert", ok: true }, "unavailable", "Unknown"],
    [null, "unavailable", "Unknown"],
    [null, "checking", "Checking"],
  ] as const)("maps %o while %s to %s", (status, phase, word) => {
    expect(pulseChipWord(status, phase)).toBe(word);
  });
});
