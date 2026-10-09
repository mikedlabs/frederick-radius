// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveIncidentSnapshot } from "@/lib/live/incidentSnapshot";
vi.mock("react-map-gl/mapbox", () => ({ Marker: ({ children }: { children: ReactNode }) => children, Popup: ({ children }: { children: ReactNode }) => children }));
vi.mock("./liveLayerGate", () => ({ useLiveLayerGate: () => {} }));
import LiveIncidents from "./LiveIncidents";

const NOW = "2026-10-09T16:00:00.000Z";
let root: Root;
let host: HTMLDivElement;
const health = vi.fn();
function snapshot(at: string): LiveIncidentSnapshot {
  return { items: [{ id: "earlier-crash", kind: "Crash", lastReportedAt: at, firstReportedAt: at, status: "preliminary", coordinate: { lat: 39.4, lng: -77.4, precision: "block", source: "frederick-scanner" }, location: "US 15", sources: [], reasons: [], updates: 1, roadImpact: true, scannerClockTime: "2:30 PM" }], totalCount: 1, reportedCount: 1, notShownCount: 0, corroboratedCount: 0, scannerAvailable: true, chartAvailable: true, scannerCheckedAt: NOW, updatedAt: NOW };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); health.mockReset();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function openReport() {
  const marker = host.querySelector<HTMLButtonElement>(".fr-incident-marker")!;
  await act(async () => marker.click());
  return marker;
}
describe("Map public report occurrence versus source check", () => {
  it("keeps a 90-minute report as earlier history while the successful source check stays current", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot("2026-10-09T14:30:00.000Z") }));
    await act(async () => root.render(createElement(LiveIncidents, { show: true, onHealth: health })));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, earlierCount: 1, timestamp: NOW, status: "empty" }));
    const marker = await openReport();
    expect(marker.dataset.stale).toBe("true");
    expect(host.textContent).not.toContain("Active");
  });
  it("moves a report into earlier history as the mounted clock crosses one hour without fetching again", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot("2026-10-09T15:00:01.000Z") });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(LiveIncidents, { show: true, onHealth: health })));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, earlierCount: 1 }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains the last reports as unverified history when the API answers with an unavailable source", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => snapshot("2026-10-09T15:30:00.000Z") }).mockResolvedValue({ ok: true, json: async () => ({ items: [], scannerAvailable: false, updatedAt: "2026-10-09T16:01:00.000Z" }) });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(LiveIncidents, { show: true, onHealth: health })));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1, earlierCount: 0 }));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, earlierCount: 1, status: "stale", timestamp: NOW }));
  });
  it.each(["failed poll", "unavailable source"] as const)("immediately changes the selected report and marker to earlier after a %s", async (failure) => {
    const current = snapshot("2026-10-09T15:30:00.000Z");
    current.items[0].updates = 2;
    let resolvePoll!: (response: unknown) => void;
    const pendingPoll = new Promise((resolve) => { resolvePoll = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => current }).mockReturnValueOnce(pendingPoll);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(LiveIncidents, { show: true, onHealth: health })));
    const marker = await openReport();
    expect(marker.dataset.stale).toBeUndefined();
    expect(host.textContent).toContain("Active · 2 updates");
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(host.textContent).toContain("Active · 2 updates");
    // Resolve after the clock tick: failure itself must update rendered state.
    await act(async () => resolvePoll(failure === "failed poll" ? { ok: false } : { ok: true, json: async () => ({ scannerAvailable: false, items: [] }) }));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, earlierCount: 1, status: "stale" }));
    expect(marker.dataset.stale).toBe("true");
    expect(marker.getAttribute("aria-label")).toContain("earlier report");
    expect(host.textContent).not.toContain("Active");
    expect(host.textContent).toContain("Earlier report; current activity is unverified.");
  });
  it("changes a still-recent report and selected popup to earlier when the source check expires", async () => {
    const current = snapshot("2026-10-09T15:30:00.000Z");
    current.items[0].updates = 2;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => current });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(LiveIncidents, { show: true, onHealth: health })));
    const marker = await openReport();
    await act(async () => vi.advanceTimersByTimeAsync(180_000));
    expect(host.textContent).toContain("Active · 2 updates");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(health).toHaveBeenLastCalledWith(expect.objectContaining({ count: 0, earlierCount: 1, status: "stale" }));
    expect(marker.dataset.stale).toBe("true");
    expect(host.textContent).not.toContain("Active");
    expect(host.textContent).toContain("Earlier report; current activity is unverified.");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
