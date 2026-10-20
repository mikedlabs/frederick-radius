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
import PulseIndicator, { PULSE_STATUS_TIMEOUT_MS } from "./PulseIndicator";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const quiet = { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: "2026-10-07T03:00:00.000Z", validUntil: "2026-10-07T03:06:00.000Z" };
const alerts = { ...quiet, active: true, count: 2, tone: "alert", level: "Urgent" };
function response(payload: unknown): Response { return { ok: true, json: async () => payload } as Response; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
describe("PulseIndicator status transport", () => {
  let container: HTMLDivElement;
  let root: Root;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame = 0;
  const flushFrames = async () => {
    const callbacks = [...frames.values()]; frames.clear();
    await act(async () => { for (const callback of callbacks) callback(performance.now()); });
  };
  const mountPulse = async () => {
    await act(async () => root.render(createElement(PulseIndicator)));
    await flushFrames();
  };
  const advance = async (ms: number) => {
    await act(async () => vi.advanceTimersByTimeAsync(ms));
    await flushFrames();
  };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T03:00:00.000Z"));
    harness.pathname = "/today";
    frames = new Map(); nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("pageshow"));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  });
  it("does not start a read when pagehide precedes its passive mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(quiet)); vi.stubGlobal("fetch", fetchMock);
    window.dispatchEvent(new Event("pagehide"));
    await mountPulse();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event("pageshow")); document.dispatchEvent(new Event("visibilitychange")); });
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cancels a queued initial read on departure before its frame", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(PulseIndicator)));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await flushFrames();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aborts an admitted read on pagehide and resumes once after BFCache pageshow", async () => {
    const old = deferred<unknown>();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => old.promise }).mockResolvedValueOnce(response(quiet));
    vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); document.dispatchEvent(new Event("visibilitychange")); });
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => old.reject(new Error("late departed response")));
    expect(container.querySelector("[data-pulse-state]")?.getAttribute("data-pulse-state")).toBe("ready");
  });
  it("marks a failed later poll unavailable instead of retaining a current all-clear", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: "2026-10-07T03:00:00.000Z", validUntil: quiet.validUntil }) }).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
    await advance(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Unable to verify");
  });
  it("keeps earlier alerts but labels them unverified after a failed check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(alerts)).mockRejectedValueOnce(new Error("offline")));
    await mountPulse();
    await advance(5 * 60 * 1000);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Earlier report had 2 alerts; current alerts are unverified");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
    expect(container.querySelector("[data-pulse-indicator]")?.getAttribute("data-pulse-state")).toBe("unavailable");
  });
  it.each([
    ["missing coverage", { ...quiet, ok: undefined }],
    ["missing explicit level", { ...quiet, level: undefined }],
    ["contradictory clear with incomplete coverage", { ...quiet, ok: false }],
    ["contradictory severity", { ...alerts, level: "Advisory" }],
    ["inconsistent active count", { ...quiet, active: true }],
    ["negative count", { ...quiet, count: -1 }],
    ["unsupported tone", { ...quiet, tone: "safe" }],
    ["quiet positive report", { ...alerts, tone: "quiet" }],
    ["invalid timestamp", { ...quiet, lastUpdated: "unknown" }],
    ["missing deadline", { ...quiet, validUntil: undefined }],
    ["unknown deadline", { ...quiet, validUntil: null }],
    ["invalid deadline", { ...quiet, validUntil: "unverified" }],
    ["expired source deadline", { ...quiet, validUntil: quiet.lastUpdated }],
    ["absent payload", null],
  ])("rejects %s without promoting it to all-clear", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("inline-flex");
  });
  it("bounds a delayed body and ignores its late outcome, then clears stale on valid recovery", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(alerts)).mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response({ ...quiet, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
    vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await advance(5 * 60 * 1000);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toMatch(/checking/i);
    await advance(PULSE_STATUS_TIMEOUT_MS);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await act(async () => body.resolve(quiet));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await advance(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Clear");
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
  });
  it("consumes a late body rejection after its deadline", async () => {
    const body = deferred<unknown>(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
    await mountPulse();
    await advance(PULSE_STATUS_TIMEOUT_MS);
    await act(async () => body.reject(new Error("late body failure")));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
  });
  it("bounds ignored header abort and schedules one later retry instead of overlapping polls", async () => {
    const transport = deferred<Response>(); const fetchMock = vi.fn().mockReturnValue(transport.promise); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await advance(PULSE_STATUS_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await advance(5 * 60 * 1000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does no hidden work, aborts an old body and checks again when visible", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const body = deferred<unknown>(); const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response({ ...quiet, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() })); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await advance(10 * 60 * 1000); expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flushFrames();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await advance(10 * 60 * 1000); expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => body.resolve(alerts));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
  });
  it("reports known alerts with incomplete coverage without suggesting an all-clear", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, ok: false })));
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Urgent; 2 alerts reported; some sources unavailable");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Urgent");
  });
  it.each([
    ["Advisory", { ...alerts, tone: "caution", level: "Advisory", count: 3, ok: false }, "; 3 alerts reported; some sources unavailable"],
    ["Urgent", { ...alerts, ok: false }, "; 2 alerts reported; some sources unavailable"],
    ["Clear", quiet, "; no active alerts"],
    ["Unknown", { ...quiet, ok: false, level: "Unknown" }, "; current alerts are unverified"],
  ])("uses the same %s meaning in the visible pill and accessible name", async (level, payload, details) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    const indicator = container.querySelector("[data-pulse-indicator]");
    expect(indicator?.getAttribute("aria-label")).toBe(`County status: ${level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unable to verify" : level}${details}`);
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe(level === "Unknown" ? "Unverified" : level);
    expect(container.querySelector("[data-pulse-desktop-state]")?.textContent).toBe(level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unable to verify" : level);
  });
  it("cancels pending work and all polling on unmount", async () => {
    const body = deferred<unknown>(); const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await act(async () => root.render(null));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => body.reject(new Error("old request")));
    await advance(10 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["old", -6 * 60 * 1000],
    ["far-future", 5 * 60 * 1000 + 1],
  ])("does not promote an %s successful cached report to all-clear", async (_label, offset) => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() + offset).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
  });
  it("expires a still-displayed quiet snapshot at its age boundary without another provider request", async () => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(response(payload)); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
    await advance(1);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps an expired positive snapshot labeled earlier rather than current", async () => {
    const payload = { ...alerts, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    await advance(1);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Earlier report had 2 alerts; current alerts are unverified");
  });

  it.each([quiet, alerts])("expires an accepted source deadline before the next scheduled poll", async (sample) => {
    const payload = { ...sample, validUntil: new Date(Date.now() + 10_000).toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(response(payload)); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
    await advance(9_999);
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
    await advance(1);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Unable to verify");
    if (sample.active) expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Earlier report had 2 alerts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing bounded future clock tolerance", async () => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
  });

  it("keeps mobile checking visible after failure until a valid recovery clears it", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
    await advance(5 * 60 * 1000);
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("inline-flex");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Checking");
    await act(async () => body.resolve({ ...quiet, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
    expect(container.querySelector("a")?.className.split(/\s+/)).toContain("hidden");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Clear");
  });

});
