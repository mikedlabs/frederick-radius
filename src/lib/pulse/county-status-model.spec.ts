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
const road = { summary: { activeCount: 0, coverage: "complete" }, attention: [] } as unknown as RoadIntelligenceSnapshot;
const civic = { alerts: [], available: true, degraded: false } as unknown as OfficialCivicAlertsResult;

describe("Shared county status severity and coverage", () => {
  it.each(["advisory", "warning", "emergency"] as const)("uses the published %s road severity instead of treating every closure as urgent", (severity) => {
    const summary = deriveCountyStatus(situation(), { ...road, summary: { ...road.summary, activeCount: 1 }, attention: [{ severity }] } as RoadIntelligenceSnapshot, civic);
    expect(summary.level).toBe(severity === "emergency" ? "Urgent" : "Advisory");
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
