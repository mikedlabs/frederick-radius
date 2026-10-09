import { describe, expect, it } from "vitest";
import { buildCurrentSituationSnapshot, sourceEnvelope, type CurrentSituationSnapshot, type CurrentSituationSources } from "@/lib/live/currentSituationModel";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import type { OfficialCivicAlertsResult } from "@/lib/integrations/official-alert-feeds";
import { deriveCountyStatus } from "./county-status-model";

const NOW = "2026-10-08T13:00:00.000Z";
function situation(weatherAlerts: CurrentSituationSources["weather"]["data"] = []): CurrentSituationSnapshot {
  const envelope = <T,>(source: Parameters<typeof sourceEnvelope<T>>[0]["source"], data: T) => sourceEnvelope({
    source, data, availability: "available", requiredForQuiet: true,
    capturedAt: NOW, asOf: NOW, asOfBasis: "retrieval", staleAfterSeconds: 300,
  });
  const sources: CurrentSituationSources = {
    weather: envelope("nws", weatherAlerts),
    schools: envelope("fcps", []),
    traffic: envelope("mdot-chart", []),
    scanner: envelope("frederick-scanner", []),
    power: envelope("firstenergy", { total_out: 0, total_served: 100_000, munis: [] }),
    fireRescue: envelope("pulsepoint", []),
    air: envelope("airnow", []),
  };
  return buildCurrentSituationSnapshot({
    sources,
    roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] },
    now: NOW,
  });
}
const road = {
  generatedAt: NOW,
  sources: Object.fromEntries(["workZones", "speeds", "travelTimes", "messages", "weatherStations", "roadConditions", "snowEmergency"].map((key) => [key, { available: true, data: [], asOf: NOW, checkedAt: NOW }])),
  summary: { activeCount: 0, coverage: "complete" }, attention: [],
} as unknown as RoadIntelligenceSnapshot;
const civic = { alerts: [], available: true, degraded: false } as unknown as OfficialCivicAlertsResult;

