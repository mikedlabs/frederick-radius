// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StopArrivalsSnapshot } from "./useStopArrivals";
vi.mock("@/components/map/mapContent", () => ({ formatMapTimestamp: (value: number | null) => value == null ? null : "original provider time" }));
import StopArrivalsPopup from "./StopArrivalsPopup";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const STOP = { id: "s1", name: "Selected stop", lat: 39.4, lng: -77.4 };
let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
function shared(overrides: Partial<StopArrivalsSnapshot> = {}): StopArrivalsSnapshot {
  return { status: "live", providerUpdatedAt: NOW, checkedAt: NOW,
    predictions: [{ stopId: "s1", routeId: "6154", arrivalEpoch: NOW / 1000 + 300, headsign: "Frederick destination", timestamp: NOW / 1000 }], ...overrides };
}
async function render(snapshot?: StopArrivalsSnapshot, nowMs = NOW) {
  await act(async () => { root.render(createElement(StopArrivalsPopup, {
    stop: STOP, ...(snapshot ? { existingSnapshot: { snapshot, nowMs } } : {}),
  })); });
  return host.textContent || "";
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ predictions: shared().predictions, available: true, status: "ok", feedTimestamp: NOW / 1000 })));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("StopArrivalsPopup existing selected-stop snapshot", () => {
  it("renders current existing predictions with zero duplicate requests or timers", async () => {
    const text = await render(shared());
    expect(text).toContain("Live arrivals"); expect(text).toContain("to Frederick destination"); expect(text).toContain("5 min");
    expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("tracks loading, delayed and unavailable states without using a prior live label", async () => {
    expect(await render(shared({ status: "loading", predictions: [], providerUpdatedAt: null }))).toContain("Checking for inbound buses");
    let text = await render(shared({ status: "stale" }));
    expect(text).toContain("The live arrival feed is delayed."); expect(text).not.toContain("5 min");
    text = await render(shared({ status: "unavailable", predictions: [], providerUpdatedAt: null }));
    expect(text).toContain("Live arrivals are unavailable."); expect(text).not.toContain("No live arrival is reporting");
    expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not renew an expired provider observation from the existing clock", async () => {
    const text = await render(shared(), NOW + 120_000);
    expect(text).toContain("The live arrival feed is delayed."); expect(text).not.toContain("5 min");
    expect(text).toContain("original provider time"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps the healthy empty state distinct and filters another stop's rows", async () => {
    const text = await render(shared({ predictions: [{ ...shared().predictions[0], stopId: "another-stop" }] }));
    expect(text).toContain("No live arrival is reporting for this stop right now.");
    expect(text).not.toContain("Frederick destination"); expect(text).not.toContain("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { tripScheduleRelationship: "CANCELED" as const },
    { tripScheduleRelationship: "DELETED" as const },
    { scheduleRelationship: "SKIPPED" as const },
    { scheduleRelationship: "NO_DATA" as const },
  ])("excludes unusable inbound candidates instead of labelling them delayed (%j)", async (relationship) => {
    const withdrawn = { ...shared().predictions[0], ...relationship, headsign: "Withdrawn destination", arrivalEpoch: NOW / 1000 + 60 };
    const valid = { ...shared().predictions[0], headsign: "Valid later bus", arrivalEpoch: NOW / 1000 + 420 };
    let text = await render(shared({ predictions: [withdrawn, valid] }));
    expect(text).toContain("to Valid later bus"); expect(text).toContain("7 min");
    expect(text).not.toContain("Withdrawn destination"); expect(text).not.toContain("Estimate delayed");
    text = await render(shared({ predictions: [withdrawn] }));
    expect(text).toContain("No live arrival is reporting for this stop right now.");
    expect(text).not.toContain("Live arrivals are unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("also excludes a standalone NO_DATA estimate while retaining its raw provider result", async () => {
    const predictions = [{ ...shared().predictions[0], scheduleRelationship: "NO_DATA" }];
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ predictions, available: true, status: "ok", feedTimestamp: NOW / 1000 })));
    const text = await render();
    expect(text).toContain("No live arrival is reporting for this stop right now.");
    expect(text).not.toContain("5 min"); expect(text).not.toContain("Frederick destination");
    expect(predictions[0].scheduleRelationship).toBe("NO_DATA"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retains standalone map polling and cleanup when no shared snapshot is supplied", async () => {
    let text = await render(); expect(text).toContain("Live arrivals"); expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await render(shared());
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    text = await render(); expect(text).toContain("Live arrivals"); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
