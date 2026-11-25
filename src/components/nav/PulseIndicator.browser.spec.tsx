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
import PulseIndicator, { PULSE_STATUS_STORAGE_KEY, PULSE_STATUS_TIMEOUT_MS } from "./PulseIndicator";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const quiet = { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: "2026-10-07T03:00:00.000Z", validUntil: "2026-10-07T03:06:00.000Z" };
const alerts = { ...quiet, active: true, count: 2, tone: "alert", level: "Urgent" };
function response(payload: unknown): Response { return { ok: true, json: async () => payload } as Response; }
/** A report assembled now that stays valid for the given time. */
function fresh<T extends object>(sample: T, validForMs = 360_000) { return { ...sample, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + validForMs).toISOString() }; }
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
  const pill = () => container.querySelector("[data-pulse-indicator]");
  const label = () => pill()?.getAttribute("aria-label");
  const phase = () => pill()?.getAttribute("data-pulse-state");
  const mobile = () => container.querySelector("[data-pulse-mobile-state]")?.textContent;
  const setVisibility = async (value: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T03:00:00.000Z"));
    window.sessionStorage.clear();
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
    expect(container.querySelector("a")?.getAttribute("data-pulse-mobile-visible")).toBe("true");
  });
  it("keeps a valid report during a delayed refresh, bounds the body and ignores its late outcome, then clears stale on valid recovery", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(alerts)).mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response({ ...quiet, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
    vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await advance(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(label()).toBe("County status: Urgent; 2 alerts reported");
    expect(phase()).toBe("ready");
    await advance(PULSE_STATUS_TIMEOUT_MS);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await act(async () => body.resolve(quiet));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("unverified");
    await advance(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Clear in checked feeds");
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
  });
  it("consumes a late body rejection after its deadline", async () => {
    const body = deferred<unknown>(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
    await mountPulse();
    await advance(PULSE_STATUS_TIMEOUT_MS);
    await act(async () => body.reject(new Error("late body failure")));
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
  });
  it("bounds ignored header abort and schedules one retry a minute later instead of overlapping polls", async () => {
    const transport = deferred<Response>(); const fetchMock = vi.fn().mockReturnValue(transport.promise); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    await advance(PULSE_STATUS_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await advance(60_000 - 1);
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
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe(level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unverified" : level);
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
  it("expires a still-displayed quiet snapshot at its age boundary and reads again only after the minimum gap", async () => {
    const payload = { ...quiet, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(response(payload)); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Clear in checked feeds; no active alerts");
    await advance(1);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("County status: Unable to verify; current alerts are unverified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(10_000 - 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second answer is the same report, now past its deadline.
    expect(label()).toBe("County status: Unable to verify; current alerts are unverified");
  });
  it("keeps an expired positive snapshot labeled earlier rather than current", async () => {
    const payload = { ...alerts, lastUpdated: new Date(Date.now() - 6 * 60 * 1000 + 1).toISOString() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    await mountPulse();
    await advance(1);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("Earlier report had 2 alerts; current alerts are unverified");
  });

  it.each([quiet, alerts])("drops the level when a short source deadline passes before the next read is due", async (sample) => {
    const payload = { ...sample, validUntil: new Date(Date.now() + 5_000).toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(response(payload)); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("a")?.getAttribute("data-pulse-state")).toBe("ready");
    await advance(4_999);
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

  it("keeps mobile status present through failure, checking and a qualified quiet recovery", async () => {
    const body = deferred<unknown>();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
    await mountPulse();
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
    await advance(60_000);
    expect(container.querySelector("a")?.getAttribute("data-pulse-mobile-visible")).toBe("true");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Checking");
    await act(async () => body.resolve({ ...quiet, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
    expect(container.querySelector("a")?.getAttribute("data-pulse-mobile-visible")).toBe("true");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Clear in checked feeds");
  });

  describe("refreshing a report that is still valid", () => {
    it("starts no second read on the ordinary first pageshow", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => response(fresh(alerts))); vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      expect(phase()).toBe("ready");
      await act(async () => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
      await flushFrames();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
    });
    it("reads once shortly before the report expires and keeps the level on screen", async () => {
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh(alerts, 120_000))).mockResolvedValueOnce({ ok: true, json: () => body.promise });
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      // The read starts one request timeout before the two-minute deadline.
      await advance(120_000 - PULSE_STATUS_TIMEOUT_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("ready");
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
      expect(mobile()).toBe("Urgent");
      await act(async () => body.resolve(fresh({ ...alerts, count: 3 })));
      expect(phase()).toBe("ready");
      expect(label()).toBe("County status: Urgent; 3 alerts reported");
      // The old deadline passes without another read or a lost level.
      await advance(PULSE_STATUS_TIMEOUT_MS + 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(label()).toBe("County status: Urgent; 3 alerts reported");
    });
    it.each([
      ["a rejected read", () => Promise.reject(new Error("offline"))],
      ["an invalid report", async () => response({ ...alerts, level: "Advisory" })],
      ["an error response", async () => ({ ok: false, json: async () => alerts }) as Response],
    ])("falls to unable to verify when the refresh ends in %s, even inside the earlier window", async (_label, second) => {
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh(alerts, 120_000))).mockImplementationOnce(second);
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      expect(window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY)).not.toBeNull();
      await advance(120_000 - PULSE_STATUS_TIMEOUT_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("unavailable");
      expect(label()).toBe("County status: Unable to verify. Current check unavailable. Earlier report had 2 alerts; current alerts are unverified.");
      expect(mobile()).toBe("Unverified");
      // A reload must not paint the contradicted report as current.
      expect(window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY)).toBeNull();
      // The earlier deadline changes nothing further.
      await advance(PULSE_STATUS_TIMEOUT_MS + 1);
      expect(phase()).toBe("unavailable");
    });
    it("stops showing the level at the deadline while a slow refresh is still pending", async () => {
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh(alerts, 20_000))).mockResolvedValueOnce({ ok: true, json: () => body.promise });
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      // A 20 second report is read again at the 10 second minimum gap, and
      // that read has not reached its own 15 second timeout at the deadline.
      await advance(10_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await advance(9_999);
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
      await advance(1);
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: Checking. Checking again. Earlier report had 2 alerts; current alerts are unverified.");
      expect(mobile()).toBe("Checking");
      await act(async () => body.resolve(fresh(quiet)));
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
    });
    it("does not answer short-lived reports with back-to-back reads", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => response(fresh(alerts, 1_000))); vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await advance(1_000);
      expect(phase()).toBe("unavailable");
      await advance(8_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("ready");
    });
    it("aborts the refresh when the tab hides and returns to the still-valid report when it shows again", async () => {
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockResolvedValueOnce(response(alerts)).mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockImplementationOnce(async () => response(fresh(quiet)));
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await advance(5 * 60 * 1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("ready");
      await setVisibility("hidden");
      expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
      expect(phase()).toBe("unavailable");
      await advance(30_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Half a minute of the six-minute window is left.
      await setVisibility("visible");
      expect(phase()).toBe("ready");
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
      await flushFrames();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
      await act(async () => body.resolve(alerts));
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
    });
    it("does not bring a report back after the tab was hidden past its deadline", async () => {
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockResolvedValueOnce(response(alerts)).mockResolvedValueOnce({ ok: true, json: () => body.promise });
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await setVisibility("hidden");
      await advance(6 * 60 * 1000);
      await setVisibility("visible");
      expect(phase()).toBe("unavailable");
      await flushFrames();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: Checking. Checking again. Earlier report had 2 alerts; current alerts are unverified.");
    });
  });

  describe("read timing and backoff", () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    /** Run the clock in one second steps, letting each queued read start. */
    const run = async (seconds: number, each: () => void = () => {}) => {
      for (let s = 0; s < seconds; s++) { await advance(1_000); each(); }
    };
    /** A fetch stub that records when each read starts, in seconds. */
    const recorded = (answer: (now: number) => unknown) => {
      const start = Date.now(); const reads: number[] = [];
      const fetchMock = vi.fn().mockImplementation(async () => { reads.push((Date.now() - start) / 1000); return response(answer(Date.now())); });
      vi.stubGlobal("fetch", fetchMock);
      return { start, reads, fetchMock };
    };
    it("reads at the deadline when the server holds its report, then stops reading early", async () => {
      // The server keeps one validUntil until it passes, as production does.
      let windowStart = Date.now(); const WINDOW = 150_000;
      const { reads } = recorded((now) => {
        while (now >= windowStart + WINDOW) windowStart += WINDOW;
        return { ...alerts, lastUpdated: iso(windowStart), validUntil: iso(windowStart + WINDOW) };
      });
      await mountPulse();
      const phases = new Set<string | null | undefined>();
      await run(460, () => phases.add(phase()));
      // One early read finds the same deadline. After that, one read per window.
      expect(reads).toEqual([0, 135, 150, 300, 450]);
      expect([...phases]).toEqual(["ready"]);
    });
    it("backs off when a device clock running ahead leaves every report with little time", async () => {
      // The device is 150 seconds ahead and the server issues 170 second windows.
      const { reads } = recorded((now) => ({ ...alerts, lastUpdated: iso(now - 150_000), validUntil: iso(now - 150_000 + 170_000) }));
      await mountPulse();
      await run(600);
      expect(reads).toEqual([0, 10, 30, 70, 150, 310]);
    });
    it("backs off when the server keeps issuing very short windows", async () => {
      const { reads } = recorded((now) => ({ ...quiet, lastUpdated: iso(now), validUntil: iso(now + 8_000) }));
      await mountPulse();
      await run(300);
      expect(reads).toEqual([0, 10, 30, 70, 150]);
    });
    it("backs off an already expired report as a hurried read", async () => {
      const { reads } = recorded((now) => ({ ...alerts, lastUpdated: iso(now - 60_000), validUntil: iso(now - 1) }));
      await mountPulse();
      expect(phase()).toBe("unavailable");
      await run(160, () => expect(phase()).not.toBe("ready"));
      expect(reads).toEqual([0, 10, 30, 70, 150]);
    });
    it("reads a report with incomplete coverage again within half a minute, and backs off if it stays incomplete", async () => {
      const { reads } = recorded((now) => ({ ...alerts, ok: false, lastUpdated: iso(now), validUntil: iso(now + 360_000) }));
      await mountPulse();
      expect(label()).toBe("County status: Urgent; 2 alerts reported; some sources unavailable");
      await run(600);
      expect(reads).toEqual([0, 30, 60, 100, 180, 340]);
    });
    it("rechecks soon after a report with incomplete coverage and shows the complete one", async () => {
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh({ ...alerts, ok: false }))).mockImplementationOnce(async () => response(fresh(alerts)));
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await run(29);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await run(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
    });
    it("retries a failed read after a minute, then backs off, and shows no level until a read succeeds", async () => {
      const start = Date.now(); const reads: number[] = [];
      const fetchMock = vi.fn().mockImplementation(async () => {
        reads.push((Date.now() - start) / 1000);
        if (reads.length === 1) return response(fresh(alerts));
        if (reads.length <= 4) throw new Error("offline");
        return response(fresh(quiet));
      });
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await run(300);
      expect(phase()).toBe("unavailable");
      await run(419, () => expect(phase()).toBe("unavailable"));
      await run(1);
      expect(reads).toEqual([0, 300, 360, 480, 720]);
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
    });
    it("drops an expired level within half a minute when timers paused while the tab stayed visible", async () => {
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh(quiet, 170_000))).mockResolvedValueOnce({ ok: true, json: () => body.promise });
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
      // A system sleep: the wall clock moves 30 minutes and no timer runs.
      vi.setSystemTime(new Date(Date.now() + 30 * 60_000));
      await advance(29_000);
      expect(phase()).toBe("ready");
      await advance(1_000);
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: checking");
      // The read that was due during the sleep starts now.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("a failed or departed check stays failed", () => {
    const failedRefresh = async () => {
      const fetchMock = vi.fn().mockImplementationOnce(async () => response(fresh(quiet, 120_000))).mockRejectedValueOnce(new Error("offline")).mockReturnValue(new Promise(() => {}));
      vi.stubGlobal("fetch", fetchMock);
      await mountPulse();
      await advance(120_000 - PULSE_STATUS_TIMEOUT_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(phase()).toBe("unavailable");
      return fetchMock;
    };
    it("does not repaint a report a failed check contradicted when the tab returns inside its window", async () => {
      await failedRefresh();
      await setVisibility("hidden");
      await setVisibility("visible");
      expect(phase()).not.toBe("ready");
      await flushFrames();
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: checking");
    });
    it("does not repaint a report a failed check contradicted after a back-forward cache restore", async () => {
      await failedRefresh();
      await act(async () => window.dispatchEvent(new Event("pagehide")));
      await act(async () => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      expect(phase()).not.toBe("ready");
      expect(label()).toBe("County status: Unable to verify; current alerts are unverified");
    });
    it("drops the level on pagehide", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(fresh(alerts))));
      await mountPulse();
      expect(phase()).toBe("ready");
      await act(async () => window.dispatchEvent(new Event("pagehide")));
      expect(phase()).toBe("unavailable");
      expect(label()).toBe("County status: Unable to verify. Current check unavailable. Earlier report had 2 alerts; current alerts are unverified.");
    });
    it("leaves no timer running while the tab is hidden", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(fresh(alerts))));
      await mountPulse();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await setVisibility("hidden");
      await advance(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("last known report in this tab", () => {
    it("uses the app's colon form for its storage key", () => {
      expect(PULSE_STATUS_STORAGE_KEY).toBe("fr:pulse:status:v1");
    });
    it("stores only the fields the pill reads after an accepted report", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...alerts, checks: [{ source: "FCPS", state: "current", asOf: alerts.lastUpdated, asOfBasis: "retrieval" }] })));
      await mountPulse();
      expect(JSON.parse(window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY) ?? "null")).toEqual(alerts);
    });
    it("paints a valid stored report before the first read returns", async () => {
      window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, JSON.stringify(alerts));
      const body = deferred<unknown>();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }); vi.stubGlobal("fetch", fetchMock);
      await act(async () => root.render(createElement(PulseIndicator)));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(phase()).toBe("ready");
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
      expect(mobile()).toBe("Urgent");
      await flushFrames();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(phase()).toBe("ready");
      await act(async () => body.resolve(fresh(quiet)));
      expect(label()).toBe("County status: Clear in checked feeds; no active alerts");
      expect(JSON.parse(window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY) ?? "null").level).toBe("Clear");
    });
    it("drops a stored report at its deadline when the first read is slow", async () => {
      window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, JSON.stringify({ ...alerts, validUntil: new Date(Date.now() + 5_000).toISOString() }));
      const body = deferred<unknown>();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
      await mountPulse();
      await advance(4_999);
      expect(label()).toBe("County status: Urgent; 2 alerts reported");
      await advance(1);
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: Checking. Checking again. Earlier report had 2 alerts; current alerts are unverified.");
      await advance(PULSE_STATUS_TIMEOUT_MS - 5_000);
      expect(phase()).toBe("unavailable");
    });
    it("replaces a valid stored report with unable to verify when the first read fails", async () => {
      window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, JSON.stringify(alerts));
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      await mountPulse();
      expect(phase()).toBe("unavailable");
      expect(label()).toBe("County status: Unable to verify. Current check unavailable. Earlier report had 2 alerts; current alerts are unverified.");
      expect(window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY)).toBeNull();
    });
    it.each([
      ["past its source deadline", JSON.stringify({ ...alerts, validUntil: alerts.lastUpdated })],
      ["older than the maximum report age", JSON.stringify({ ...alerts, lastUpdated: "2026-10-07T02:54:00.000Z" })],
      ["dated beyond the clock tolerance", JSON.stringify({ ...alerts, lastUpdated: "2026-10-07T03:05:00.001Z" })],
      ["without a deadline", JSON.stringify({ ...alerts, validUntil: undefined })],
      ["with a contradictory level", JSON.stringify({ ...alerts, level: "Clear" })],
      ["that is not JSON", "{"],
    ])("ignores a stored report %s", async (_label, stored) => {
      window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, stored);
      const body = deferred<unknown>();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
      await mountPulse();
      expect(phase()).toBe("checking");
      expect(label()).toBe("County status: checking");
      expect(mobile()).toBe("Checking");
    });
    it("works the same when storage is blocked", async () => {
      const blocked = () => { throw new DOMException("Storage is blocked", "SecurityError"); };
      const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
      const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
      const removals = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
      try {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(alerts)).mockRejectedValueOnce(new Error("offline")));
        await mountPulse();
        expect(reads).toHaveBeenCalledWith(PULSE_STATUS_STORAGE_KEY);
        expect(writes).toHaveBeenCalled();
        expect(label()).toBe("County status: Urgent; 2 alerts reported");
        await advance(5 * 60 * 1000);
        expect(removals).toHaveBeenCalledWith(PULSE_STATUS_STORAGE_KEY);
        expect(phase()).toBe("unavailable");
      } finally {
        reads.mockRestore(); writes.mockRestore(); removals.mockRestore();
      }
    });
  });
});