describe("Shared county status severity and coverage", () => {
  it("does not timestamp an old road emergency as a fresh county report", () => {
    const staleRoad = { ...road, generatedAt: "2026-10-08T12:40:00.000Z", summary: { ...road.summary, activeCount: 1 }, attention: [{ kind: "snow-emergency", severity: "emergency", observedAt: "2026-10-07T13:00:00.000Z" }] } as RoadIntelligenceSnapshot;
    expect(deriveCountyStatus(situation(), staleRoad, civic)).toMatchObject({ level: "Unknown", count: 0, ok: false, roadCheck: { verified: false, earlierCount: 1 } });
  });
  it("does not re-date an old HTTP road check with a fresh assembly or declaration time", () => {
    const staleRoad = { ...road, sources: { ...road.sources, snowEmergency: { ...road.sources.snowEmergency, checkedAt: "2026-10-08T12:30:00.000Z" } }, attention: [{ kind: "snow-emergency", severity: "emergency", observedAt: "2026-10-07T13:00:00.000Z" }] } as RoadIntelligenceSnapshot;
    expect(deriveCountyStatus(situation(), staleRoad, civic)).toMatchObject({ level: "Unknown", count: 0, roadCheck: { verified: false, currentCount: 0, earlierCount: 1, checkedAt: "2026-10-08T12:30:00.000Z" } });
  });
  it("does not claim quiet from old underlying road checks despite a new assembly", () => {
    const staleRoad = { ...road, sources: { ...road.sources, workZones: { ...road.sources.workZones, asOf: "2026-10-08T12:30:00.000Z" } } };
    expect(deriveCountyStatus(situation(), staleRoad, civic)).toMatchObject({ level: "Unknown", ok: false, roadCheck: { verified: false } });
  });
  it.each([
    ["highway-message", "messages", "MDOT highway signs"],
    ["pavement-weather", "weatherStations", "MDOT road weather"],
  ] as const)("does not claim quiet while an earlier %s remains unverified", (kind, source, label) => {
    const retained = { ...road, sources: { ...road.sources, [source]: { ...road.sources[source], checkedAt: "2026-10-08T12:30:00.000Z" } }, attention: [{ kind, severity: "warning" }] } as RoadIntelligenceSnapshot;
    const result = deriveCountyStatus(situation(), retained, civic);
    expect(result).toMatchObject({ level: "Unknown", count: 0, ok: false, roadCheck: { verified: false, currentCount: 0, earlierCount: 1, unverifiedSources: [label] } });
    expect(result.checks).toContainEqual({ source: label, state: "stale", asOf: "2026-10-08T12:30:00.000Z", asOfBasis: "retrieval" });
  });
  it("does not expire an ongoing declaration merely because it began yesterday", () => {
    const declaration = { ...road, summary: { ...road.summary, activeCount: 1 }, attention: [{ kind: "snow-emergency", severity: "emergency", observedAt: "2026-10-07T13:00:00.000Z" }] } as RoadIntelligenceSnapshot;
    expect(deriveCountyStatus(situation(), declaration, civic)).toMatchObject({ level: "Urgent", count: 1, roadCheck: { verified: true, earlierCount: 0 } });
  });
  it.each(["advisory", "warning", "emergency"] as const)("uses the published %s road severity instead of treating every closure as urgent", (severity) => {
    const summary = deriveCountyStatus(situation(), { ...road, summary: { ...road.summary, activeCount: 1 }, attention: [{ kind: "snow-emergency", severity }] } as RoadIntelligenceSnapshot, civic);
    expect(summary.level).toBe(severity === "emergency" ? "Urgent" : "Advisory");
  });
  it.each(["work-zone-closure", "snow-emergency"] as const)("retains a verified %s when a different required road source fails", (kind) => {
    const failed = kind === "snow-emergency" ? "workZones" : "snowEmergency";
    const mixed = { ...road, sources: { ...road.sources, [failed]: { ...road.sources[failed], available: false } }, attention: [{ kind, severity: kind === "snow-emergency" ? "emergency" : "warning" }], summary: { activeCount: 1, coverage: "partial" } } as RoadIntelligenceSnapshot;
    expect(deriveCountyStatus(situation(), mixed, civic)).toMatchObject({ count: 1, level: kind === "snow-emergency" ? "Urgent" : "Advisory", ok: false, roadCheck: { verified: false, currentCount: 1, earlierCount: 0 } });
  });
  it.each([25, 999, 1_000])("preserves the existing outage threshold at %i customers", (total) => {
    const current = situation();
    current.summary.status = "active"; current.summary.activeCount = 1; current.summary.activeByCategory.power = 1;
    current.sources.power.data.total_out = total;
    expect(deriveCountyStatus(current, road, civic).level).toBe(total >= 1_000 ? "Urgent" : "Advisory");
  });
  it.each([3, 4])("keeps AirNow category %i at its existing Pulse severity", (category) => {
    const current = situation(); current.summary.status = "active"; current.summary.activeCount = 1;
    current.sources.air.data = [{ category: { id: category } }] as typeof current.sources.air.data;
    expect(deriveCountyStatus(current, road, civic).level).toBe(category >= 4 ? "Urgent" : "Advisory");
  });
  it("does not let old or unavailable source rows increase urgency", () => {
    const current = situation(); current.summary.status = "active"; current.summary.activeCount = 1;
    current.sources.weather.data = [{ event: "Flash Flood Warning", headline: "Flash Flood Warning", description: "Official warning", severity: "Severe", ends_at: "2026-10-08T12:00:00.000Z" }] as typeof current.sources.weather.data;
    expect(deriveCountyStatus(current, road, civic).level).toBe("Advisory");
    current.sources.weather.data[0].ends_at = "2026-10-08T18:00:00.000Z";
    current.sources.weather.freshness = "stale";
    expect(deriveCountyStatus(current, road, civic).level).toBe("Advisory");
  });
  it("lets an official local emergency retain urgency despite incomplete coverage", () => {
    const result = deriveCountyStatus(situation(), null, { ...civic, degraded: true, alerts: [{ kind: "city-emergency", title: "Frederick emergency", summary: "Official instructions" }] } as OfficialCivicAlertsResult);
    expect(result).toMatchObject({ level: "Urgent", active: true, ok: false, count: 1 });
  });
  it("does not claim Clear when a shared check fails or lacks complete coverage", () => {
    expect(deriveCountyStatus(situation(), null, civic).level).toBe("Unknown");
    expect(deriveCountyStatus(situation(), road, null).level).toBe("Unknown");
    expect(deriveCountyStatus(situation(), { ...road, summary: { ...road.summary, coverage: "partial" } }, civic).level).toBe("Unknown");
    expect(deriveCountyStatus(situation(), road, { ...civic, degraded: true }).level).toBe("Unknown");
  });
  it.each([
    ["unknown", "Urgent"],
    ["", "Urgent"],
    ["2026-10-08T12:59:59.999Z", "Clear"],
    [NOW, "Clear"],
    ["2026-10-08T13:00:00.001Z", "Urgent"],
  ] as const)("agrees with the canonical warning count for published expiry %j", (ends_at, level) => {
    const current = situation([{ event: "Flash Flood Warning", headline: "Flash Flood Warning", description: "Official warning", severity: "Severe", ends_at }] as CurrentSituationSources["weather"]["data"]);
    expect(current.summary.activeByCategory.weather).toBe(level === "Urgent" ? 1 : 0);
    expect(deriveCountyStatus(current, road, civic).level).toBe(level);
  });

});
