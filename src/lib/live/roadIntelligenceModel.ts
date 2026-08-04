import type {
  ChartFeedResult,
  ChartHighwayMessage,
  ChartRoadConditionReport,
  ChartRoadWeatherStation,
  ChartSnowEmergency,
  ChartSpeedSensor,
  ChartTravelTime,
} from "@/lib/integrations/mdot-road-feeds";
import type {
  MdotWorkZone,
  MdotWorkZonesResult,
} from "@/lib/integrations/mdot-wzdx";
import type { RoadWorkZoneFC } from "@/components/map/types";

export const ROAD_INTELLIGENCE_SCHEMA_VERSION = 1 as const;

export type RoadIntelligenceSources = {
  workZones: MdotWorkZonesResult;
  speeds: ChartFeedResult<ChartSpeedSensor>;
  travelTimes: ChartFeedResult<ChartTravelTime>;
  messages: ChartFeedResult<ChartHighwayMessage>;
  weatherStations: ChartFeedResult<ChartRoadWeatherStation>;
  roadConditions: ChartFeedResult<ChartRoadConditionReport>;
  snowEmergency: ChartFeedResult<ChartSnowEmergency>;
};

export type RoadAttentionSignal = {
  id: string;
  kind:
    | "snow-emergency"
    | "road-condition"
    | "work-zone-closure"
    | "pavement-weather"
    | "highway-message";
  priority: number;
  severity: "advisory" | "warning" | "emergency";
  title: string;
  detail: string;
  scope: string;
  sourceLabel: string;
  sourceUrl: string;
  observedAt: string | null;
};

export type RoadIntelligenceSnapshot = {
  schemaVersion: typeof ROAD_INTELLIGENCE_SCHEMA_VERSION;
  generatedAt: string;
  sources: RoadIntelligenceSources;
  attention: RoadAttentionSignal[];
  summary: {
    status: "active" | "quiet" | "unknown";
    coverage: "complete" | "partial";
    activeCount: number;
    unavailable: Array<keyof RoadIntelligenceSources>;
  };
};

/** Label the geography Radius actually has. A CHART message carries the
 * physical sign position, not a confirmed crash/closure location contained in
 * its text; calling every scope "Area" overstates that evidence. */
export function roadAttentionScopeLabel(
  signal: Pick<RoadAttentionSignal, "kind">,
): "Area" | "Road" | "Station" | "Sign location" {
  switch (signal.kind) {
    case "highway-message":
      return "Sign location";
    case "pavement-weather":
      return "Station";
    case "work-zone-closure":
      return "Road";
    default:
      return "Area";
  }
}

const CONDITION_LABELS: Record<0 | 1 | 2, string> = {
  0: "Normal",
  1: "Use caution",
  2: "Travel may be restricted",
};

function roadConditionSignals(
  result: ChartFeedResult<ChartRoadConditionReport>,
): RoadAttentionSignal[] {
  if (!result.available) return [];
  return result.data.flatMap((report) => {
    const entries = [
      ["Interstates", report.conditions.interstate],
      ["Primary roads", report.conditions.primary],
      ["Secondary roads", report.conditions.secondary],
    ] as const;
    return entries.flatMap(([scope, condition]) => {
      if (!condition || condition.providerGroup < 1) return [];
      return [{
        id: `road-condition:${report.id}:${scope}`,
        kind: "road-condition" as const,
        priority: condition.providerGroup === 2 ? 90 : 55,
        severity: condition.providerGroup === 2 ? "warning" as const : "advisory" as const,
        title: CONDITION_LABELS[condition.providerGroup],
        detail: condition.description,
        scope,
        sourceLabel: "MDOT CHART road conditions",
        sourceUrl: report.sourceUrl,
        observedAt: report.observedAt,
      }];
    });
  });
}

function laneImpact(zone: MdotWorkZone): string {
  if (zone.lanes.summary === "all-lanes-closed") return "All lanes closed";
  if (zone.lanes.summary === "some-lanes-closed") {
    return zone.lanes.closed > 0
      ? `${zone.lanes.closed} ${zone.lanes.closed === 1 ? "lane" : "lanes"} closed`
      : "Lane closure";
  }
  return zone.status === "scheduled" ? "Scheduled work" : "Active road work";
}

