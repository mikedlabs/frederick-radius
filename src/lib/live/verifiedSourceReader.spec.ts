import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerifiedSourceReader } from "./verifiedSourceReader";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(read: () => Promise<T>) => read }));
const NOW = Date.parse("2026-11-24T16:02:22Z");
type Report = { available: boolean; asOf?: string; active: number };
const unavailable: Report = { available: false, active: 0 };

function setup() {
  const load = vi.fn<() => Promise<Report>>();
  return { load, read: createVerifiedSourceReader("test", load, unavailable, (report) => report.asOf, 15 * 60_000) };
}
function report(active: number, timestamp = NOW): Report {
  return { available: true, active, asOf: new Date(timestamp).toISOString() };
}

describe("independent shared source checks", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it("coalesces a cold header and Pulse request with separate deadlines, then keeps the verified report", async () => {
    const { read, load } = setup();
    load.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(report(1)), 2_400)));
    const header = read(1_700);
    const detail = read(4_500);
    await vi.advanceTimersByTimeAsync(1_700);
    expect(await header).toEqual(unavailable);
    await vi.advanceTimersByTimeAsync(700);
    expect(await detail).toEqual(report(1));
    expect(load).toHaveBeenCalledTimes(1);
    load.mockResolvedValueOnce(unavailable);
    expect(await read(1_700)).toEqual(report(1));
  });

  it("returns recent evidence quickly on a stalled refresh and uses a newly confirmed empty result afterward", async () => {
    const { read, load } = setup();
    load.mockResolvedValueOnce(report(1));
    expect(await read(4_500)).toEqual(report(1));
    vi.setSystemTime(NOW + 60_000);
    const replacement = report(0, Date.now());
    load.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(replacement), 900)));
    const header = read(1_700);
    await vi.advanceTimersByTimeAsync(100);
    expect(await header).toEqual(report(1));
    await vi.advanceTimersByTimeAsync(800);
    load.mockResolvedValueOnce(unavailable);
    expect(await read(1_700)).toEqual(replacement);
  });

  it.each([0, 1])("does not carry an expired report (active count %i) through an unavailable refresh", async (active) => {
    const { read, load } = setup();
    load.mockResolvedValueOnce(report(active));
    await read(4_500);
    vi.setSystemTime(NOW + 15 * 60_000);
    load.mockResolvedValueOnce(unavailable);
    expect(await read(4_500)).toEqual(unavailable);
  });

  it("does not replace current evidence with an older response or redate it", async () => {
    const { read, load } = setup();
    load.mockResolvedValueOnce(report(1));
    await read(4_500);
    load.mockResolvedValueOnce(report(0, NOW - 60_000));
    expect(await read(4_500)).toEqual(report(1));
  });
});
