import { describe, it, expect, vi, beforeEach } from "vitest";

const trackMock = vi.fn();
vi.mock("@/lib/track", () => ({ track: (...a: unknown[]) => trackMock(...a) }));

import { markMapOnLoad, markMapIdleOnce, resetMapPerf } from "./mapPerf";

beforeEach(() => {
  trackMock.mockClear();
  resetMapPerf();
  const marks: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).performance = {
    mark: vi.fn((n: string) => marks.push(n)),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => [{ duration: 123.7 }]),
    _marks: marks,
  };
});

describe("mapPerf", () => {
  it("marks onload, then reports onload→idle exactly once", () => {
    markMapOnLoad();
    markMapIdleOnce();
    markMapIdleOnce(); // second call is a no-op
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marks = (globalThis as any).performance._marks;
    expect(marks).toContain("fr-map-onload");
    expect(marks).toContain("fr-map-idle");
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("map_ready", { ms_onload_to_idle: 124 });
  });

  it("no-ops safely when performance is unavailable", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).performance;
    expect(() => {
      markMapOnLoad();
      markMapIdleOnce();
    }).not.toThrow();
    expect(trackMock).not.toHaveBeenCalled();
  });
});