function workZoneSignals(result: MdotWorkZonesResult): RoadAttentionSignal[] {
  if (!result.available) return [];
  return result.data
    .filter(
      (zone) =>
        zone.status === "active" &&
        zone.lanes.summary === "all-lanes-closed",
    )
    .map((zone) => ({
      id: `work-zone:${zone.id}`,
      kind: "work-zone-closure" as const,
      priority: 82,
      severity: "warning" as const,
      title: `${zone.road} work-zone closure`,
      detail: `${laneImpact(zone)}. ${zone.description}`,
      scope: zone.direction ? `${zone.road} · ${zone.direction}` : zone.road,
      sourceLabel: "Maryland WZDx",
      sourceUrl: zone.sourceUrl,
      observedAt: zone.updatedAt,
    }));
}

function pavementSignals(
  result: ChartFeedResult<ChartRoadWeatherStation>,
): RoadAttentionSignal[] {
  if (!result.available) return [];
  return result.data.flatMap((station) => {
    const pavement = station.pavementTemperatureF;
    if (!pavement || pavement.low > 32) return [];
    const precipitation = station.precipitationType?.toLowerCase() ?? "";
    const wet = precipitation !== "" && !/^(none|no precipitation|dry)$/.test(precipitation);
    if (!wet && (station.airTemperatureF == null || station.airTemperatureF > 34)) {
      return [];
    }
    return [{
      id: `road-weather:${station.id}`,
      kind: "pavement-weather" as const,
      priority: wet ? 74 : 62,
      severity: wet ? "warning" as const : "advisory" as const,
      title: wet ? "Freezing pavement is possible" : "Pavement is near freezing",
      detail: [
        `Pavement ${Math.round(pavement.low)}–${Math.round(pavement.high)}°F`,
        station.precipitationType,
        station.visibilityMiles != null
          ? `${station.visibilityMiles.toFixed(1)} mi visibility`
          : null,
      ].filter(Boolean).join(" · "),
      scope: station.name,
      sourceLabel: "MDOT CHART road weather station",
      sourceUrl: station.sourceUrl,
      observedAt: station.observedAt,
    }];
  });
}

const ACTIONABLE_SIGN_RE =
  /\b(?:closed|closure|blocked|detour|do not|avoid|emergency|flood|ice|snow|crash|incident|delay)\b/i;

function highwayMessageSignals(
  result: ChartFeedResult<ChartHighwayMessage>,
): RoadAttentionSignal[] {
  if (!result.available) return [];
  return result.data
    .filter((message) => ACTIONABLE_SIGN_RE.test(message.message))
    .map((message) => ({
      id: `highway-message:${message.id}`,
      kind: "highway-message" as const,
      priority: 68,
      severity: "warning" as const,
      title: message.message,
      detail: "Message currently displayed on an official highway sign.",
      scope: message.location,
      sourceLabel: "MDOT CHART message sign",
      sourceUrl: message.sourceUrl,
      observedAt: message.observedAt,
    }));
}

function snowEmergencySignals(
  result: ChartFeedResult<ChartSnowEmergency>,
): RoadAttentionSignal[] {
  if (!result.available) return [];
  return result.data
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: `snow-emergency:${item.id}`,
      kind: "snow-emergency" as const,
      priority: 100,
      severity: "emergency" as const,
      title: "Snow emergency plan is active",
      detail:
        item.exception ??
        "Frederick County has an active snow emergency declaration. Check official restrictions before driving.",
      scope: item.county,
      sourceLabel: "MDOT CHART snow emergency",
      sourceUrl: item.sourceUrl,
      observedAt: item.declaredAt,
    }));
}

