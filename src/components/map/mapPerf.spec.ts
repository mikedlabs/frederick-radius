import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackMock = vi.fn();
vi.mock("@/lib/track", () => ({ track: (...args: unknown[]) => trackMock(...args) }));

import {
  beginMapSourceTiming,
  finishMapPerfSession,
  markMapIdleOnce,
  markMapOnLoad,
  resetMapPerf,
  startMapPerfSession,
} from "./mapPerf";

let nowMs = 0;
let marks: string[] = [];

function installPerformance(
  navigationEntries: Array<Partial<PerformanceNavigationTiming>> = [],
): void {
  marks = [];
  vi.stubGlobal("performance", {
    now: vi.fn(() => nowMs),
    mark: vi.fn((name: string) => marks.push(name)),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntriesByType: vi.fn((type: string) =>
      type === "navigation" ? navigationEntries : [],
    ),
  });
}

beforeEach(() => {
  trackMock.mockClear();
  nowMs = 0;
  installPerformance();
  resetMapPerf();
});

afterEach(() => {
  resetMapPerf();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mapPerf", () => {
  it("reports session-to-load, load-to-idle, and session-to-idle exactly once", () => {
    startMapPerfSession({ sampleRate: 0, navigationStartMs: null });
    nowMs = 80;
    markMapOnLoad();
    nowMs = 204;
    markMapIdleOnce();
    markMapIdleOnce();

    expect(marks).toEqual([
      "fr-map-session-start",
      "fr-map-onload",
      "fr-map-idle",
    ]);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("map_ready", {
      ms_session_to_load: 80,
      ms_onload_to_idle: 124,
      ms_session_to_idle: 204,
    });
  });

  it("adds document-navigation timing only when the navigation entry belongs to this path", () => {
    installPerformance([
      {
        entryType: "navigation",
        name: "https://frederickradius.app/map?scene=roads-now",
        startTime: 0,
      },
    ]);
    vi.stubGlobal("location", {
      href: "https://frederickradius.app/map?scene=roads-now",
      pathname: "/map",
    });
    nowMs = 30;
    startMapPerfSession({ sampleRate: 0 });
    nowMs = 145;
    markMapOnLoad();
    nowMs = 210;
    markMapIdleOnce();

    expect(trackMock).toHaveBeenCalledWith(
      "map_ready",
      expect.objectContaining({
        ms_navigation_to_load: 145,
        ms_navigation_to_idle: 210,
      }),
    );

    resetMapPerf();
    trackMock.mockClear();
    vi.stubGlobal("location", {
      href: "https://frederickradius.app/map",
      pathname: "/map",
    });
    installPerformance([
      {
        entryType: "navigation",
        name: "https://frederickradius.app/today",
        startTime: 0,
      },
    ]);
    nowMs = 300;
    startMapPerfSession({ sampleRate: 0 });
    nowMs = 350;
    markMapOnLoad();
    nowMs = 400;
    markMapIdleOnce();

    const props = trackMock.mock.calls[0]?.[1] as Record<string, number>;
    expect(props.ms_navigation_to_load).toBeUndefined();
  });

  it("reports sampled source timing once with bounded, low-cardinality fields", () => {
    startMapPerfSession({ sampleRate: 1, navigationStartMs: null });
    nowMs = 25;
    const finish = beginMapSourceTiming("planning");
    nowMs = 163.4;
    finish("stale", { cached: true });
    finish("ready");

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("map_source_timing", {
      source: "planning",
      outcome: "stale",
      ms: 138,
      cached: true,
    });
  });

  it("drops a late source completion after its map session is gone", () => {
    const cleanup = startMapPerfSession({ sampleRate: 1, navigationStartMs: null });
    const finish = beginMapSourceTiming("roads");
    cleanup();
    trackMock.mockClear(); // Ignore the sampled runtime summary from cleanup.
    nowMs = 500;
    finish("ready");

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("aggregates sampled frame gaps and long tasks, then disconnects on finish", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let nextRafId = 0;
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    const cancelAnimationFrameMock = vi.fn((id: number) => rafCallbacks.delete(id));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      nextRafId += 1;
      rafCallbacks.set(nextRafId, callback);
      return nextRafId;
    }));
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);

    let observerCallback: PerformanceObserverCallback = () => {};
    const disconnect = vi.fn();
    class ObserverMock {
      constructor(callback: PerformanceObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", ObserverMock);

    startMapPerfSession({
      sampleRate: 1,
      navigationStartMs: null,
      runtimeWindowMs: 5_000,
    });

    const runNextFrame = (timestamp: number) => {
      const [id, callback] = [...rafCallbacks.entries()][0];
      rafCallbacks.delete(id);
      callback(timestamp);
    };
    runNextFrame(100);
    runNextFrame(220); // 120 ms visible frame gap

    const entries = [{ duration: 74 }] as PerformanceEntry[];
    observerCallback(
      { getEntries: () => entries } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    nowMs = 1_250;
    finishMapPerfSession();

    expect(trackMock).toHaveBeenCalledWith("map_runtime_quality", {
      observed_ms: 1250,
      frame_gap_count: 1,
      frame_gap_total_ms: 120,
      max_frame_gap_ms: 120,
      long_task_count: 1,
      long_task_total_ms: 74,
      max_long_task_ms: 74,
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrameMock).toHaveBeenCalled();
  });

  it("reset cancels sampled observers without reporting a partial window", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cancelAnimationFrameMock = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 7));
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
    const disconnect = vi.fn();
    class ObserverMock {
      constructor(callback: PerformanceObserverCallback) {
        void callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", ObserverMock);

    startMapPerfSession({ sampleRate: 1, navigationStartMs: null });
    nowMs = 2_000;
    resetMapPerf();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(7);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("no-ops safely when performance is unavailable", () => {
    vi.stubGlobal("performance", undefined);
    expect(() => {
      const cleanup = startMapPerfSession();
      markMapOnLoad();
      markMapIdleOnce();
      beginMapSourceTiming("weather")("error");
      cleanup();
    }).not.toThrow();
    expect(trackMock).not.toHaveBeenCalled();
  });
});
