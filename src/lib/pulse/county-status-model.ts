import type { CurrentSituationSnapshot } from "@/lib/live/currentSituationModel";
import { selectPulseStatus, sourceDisplayState } from "@/lib/live/currentSituationModel";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import type { OfficialCivicAlertsResult } from "@/lib/integrations/official-alert-feeds";
import { isLocallyRelevantCivicAlert } from "@/lib/integrations/official-alert-feeds";
import { powerOutageTone, pulseAlertPriority } from "@/lib/pulse/signal-priority";

import type { CountyStatusLevel, CountyStatusSummary } from "./county-status";

/** One county-status projection for the API and Pulse masthead. These are the
 * existing shared checks; Pulse-only river, police and transport details do
 * not participate in this summary and must retain their own source context. */
export function deriveCountyStatus(
  situation: CurrentSituationSnapshot,
  road: RoadIntelligenceSnapshot | null,
  civic: OfficialCivicAlertsResult | null,
): CountyStatusSummary {
  const base = selectPulseStatus(situation);
  const localCivicAlerts = civic?.alerts.filter(isLocallyRelevantCivicAlert) ?? [];
  const count = base.count + (road?.summary.activeCount ?? 0) + localCivicAlerts.length;
  const ok = base.ok && road !== null && road.summary.coverage === "complete"
    && civic !== null && civic.available && !civic.degraded;
  const now = Date.parse(situation.generatedAt);
  const { weather, power, air } = situation.sources;
  // An active category is not automatically urgent. Apply the same published
  // severity rules used for Pulse's details rather than promoting all NWS
  // advisories, small outages, and ordinary road closures to emergencies.
  const urgent = situation.summary.activeByCategory.fireRescue > 0
    || (sourceDisplayState(weather) === "current" && weather.data.some((alert) =>
      (!Number.isFinite(Date.parse(alert.ends_at)) || Date.parse(alert.ends_at) > now) && pulseAlertPriority(alert) <= 4))
    || (situation.summary.activeByCategory.power > 0
      && sourceDisplayState(power) === "current"
      && powerOutageTone(power.data.total_out, power.data.total_served) === "danger")
    || (sourceDisplayState(air) === "current" && air.data.some((observation) => observation.category.id >= 4))
    || Boolean(road?.attention.some((signal) => signal.severity === "emergency"))
    || localCivicAlerts.some((alert) => alert.kind === "city-emergency");
  const active = count > 0;
  const level: CountyStatusLevel = active ? urgent ? "Urgent" : "Advisory" : ok ? "Clear" : "Unknown";
  return { active, count, tone: active ? urgent ? "alert" : "caution" : "quiet", ok, level, lastUpdated: base.lastUpdated };
}