export function buildRoadIntelligenceSnapshot({
  sources,
  now = new Date(),
}: {
  sources: RoadIntelligenceSources;
  now?: Date;
}): RoadIntelligenceSnapshot {
  const unavailable = (
    Object.entries(sources) as Array<
      [keyof RoadIntelligenceSources, { available: boolean }]
    >
  )
    .filter(([, source]) => !source.available)
    .map(([key]) => key);
  const required: Array<keyof RoadIntelligenceSources> = [
    "workZones",
    "roadConditions",
    "snowEmergency",
  ];
  const coverage = required.some((key) => unavailable.includes(key))
    ? "partial"
    : "complete";
  const attention = [
    ...snowEmergencySignals(sources.snowEmergency),
    ...roadConditionSignals(sources.roadConditions),
    ...workZoneSignals(sources.workZones),
    ...pavementSignals(sources.weatherStations),
    ...highwayMessageSignals(sources.messages),
  ].sort(
    (left, right) =>
      right.priority - left.priority ||
      (Date.parse(right.observedAt ?? "") || 0) -
        (Date.parse(left.observedAt ?? "") || 0) ||
      left.id.localeCompare(right.id),
  );

  return {
    schemaVersion: ROAD_INTELLIGENCE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    sources,
    attention,
    summary: {
      status:
        attention.length > 0
          ? "active"
          : coverage === "complete"
            ? "quiet"
            : "unknown",
      coverage,
      activeCount: attention.length,
      unavailable,
    },
  };
}

export function selectRoadWorkZoneFeatureCollection(
  snapshot: RoadIntelligenceSnapshot,
): RoadWorkZoneFC {
  if (!snapshot.sources.workZones.available) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: snapshot.sources.workZones.data.map((zone) => ({
      type: "Feature" as const,
      id: zone.id,
      geometry: zone.geometry,
      properties: {
        id: zone.id,
        road: zone.road,
        title: zone.description,
        laneImpact: laneImpact(zone),
        status: zone.status === "active" ? "Active" : "Scheduled",
        startAt: zone.startAt,
        endAt: zone.endAt ?? undefined,
        updatedAt: zone.updatedAt,
        sourceUrl: zone.sourceUrl,
      },
    })),
  };
}

export function selectTodayRoadSignal(
  snapshot: RoadIntelligenceSnapshot,
): RoadAttentionSignal | null {
  return snapshot.attention[0] ?? null;
}

export function selectRoadTravelSummary(
  snapshot: RoadIntelligenceSnapshot,
): {
  travelTimes: ChartTravelTime[];
  speeds: ChartSpeedSensor[];
  workZones: MdotWorkZone[];
  conditions: ChartRoadConditionReport[];
  snowEmergency: ChartSnowEmergency | null;
} {
  return {
    travelTimes: snapshot.sources.travelTimes.available
      ? snapshot.sources.travelTimes.data
      : [],
    speeds: snapshot.sources.speeds.available ? snapshot.sources.speeds.data : [],
    workZones: snapshot.sources.workZones.available
      ? snapshot.sources.workZones.data
      : [],
    conditions: snapshot.sources.roadConditions.available
      ? snapshot.sources.roadConditions.data
      : [],
    snowEmergency:
      snapshot.sources.snowEmergency.data.find((item) => item.status === "active") ??
      null,
  };
}

/**
 * The corridor a status tile should name when nothing is wrong on the roads.
 *
 * MDOT publishes a measured travel time for the county's interstate segments
 * on every poll, already narrowed to Frederick County and dropped once older
 * than fifteen minutes. Pulse read the selector above and kept only its work
 * zones, so a quiet hour rendered "No major impact" while real numbers sat
 * unread. A quiet road is still a road with a drive time on it.
 *
 * A corridor that is trending longer leads, because a rising number is the one
 * worth seeing first; otherwise the longest drive leads.
 *
 * `trend` compares against MDOT's own PREVIOUS READING, not against a typical
 * day. The feed carries no free-flow baseline, so no caller may render this as
 * "slower than usual" — only that the last reading was shorter.
 */
export function leadTravelTime(
  travelTimes: readonly ChartTravelTime[],
): ChartTravelTime | null {
  if (travelTimes.length === 0) return null;
  const longestFirst = [...travelTimes].sort(
    (a, b) => b.travelTimeSeconds - a.travelTimeSeconds,
  );
  return (
    longestFirst.find((segment) => segment.trend === "longer") ??
    longestFirst[0]
  );
}

/** Whole minutes for a measured drive, never rounding a real drive to zero. */
export function travelMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}
