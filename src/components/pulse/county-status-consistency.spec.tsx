// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurrentSituationSnapshot, sourceEnvelope, type CurrentSituationSources } from "@/lib/live/currentSituationModel";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import type { OfficialCivicAlertsResult } from "@/lib/integrations/official-alert-feeds";
import { deriveCountyStatus } from "@/lib/pulse/county-status-model";
import { COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS } from "@/lib/pulse/county-status";

const mocks = vi.hoisted(() => ({ situation: vi.fn(), road: vi.fn(), civic: vi.fn() }));
vi.mock("@/lib/live/currentSituation", () => ({ getCurrentSituationSnapshot: mocks.situation }));
vi.mock("@/lib/live/roadIntelligence", () => ({ getRoadIntelligenceSnapshot: mocks.road }));
vi.mock("@/lib/live/officialSignals", () => ({ getOfficialCivicAlertsSnapshot: mocks.civic }));
vi.mock("next/navigation", () => ({ usePathname: () => "/pulse", useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/nav/AppTransitionLink", () => ({ default: (props: Record<string, unknown>) => {
  const { prefetch: _prefetch, ...anchor } = props;
  void _prefetch;
  return createElement("a", anchor);
} }));
vi.mock("@/components/ui/Sheet", () => ({ default: () => null }));
import { GET } from "@/app/api/pulse/status/route";
import PulseIndicator from "@/components/nav/PulseIndicator";
import PulseBoard from "./PulseBoard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = "2026-10-08T13:00:00.000Z";
function sources(alerts: NwsAlert[], partial: boolean): CurrentSituationSources {
  const envelope = <T,>(source: Parameters<typeof sourceEnvelope<T>>[0]["source"], data: T, available = true) => sourceEnvelope({ source, data, availability: available ? "available" : "unavailable", requiredForQuiet: true, capturedAt: NOW, asOf: NOW, asOfBasis: "retrieval", staleAfterSeconds: 600 });
  return {
    weather: envelope("nws", alerts), schools: envelope("fcps", [], !partial),
    traffic: envelope("mdot-chart", []), scanner: envelope("frederick-scanner", []),
    power: envelope("firstenergy", { total_out: 0, total_served: 100_000, munis: [] }),
    fireRescue: envelope("pulsepoint", []), air: envelope("airnow", []),
  };
}
function alert(event: string): NwsAlert {
  return { event, headline: event, description: "Published sample alert.", severity: event.includes("Warning") ? "Severe" : "Moderate", ends_at: "2026-10-08T18:00:00.000Z" } as NwsAlert;
}
const road = {
  generatedAt: NOW,
  sources: Object.fromEntries(["workZones", "speeds", "travelTimes", "messages", "weatherStations", "roadConditions", "snowEmergency"].map((key) => [key, { available: true, data: [], asOf: NOW, checkedAt: NOW }])),
  summary: { activeCount: 0, coverage: "complete" }, attention: [],
} as unknown as RoadIntelligenceSnapshot;
const civic = { alerts: [], available: true, degraded: false } as unknown as OfficialCivicAlertsResult;

