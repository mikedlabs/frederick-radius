// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { providerTimeFrom, useStopArrivals } from "./useStopArrivals";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const PREDICTIONS = [{ stopId: "s1", routeId: "6154", arrivalEpoch: NOW / 1000 + 300 }];
let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
function response(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ predictions: PREDICTIONS, available: true, status: "ok", feedTimestamp: NOW / 1000, updatedAt: NOW, ...overrides }));
}
function Probe() {
  return createElement("pre", null, JSON.stringify(useStopArrivals("s1")));
}
function current(): ReturnType<typeof useStopArrivals> {
  return JSON.parse(host.textContent || "{}");
}
async function render() {
  await act(async () => { root.render(createElement(Probe)); });
  return current();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fetchMock = vi.fn(async () => response()); vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("useStopArrivals source clock", () => {
  it.each([undefined, 0, -1, NaN, Infinity, NOW / 1000 + 91])("rejects missing or invalid provider time despite a recent Radius receipt (%s)", (feedTimestamp) => {
    expect(providerTimeFrom({ feedTimestamp, updatedAt: NOW }, NOW)).toBeNull();
  });

  it("keeps the existing bounded clock-skew allowance and original old timestamps", () => {
    expect(providerTimeFrom({ feedTimestamp: NOW / 1000 + 30 }, NOW)).toBe(NOW + 30_000);
    expect(providerTimeFrom({ feedTimestamp: NOW / 1000 - 120 }, NOW)).toBe(NOW - 120_000);
  });

  it("uses a real feed clock for live status and a separate actual receipt clock", async () => {
    fetchMock.mockResolvedValueOnce(response({ feedTimestamp: NOW / 1000 - 10, updatedAt: NOW - 5000 }));
    const { snapshot } = await render();
    expect(snapshot.status).toBe("live"); expect(snapshot.providerUpdatedAt).toBe(NOW - 10_000);
    expect(snapshot.checkedAt).toBe(NOW); expect(snapshot.predictions).toEqual(PREDICTIONS);
  });

  it("holds a healthy response without a source clock instead of calling receipt time live", async () => {
    fetchMock.mockResolvedValueOnce(response({ feedTimestamp: undefined }));
    const { snapshot } = await render();
    expect(snapshot.status).toBe("stale"); expect(snapshot.providerUpdatedAt).toBeNull();
    expect(snapshot.checkedAt).toBe(NOW); expect(snapshot.predictions).toEqual(PREDICTIONS);
  });

  it("keeps unavailable receipt metadata without inventing a provider observation", async () => {
    fetchMock.mockResolvedValueOnce(response({ predictions: [], available: false, status: "unavailable", feedTimestamp: undefined }));
    const { snapshot } = await render();
    expect(snapshot.status).toBe("unavailable"); expect(snapshot.providerUpdatedAt).toBeNull(); expect(snapshot.checkedAt).toBe(NOW);
  });

  it("ages live source data on the existing clock while refreshes remain pending", async () => {
    fetchMock.mockResolvedValueOnce(response());
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    expect((await render()).snapshot.status).toBe("live");
    await act(async () => { await vi.advanceTimersByTimeAsync(105_000); });
    expect(current().snapshot.status).toBe("stale");
    expect(current().snapshot.providerUpdatedAt).toBe(NOW); expect(current().snapshot.checkedAt).toBe(NOW);
    expect(fetchMock).toHaveBeenCalledTimes(8); // Initial read plus unchanged 15-second polls.
  });

  it("preserves a real prior provider observation when a later refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(response()); fetchMock.mockRejectedValue(new Error("Fixture refresh failed"));
    await render(); await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(current().snapshot.status).toBe("stale"); expect(current().snapshot.providerUpdatedAt).toBe(NOW);
    expect(current().snapshot.checkedAt).toBe(NOW + 15_000); expect(current().snapshot.predictions).toEqual(PREDICTIONS);
  });
});
