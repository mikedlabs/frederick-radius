import type { CurrentSituationSnapshot, CurrentSituationSources } from "@/lib/live/currentSituationModel";
import { isUnexpiredWeatherAlert, selectPulseStatus, sourceDisplayState, sourceFreshnessAt } from "@/lib/live/currentSituationModel";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import type { OfficialCivicAlertsResult } from "@/lib/integrations/official-alert-feeds";
import { currentLocalCivicAlerts } from "@/lib/integrations/official-alert-feeds";
import { powerOutageTone, pulseAlertPriority } from "@/lib/pulse/signal-priority";
import { roadAttentionSource, roadSourceIsCurrent, verifiedRoadAttention } from "@/lib/live/roadIntelligenceModel";
import { MDOT_WZDX_MAX_FEED_AGE_MS } from "@/lib/integrations/mdot-wzdx";

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
  now = Date.parse(situation.generatedAt),
): CountyStatusSummary {
  const base = selectPulseStatus(situation);
  const sources = Object.fromEntries(Object.entries(situation.sources).map(([key, source]) => [key, { ...source, freshness: sourceFreshnessAt(source, now) }])) as CurrentSituationSources;
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
  const checks: CountySourceCheck[] = Object.values(sources).map((source) => ({
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
  const localCivicAlerts = currentLocalCivicAlerts(civic?.alerts ?? [], now);
  const categorySources = { weather: "weather", schools: "schools", roads: "traffic", power: "power", fireRescue: "fireRescue", air: "air" } as const;
  const unverifiedBaseCount = Object.entries(categorySources).reduce((total, [category, source]) => total + (sourceDisplayState(sources[source]) === "current" ? 0 : situation.summary.activeByCategory[category as keyof typeof categorySources]), 0);
  const expiredWeatherCount = sourceDisplayState(sources.weather) === "current"
    ? sources.weather.data.filter((alert) => isUnexpiredWeatherAlert(alert, Date.parse(situation.generatedAt)) && !isUnexpiredWeatherAlert(alert, now)).length : 0;
  const count = Math.max(0, base.count - unverifiedBaseCount - expiredWeatherCount) + currentRoadSignals.length + localCivicAlerts.length;
  const ok = base.ok && roadVerified && road !== null && road.summary.coverage === "complete"
    && Object.values(sources).every((source) => !source.requiredForQuiet || sourceDisplayState(source) === "current")
    && civic !== null && civic.available && !civic.degraded;
  const { weather, power, air } = sources;
  // An active category is not automatically urgent. Apply the same published
  // severity rules used for Pulse's details rather than promoting all NWS
  // advisories, small outages, and ordinary road closures to emergencies.
  const urgent = (situation.summary.activeByCategory.fireRescue > 0 && sourceDisplayState(sources.fireRescue) === "current")
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
  // A client cannot recompute this projection when an accepted source or
  // alert expires between polls. Bound its validity without re-dating checks.
  const deadlines = [Date.parse(situation.generatedAt) + COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS];
  for (const source of Object.values(sources)) {
    if (sourceDisplayState(source) === "current") deadlines.push(Date.parse(source.asOf ?? "") + source.staleAfterSeconds * 1_000);
  }
  if (road && snapshotCurrent) {
    deadlines.push(Date.parse(road.generatedAt) + COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS);
    for (const key of checkedRoadSources) {
      if (!roadSourceCurrent(key)) continue;
      deadlines.push(Date.parse(road.sources[key].checkedAt ?? "") + COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS);
      if (key === "workZones") deadlines.push(Date.parse(road.sources.workZones.asOf ?? "") + MDOT_WZDX_MAX_FEED_AGE_MS);
    }
  }
  for (const alert of localCivicAlerts) deadlines.push(Date.parse(alert.expiresAt ?? ""));
  if (sourceDisplayState(weather) === "current") {
    for (const alert of weather.data) if (isUnexpiredWeatherAlert(alert, now)) deadlines.push(Date.parse(alert.ends_at));
  }
  const deadline = Math.min(...deadlines.filter(Number.isFinite));
  const validUntil = Number.isFinite(Date.parse(situation.generatedAt)) && Number.isFinite(new Date(deadline).getTime()) ? new Date(deadline).toISOString() : null;
  return { active, count, tone: active ? urgent ? "alert" : "caution" : "quiet", ok, level, lastUpdated: base.lastUpdated, validUntil, checks, roadCheck };
}
