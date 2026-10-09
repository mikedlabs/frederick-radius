import type { CurrentSituationSnapshot } from "@/lib/live/currentSituationModel";
import { isUnexpiredWeatherAlert, selectPulseStatus, sourceDisplayState } from "@/lib/live/currentSituationModel";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import type { OfficialCivicAlertsResult } from "@/lib/integrations/official-alert-feeds";
import { isLocallyRelevantCivicAlert } from "@/lib/integrations/official-alert-feeds";
import { powerOutageTone, pulseAlertPriority } from "@/lib/pulse/signal-priority";
import { roadAttentionSource, roadSourceIsCurrent, verifiedRoadAttention } from "@/lib/live/roadIntelligenceModel";

import { COUNTY_STATUS_FUTURE_TOLERANCE_MS, COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS, type CountySourceCheck, type CountyStatusLevel, type CountyStatusSummary } from "./county-status";

function currentTime(value: string | undefined, now: number, maxAge = COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS): boolean {
  const age = now - Date.parse(value ?? "");
  return Number.isFinite(age) && age >= -COUNTY_STATUS_FUTURE_TOLERANCE_MS && age < maxAge;
}

const SOURCE_LABELS = { nws: "NWS", fcps: "FCPS", "mdot-chart": "MDOT CHART incidents", "frederick-scanner": "Frederick Scanner", firstenergy: "Potomac Edison", pulsepoint: "PulsePoint", airnow: "AirNow" };
const ROAD_LABELS = { workZones: "Maryland WZDx", roadConditions: "MDOT road conditions", snowEmergency: "MDOT snow emergency", weatherStations: "MDOT road weather", messages: "MDOT highway signs" } as const;

/** One county-status projection for the API and Pulse masthead. These are the
 * existing shared checks; Pulse-only river, police and transport details do
 * not participate in this summary and must retain their own source context. */
export function deriveCountyStatus(
  situation: CurrentSituationSnapshot,
  road: RoadIntelligenceSnapshot | null,
  civic: OfficialCivicAlertsResult | null,
): CountyStatusSummary {
  const base = selectPulseStatus(situation);
  const now = Date.parse(situation.generatedAt);
  const requiredRoadSources = ["workZones", "roadConditions", "snowEmergency"] as const;
  const checkedRoadSources = new Set<keyof typeof ROAD_LABELS>(requiredRoadSources);
  for (const signal of road?.attention ?? []) {
    const key = roadAttentionSource(signal);
    if (key in ROAD_LABELS) checkedRoadSources.add(key as keyof typeof ROAD_LABELS);
  }
  const roadSourceCurrent = (key: keyof typeof ROAD_LABELS) => Boolean(road && roadSourceIsCurrent(road, key, now));
  const unverifiedSources = [...checkedRoadSources].filter((key) => !roadSourceCurrent(key)).map((key) => ROAD_LABELS[key] as string);
  const currentRoadSignals = road ? verifiedRoadAttention(road, now) : [];
  const snapshotCurrent = Boolean(road && currentTime(road.generatedAt, now));
  if (!snapshotCurrent) unverifiedSources.push("Road snapshot");
  const roadVerified = snapshotCurrent && unverifiedSources.length === 0;
  const checkedTimes = requiredRoadSources.map((key) => Date.parse(road?.sources?.[key]?.checkedAt ?? "")).filter(Number.isFinite);
  const roadCheck = { verified: roadVerified, checkedAt: checkedTimes.length ? new Date(Math.min(...checkedTimes)).toISOString() : null, currentCount: currentRoadSignals.length, earlierCount: (road?.attention.length ?? 0) - currentRoadSignals.length, unverifiedSources };
  const checks: CountySourceCheck[] = Object.values(situation.sources).map((source) => ({
    source: SOURCE_LABELS[source.source],
    state: source.availability === "disabled" ? "disabled" : source.availability !== "available" ? "unavailable" : source.freshness === "fresh" ? "current" : source.freshness === "stale" ? "stale" : "unavailable",
    asOf: source.asOf, asOfBasis: source.asOfBasis,
  }));
  for (const key of checkedRoadSources) checks.push({ source: ROAD_LABELS[key], state: snapshotCurrent && roadSourceCurrent(key) ? "current" : road?.sources?.[key]?.available ? "stale" : "unavailable", asOf: road?.sources?.[key]?.checkedAt ?? null, asOfBasis: "retrieval" });
  if (civic?.sourceHealth?.length) {
    for (const source of civic.sourceHealth) checks.push({ source: source.publisher, state: source.available ? "current" : "unavailable", asOf: source.asOf, asOfBasis: "provider" });
  } else if (!civic?.available || civic.degraded) {
    checks.push({ source: "City and County civic notices", state: "unavailable", asOf: null, asOfBasis: null });
  }
  const localCivicAlerts = civic?.alerts.filter(isLocallyRelevantCivicAlert) ?? [];
  const count = base.count + currentRoadSignals.length + localCivicAlerts.length;
  const ok = base.ok && roadVerified && road !== null && road.summary.coverage === "complete"
    && civic !== null && civic.available && !civic.degraded;
  const { weather, power, air } = situation.sources;
  // An active category is not automatically urgent. Apply the same published
  // severity rules used for Pulse's details rather than promoting all NWS
  // advisories, small outages, and ordinary road closures to emergencies.
  const urgent = situation.summary.activeByCategory.fireRescue > 0
    || (sourceDisplayState(weather) === "current" && weather.data.some((alert) =>
      isUnexpiredWeatherAlert(alert, now) && pulseAlertPriority(alert) <= 4))
    || (situation.summary.activeByCategory.power > 0
      && sourceDisplayState(power) === "current"
      && powerOutageTone(power.data.total_out, power.data.total_served) === "danger")
    || (sourceDisplayState(air) === "current" && air.data.some((observation) => observation.category.id >= 4))
    || currentRoadSignals.some((signal) => signal.severity === "emergency")
    || localCivicAlerts.some((alert) => alert.kind === "city-emergency");
  const active = count > 0;
  const level: CountyStatusLevel = active ? urgent ? "Urgent" : "Advisory" : ok ? "Clear" : "Unknown";
  return { active, count, tone: active ? urgent ? "alert" : "caution" : "quiet", ok, level, lastUpdated: base.lastUpdated, checks, roadCheck };
}