describe("County status API, visible pill and Pulse masthead", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it.each([
    ["Advisory", [alert("Wind Advisory"), alert("Heat Advisory"), alert("Air Quality Alert")], true, false, 0],
    ["Urgent", [alert("Flash Flood Warning")], true, false, 0],
    ["Clear", [], false, false, 0],
    ["Unknown", [], true, false, 0],
    ["Unknown", [], false, true, 0],
    ["Unknown", [], false, false, COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS],
    ["Unknown", [alert("Flash Flood Warning")], false, false, COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS],
  ] as const)("keeps %s consistent for the actual shared projection and rendered callers", async (level, alerts, partial, roadFailure, elapsed) => {
    const situation = buildCurrentSituationSnapshot({ sources: sources([...alerts], partial), roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] }, now: NOW });
    mocks.situation.mockResolvedValue(situation);
    if (roadFailure) mocks.road.mockRejectedValue(new Error("Shared road check unavailable"));
    else mocks.road.mockResolvedValue(road);
    mocks.civic.mockResolvedValue(civic);
    const response = await GET();
    const payload = await response.json();
    // Pulse passes the same three already-loaded snapshots to this projection.
    const pageSummary = deriveCountyStatus(situation, roadFailure ? null : road, civic);
    expect(payload).toEqual(pageSummary);
    expect(mocks.situation).toHaveBeenCalledTimes(1);
    expect(mocks.road).toHaveBeenCalledTimes(1);
    expect(mocks.civic).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.parse(NOW) + elapsed);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await act(async () => root.render(createElement(PulseIndicator)));
    const board = document.createElement("div");
    board.innerHTML = renderToStaticMarkup(createElement(PulseBoard, {
      hero: { countyStatus: pageSummary, allClear: false, degraded: true, tone: "danger", line: "Pulse detail keeps its own source and context.", sub: "This example does not establish the state of other feeds.", renderedAt: Date.now() },
      chips: [], tiles: [],
    }));
    const expected = level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unable to verify" : level;
    expect(board.querySelector("[data-pulse-status-level]")?.textContent).toBe(expected);
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe(level === "Unknown" ? "Unverified" : level);
    expect(container.querySelector("[data-pulse-desktop-state]")?.textContent).toBe(expected);
    expect(container.querySelector("a")?.getAttribute("aria-label")).toMatch(new RegExp(`^County status: ${expected}(?:;|\\.)`));
    expect(board.textContent).toContain("Other conditions keep their own source checks below.");
    if (level === "Advisory") expect(container.querySelector("a")?.getAttribute("aria-label")).toContain("3 alerts reported; some sources unavailable");
    if (level === "Unknown") expect(container.querySelector("a")?.getAttribute("aria-label")).not.toContain("Clear");
  });
  it("expires the actual mounted pill and masthead together at the shared snapshot boundary", async () => {
    const situation = buildCurrentSituationSnapshot({ sources: sources([], false), roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] }, now: NOW });
    const summary = deriveCountyStatus(situation, road, civic);
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(summary));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement("div", null,
      createElement(PulseIndicator),
      createElement(PulseBoard, { hero: { countyStatus: summary, allClear: true, line: "No issue is reported in these sample checks.", sub: "Other sources keep their own details.", renderedAt: Date.now() }, chips: [], tiles: [] }),
    )));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Clear in checked feeds");
    await act(async () => vi.advanceTimersByTimeAsync(COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS - 1));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Clear in checked feeds");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Unable to verify");
    expect(container.querySelector("[data-pulse-mobile-state]")?.textContent).toBe("Unverified");
    expect(fetchMock).toHaveBeenCalledTimes(2); // Existing five-minute poll only.
  });

  it("never reuses an old render clock to call newly supplied stale cache data Clear", async () => {
    const situation = buildCurrentSituationSnapshot({ sources: sources([], false), roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] }, now: NOW });
    const summary = deriveCountyStatus(situation, road, civic);
    const renderBoard = (countyStatus: typeof summary) => createElement(PulseBoard, { hero: { countyStatus, allClear: true, line: "These are sample shared checks.", sub: "Keep source details attached.", renderedAt: Date.now() }, chips: [], tiles: [] });
    await act(async () => root.render(renderBoard(summary)));
    await act(async () => vi.advanceTimersByTimeAsync(20_000)); // Before the 30-second label tick.
    const stale = { ...summary, lastUpdated: new Date(Date.parse(NOW) - COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS + 10_000).toISOString() };
    await act(async () => root.render(renderBoard(stale)));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Unable to verify");
  });

  it("gives a newly supplied copy of the same cached timestamp a current clock before paint", async () => {
    const situation = buildCurrentSituationSnapshot({ sources: sources([], false), roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] }, now: NOW });
    const summary = { ...deriveCountyStatus(situation, road, civic), lastUpdated: new Date(Date.parse(NOW) - COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS + 10_000).toISOString() };
    const renderBoard = (countyStatus: typeof summary) => createElement(PulseBoard, { hero: { countyStatus, allClear: true, line: "These are sample shared checks.", sub: "Keep source details attached.", renderedAt: Date.parse(NOW) }, chips: [], tiles: [] });
    await act(async () => root.render(renderBoard(summary)));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Clear in checked feeds");
    vi.setSystemTime(Date.parse(NOW) + 20_000); // A clock change with no interval tick.
    await act(async () => root.render(renderBoard({ ...summary })));
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Unable to verify");
  });

});
