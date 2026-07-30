import type { AskResult, AskSource } from "@/lib/ask/contracts";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import {
  chartFreshnessTail,
  chartHeroSentence,
  chartTodayTitle,
  humanizeChartText,
  type ChartIncident,
  type ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import type {
  FcpsAlert,
  FcpsAlertsResult,
} from "@/lib/integrations/fcps";
import { currentFcpsOperationsNotices } from "@/lib/integrations/fcps";
import {
  advisoryReleases,
  type CivicPressItem,
  type CivicPressResult,
} from "@/lib/integrations/civic-press";
import type {
  MdotWorkZone,
} from "@/lib/integrations/mdot-wzdx";
import {
  selectRoadTravelSummary,
  type RoadAttentionSignal,
  type RoadIntelligenceSnapshot,
} from "@/lib/live/roadIntelligenceModel";
import type {
  CountySnowRoute,
} from "@/lib/integrations/fcSnowCommand";
import type {
  CountyDataSnapshot,
} from "@/lib/integrations/fcCountySource";

export const MDOT_CHART_URL = "https://chart.maryland.gov/";
export const FCPS_STATUS_URL = "https://www.fcps.org/";
export const FPD_CALLS_FOR_SERVICE_URL =
  "https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map";
export const CITY_ALERTS_URL =
  "https://www.cityoffrederickmd.gov/CivicAlerts.aspx";
export const COUNTY_ALERTS_URL =
  "https://www.frederickcountymd.gov/CivicAlerts.aspx";
export const COUNTY_ROAD_CLOSURES_URL =
  "https://www.frederickcountymd.gov/5052/Roads-Closed";
export const CITY_ROAD_CLOSURES_MAP_URL =
  "https://maryland.maps.arcgis.com/apps/webappviewer/index.html?id=dd8df89e5d604ea4a8f36cf20cd394ec";

type CivicAskContext = {
  label?: string | null;
  origin?: LngLat | null;
  canShowDistance?: boolean;
  query?: string | null;
};

const ROAD_NOUN_RE =
  /\b(?:road|roads|roadway|traffic|highway|highways|interstate|route|routes|i-?\s?\d+|us\s?\d+|md\s?\d+)\b/i;
const ROAD_STATUS_RE =
  /\b(?:closed|closure|closures|open|condition|conditions|incident|incidents|crash|crashes|collision|blocked|blocking|detour|detours|delay|delays|backup|backed up|clear|hazard|hazards|ice|icy|slick|slippery|snowy|snow-covered|plowed|plowing|how (?:are|is)|what(?:'s| is) happening)\b/i;
const PLOW_STATUS_RE =
  /\b(?:where (?:are|is) (?:the )?|track(?:ing)? (?:the )?|county )?plows?\b|\bplow(?:ed|ing)\b/i;
const SCHOOL_DISTRICT_RE =
  /\b(?:fcps|frederick county public schools?|frederick county schools?|school district)\b/i;
const SCHOOL_NOUN_RE = /\bschools?\b/i;
const SCHOOL_STATUS_RE =
  /\b(?:closed|closure|open|opening|delay|delayed|late opening|dismissal|dismissed|early release|cancelled|canceled|status|operating|operations)\b/i;
const SCHOOL_DAY_RE = /\b(?:schedule|today|tomorrow)\b/i;
const POLICE_NOUN_RE =
  /\b(?:police|cops?|officers?|sheriff(?:'s)?|deput(?:y|ies)|public safety)\b/i;
const POLICE_ACTIVITY_RE =
  /\b(?:activity|presence|scene|sirens?|responding|response|happening|going on|outside|around|nearby|here|there|why are)\b/i;
const POLICE_DIRECTORY_RE =
  /\b(?:phone|number|contact|address|directions?|department|station|headquarters|jobs?|career|report a crime)\b/i;
const WATER_ADVISORY_RE =
  /\b(?:boil[\s-]?water|water advisory|drinking water advisory|public water advisory|tap water (?:safe|unsafe)|safe to drink|water main (?:break|leak)|water service (?:outage|interruption)|water outage)\b/i;
const WATER_AMENITY_RE =
  /\b(?:fountain|refill|bottle|hydration station|nearest (?:water|drinking water)|find (?:water|drinking water))\b/i;
const WATER_NOTICE_TITLE_RE =
  /\b(?:boil[\s-]?water|drinking water|public water|water advisory|water main|water service|water outage|water quality)\b/i;

export function wantsRoadStatus(query: string): boolean {
  return (
    (ROAD_NOUN_RE.test(query) && ROAD_STATUS_RE.test(query)) ||
    PLOW_STATUS_RE.test(query)
  );
}

export function wantsCountySnowOperations(
  query: string,
  now = new Date(),
): boolean {
  if (/\b(?:snow|snowy|plow(?:ed|ing|s)?|ice|icy|slick|salt(?:ed|ing)?)\b/i.test(query)) {
    return true;
  }
  const month = now.getMonth();
  return wantsRoadStatus(query) && (month <= 2 || month >= 10);
}

export function wantsSchoolStatus(query: string): boolean {
  if (SCHOOL_DISTRICT_RE.test(query)) {
    return SCHOOL_STATUS_RE.test(query) || SCHOOL_DAY_RE.test(query);
  }
  return SCHOOL_NOUN_RE.test(query) && SCHOOL_STATUS_RE.test(query);
}

export function wantsPublicSafetyActivity(query: string): boolean {
  return (
    POLICE_NOUN_RE.test(query)
    && POLICE_ACTIVITY_RE.test(query)
    && !POLICE_DIRECTORY_RE.test(query)
  );
}

export function wantsWaterAdvisory(query: string): boolean {
  return WATER_ADVISORY_RE.test(query) && !WATER_AMENITY_RE.test(query);
}

const SEVERITY_RANK: Record<ChartIncident["severity"], number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

type RequestedRoad = {
  prefix: "I" | "US" | "MD" | null;
  number: string;
  label: string;
};

function requestedRoadOf(query: string | null | undefined): RequestedRoad | null {
  if (!query) return null;
  const patterns: Array<{
    pattern: RegExp;
    prefix: RequestedRoad["prefix"];
    label: (number: string) => string;
  }> = [
    {
      pattern: /\b(?:interstate|i)\s*-?\s*(\d{1,3})\b/i,
      prefix: "I",
      label: (number) => `I-${number}`,
    },
    {
      pattern: /\b(?:u\.?\s*s\.?)\s*-?\s*(\d{1,3})\b/i,
      prefix: "US",
      label: (number) => `US ${number}`,
    },
    {
      pattern: /\bmd\s*-?\s*(\d{1,3})\b/i,
      prefix: "MD",
      label: (number) => `MD ${number}`,
    },
    {
      pattern: /\b(?:route|rt\.?)\s*(\d{1,3})\b/i,
      prefix: null,
      label: (number) => `Route ${number}`,
    },
  ];
  for (const candidate of patterns) {
    const match = query.match(candidate.pattern);
    if (!match?.[1]) continue;
    return {
      prefix: candidate.prefix,
      number: match[1],
      label: candidate.label(match[1]),
    };
  }
  return null;
}

function incidentRoadKey(incident: ChartIncident): {
  prefix: "I" | "US" | "MD";
  number: string;
} | null {
  const text = `${incident.road} ${incident.location} ${incident.description}`;
  const match = text.match(/\b(I|US|MD)\s*-?\s*(\d{1,3})\b/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    prefix: match[1].toUpperCase() as "I" | "US" | "MD",
    number: match[2],
  };
}

function textRoadKey(value: string): {
  prefix: "I" | "US" | "MD";
  number: string;
} | null {
  const match = value.match(/\b(I|US|MD)\s*-?\s*(\d{1,3})\b/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    prefix: match[1].toUpperCase() as "I" | "US" | "MD",
    number: match[2],
  };
}

function signalMatchesRoad(
  signal: RoadAttentionSignal,
  requestedRoad: RequestedRoad,
): boolean {
  if (signal.kind === "snow-emergency") return true;
  const actual = textRoadKey(
    `${signal.title} ${signal.detail} ${signal.scope}`,
  );
  if (!actual || actual.number !== requestedRoad.number) return false;
  return requestedRoad.prefix === null || actual.prefix === requestedRoad.prefix;
}

function incidentMatchesRoad(
  incident: ChartIncident,
  requestedRoad: RequestedRoad,
): boolean {
  const actual = incidentRoadKey(incident);
  if (!actual || actual.number !== requestedRoad.number) return false;
  return requestedRoad.prefix === null || actual.prefix === requestedRoad.prefix;
}

function isNearMeRoadQuery(query: string | null | undefined): boolean {
  return /\b(?:near me|nearby|around me|close to me|by me|in my area|here)\b/i.test(
    query ?? "",
  );
}

function isFutureRoadQuery(query: string | null | undefined): boolean {
  return /\b(?:tomorrow|this weekend|next weekend|next week|next (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|later (?:today|tonight|this week)|upcoming)\b/i.test(
    query ?? "",
  );
}

function isDowntownRoadQuery(query: string | null | undefined): boolean {
  return /\b(?:downtown(?: frederick)?|carroll creek|market street|patrick street)\b/i.test(
    query ?? "",
  );
}

function scopedRoadCoverageResult(
  context: CivicAskContext,
  {
    future,
    downtown,
  }: {
    future: boolean;
    downtown: boolean;
  },
): AskResult {
  const answer =
    future && downtown
      ? "The road feeds Radius can check are current and countywide. They do not provide a verified forecast of downtown closures for the time you asked about, so I will not present today’s countywide incidents as a match. Check the City road-closure map and official notices before you travel."
      : future
        ? "The road feeds Radius can check are current and countywide. They do not forecast closures for the time you asked about, so I will not present today’s incidents as a future match. Check the official closure list before you travel."
        : "The road feeds Radius can check are countywide and do not provide a complete view of downtown street closures. I will not present incidents elsewhere in the county as downtown matches. Check the City road-closure map and official notices before you travel.";
  const sources: AskSource[] = downtown
    ? [
        {
          slug: "city-frederick-road-closures",
          name: "City of Frederick road closures",
          category: "traffic",
          city: "Frederick",
          href: CITY_ROAD_CLOSURES_MAP_URL,
          eyebrow: "Official City road-closure map",
          reason: "Use the City map for downtown street closures",
          confidence: "high",
        },
        {
          slug: "city-frederick-alerts",
          name: "City of Frederick alerts",
          category: "traffic",
          city: "Frederick",
          href: CITY_ALERTS_URL,
          eyebrow: "Official City notices",
          reason: "Check for traffic advisories and scheduled changes",
          confidence: "high",
        },
      ]
    : [
        {
          slug: "frederick-county-road-closures",
          name: "Frederick County road closures",
          category: "traffic",
          city: "Frederick County",
          href: COUNTY_ROAD_CLOSURES_URL,
          eyebrow: "Official County closure list",
          reason: "Check published closures for the date you plan to travel",
          confidence: "high",
        },
      ];

  return {
    status: "empty",
    configured: true,
    usedModel: false,
    answer,
    context: downtown
      ? "Downtown Frederick"
      : context.label ?? "Frederick County",
    sources,
    actions: downtown
      ? [
          {
            label: "Check City road closures",
            kind: "open",
            href: CITY_ROAD_CLOSURES_MAP_URL,
          },
          {
            label: "Check City alerts",
            kind: "open",
            href: CITY_ALERTS_URL,
          },
        ]
      : [
          {
            label: "Check County road closures",
            kind: "open",
            href: COUNTY_ROAD_CLOSURES_URL,
          },
          { label: "Open MDOT CHART", kind: "open", href: MDOT_CHART_URL },
        ],
    intelligence: {
      tools: ["traffic"],
      confidence: "high",
      retrieval: "keyword",
    },
  };
}

function incidentDistance(
  incident: ChartIncident,
  context: CivicAskContext,
): number | null {
  if (!context.origin || context.canShowDistance === false) return null;
  return haversineMeters(context.origin, {
    lat: incident.lat,
    lng: incident.lng,
  });
}

function sortedIncidents(
  incidents: ChartIncident[],
  context: CivicAskContext,
): ChartIncident[] {
  const distanceFirst = isNearMeRoadQuery(context.query);
  return [...incidents].sort((a, b) => {
    const aDistance = incidentDistance(a, context);
    const bDistance = incidentDistance(b, context);
    if (
      distanceFirst &&
      aDistance != null &&
      bDistance != null &&
      aDistance !== bDistance
    ) {
      return aDistance - bDistance;
    }
    const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severity !== 0) return severity;
    if (aDistance != null && bDistance != null && aDistance !== bDistance) {
      return aDistance - bDistance;
    }
    const aStarted = a.started_at
      ? Date.parse(a.started_at)
      : Number.NEGATIVE_INFINITY;
    const bStarted = b.started_at
      ? Date.parse(b.started_at)
      : Number.NEGATIVE_INFINITY;
    return bStarted - aStarted;
  });
}

function chartSource(
  incident: ChartIncident,
  context: CivicAskContext,
  now: Date,
): AskSource {
  const distance = incidentDistance(incident, context);
  const detail = humanizeChartText(
    incident.lanes_affected || incident.location || incident.description,
  );
  return {
    slug: `mdot-chart-${incident.id}`,
    name: chartTodayTitle(incident),
    category: "traffic",
    city: "Frederick County",
    href: MDOT_CHART_URL,
    eyebrow: "MDOT CHART · Live traffic",
    reason: chartHeroSentence(incident),
    detail: detail || undefined,
    distance: distance == null ? undefined : formatDistance(distance),
    status: `${incident.severity} · ${chartFreshnessTail(incident, now)}`,
    confidence: "high",
  };
}

function workZoneMatchesRoad(
  zone: MdotWorkZone,
  requestedRoad: RequestedRoad,
): boolean {
  const expected = `${requestedRoad.prefix ?? ""}${requestedRoad.number}`
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  return zone.roadNames.some(
    (road) =>
      road.replace(/[^a-z0-9]/gi, "").toUpperCase() === expected ||
      (requestedRoad.prefix === null &&
        road.replace(/\D/g, "") === requestedRoad.number),
  );
}

function signalSource(signal: RoadAttentionSignal): AskSource {
  return {
    slug: `road-signal-${signal.id}`,
    name: signal.title,
    category: "traffic",
    city: "Frederick County",
    href: signal.sourceUrl,
    eyebrow: signal.sourceLabel,
    reason: signal.detail,
    status: signal.scope,
    confidence: "high",
  };
}

function workZoneSource(zone: MdotWorkZone): AskSource {
  const laneImpact =
    zone.lanes.summary === "all-lanes-closed"
      ? "All lanes closed"
      : zone.lanes.summary === "some-lanes-closed"
        ? zone.lanes.closed > 0
          ? `${zone.lanes.closed} ${zone.lanes.closed === 1 ? "lane" : "lanes"} closed`
          : "Lane closure"
        : "Road work";
  return {
    slug: `mdot-wzdx-${zone.id}`,
    name: `${zone.road} · ${laneImpact}`,
    category: "traffic",
    city: "Frederick County",
    href: zone.sourceUrl,
    eyebrow: "Maryland WZDx · Official road work",
    reason: zone.description,
    status: zone.status === "active" ? "Active" : "Scheduled",
    confidence: zone.positionConfidence === "verified" ? "high" : "medium",
  };
}

export function roadStatusAskResult(
  result: ChartIncidentsResult,
  context: CivicAskContext = {},
  now = new Date(),
  roadIntelligence: RoadIntelligenceSnapshot | null = null,
  countySnow: CountyDataSnapshot<CountySnowRoute> | null = null,
): AskResult {
  const futureQuery = isFutureRoadQuery(context.query);
  const downtownQuery = isDowntownRoadQuery(context.query);
  if (futureQuery || downtownQuery) {
    return scopedRoadCoverageResult(context, {
      future: futureQuery,
      downtown: downtownQuery,
    });
  }

  const requestedRoad = requestedRoadOf(context.query);
  const relevantIncidents = requestedRoad
    ? result.data.filter((incident) =>
        incidentMatchesRoad(incident, requestedRoad),
      )
    : result.data;
  const incidents = sortedIncidents(relevantIncidents, context);
  const roadTravel = roadIntelligence
    ? selectRoadTravelSummary(roadIntelligence)
    : null;
  const relevantWorkZones = (roadTravel?.workZones ?? []).filter(
    (zone) =>
      zone.status === "active" &&
      (!requestedRoad || workZoneMatchesRoad(zone, requestedRoad)),
  );
  const relevantSignals = (roadIntelligence?.attention ?? []).filter(
    (signal) =>
      !requestedRoad ||
      signalMatchesRoad(signal, requestedRoad),
  );
  const selectedSignals = relevantSignals.slice(0, 2);
  const signaledWorkZoneIds = new Set(
    selectedSignals
      .filter((signal) => signal.kind === "work-zone-closure")
      .map((signal) => signal.id.replace(/^work-zone:/, "")),
  );
  const newSources: AskSource[] = [
    ...selectedSignals.map(signalSource),
    ...relevantWorkZones
      .filter((zone) => !signaledWorkZoneIds.has(zone.id))
      .slice(0, 2)
      .map(workZoneSource),
  ];
  const incidentSources = incidents
    .slice(0, Math.max(0, 5 - newSources.length))
    .map((incident) => chartSource(incident, context, now));
  let sources: AskSource[] =
    newSources.length > 0 || incidentSources.length > 0
      ? [...newSources, ...incidentSources].slice(0, 5)
      : [{
        slug: "mdot-chart",
        name: "MDOT CHART",
        category: "traffic",
        city: "Frederick County",
        href: MDOT_CHART_URL,
        eyebrow: "Official Maryland traffic map",
        reason: result.available
          ? requestedRoad
            ? `No active ${requestedRoad.label} incident is listed in Frederick County`
            : "No active Frederick County incident is listed"
          : "Live incident feed unavailable",
        confidence: result.available ? "high" : "medium",
      }];

  const currentSnowRoutes =
    !requestedRoad && countySnow?.availability === "available"
      ? countySnow.records.filter((route) => route.freshness === "current")
      : [];
  const snowCounts = currentSnowRoutes.reduce(
    (counts, route) => {
      counts[route.reportedStatus] += 1;
      return counts;
    },
    {
      clear: 0,
      narrow_clear: 0,
      emergency_access: 0,
      closed: 0,
      unknown: 0,
    } satisfies Record<CountySnowRoute["reportedStatus"], number>,
  );
  const snowAttention =
    snowCounts.closed + snowCounts.emergency_access + snowCounts.narrow_clear;
  const latestSnowObservedAt = currentSnowRoutes
    .map((route) => route.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const countySnowSource: AskSource | null =
    currentSnowRoutes.length > 0 && countySnow
      ? {
          slug: "frederick-county-snow-operations",
          name: "County snow-route operations",
          category: "traffic",
          city: "Frederick County",
          href: countySnow.provenance.sourceUrl,
          eyebrow: "Frederick County operational report",
          reason:
            snowAttention > 0
              ? `${snowAttention} current route status${snowAttention === 1 ? "" : "es"} need attention`
              : `${currentSnowRoutes.length} current route-operation record${currentSnowRoutes.length === 1 ? "" : "s"}`,
          detail:
            "Provider-reported route operations are not proof that a road is safe or passable.",
          status: latestSnowObservedAt
            ? `Latest observation ${new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
              }).format(new Date(latestSnowObservedAt))}`
            : "Current reporting window",
          confidence: "medium",
        }
      : null;
  if (countySnowSource) {
    sources = snowAttention > 0
      ? [countySnowSource, ...sources].slice(0, 5)
      : [...sources.slice(0, 4), countySnowSource];
  }

  let answer: string;
  const leadSignal = relevantSignals[0] ?? null;
  if (leadSignal) {
    const incidentTail =
      incidents.length > 0
        ? ` CHART also lists ${incidents.length} active ${incidents.length === 1 ? "incident" : "incidents"}${requestedRoad ? ` for ${requestedRoad.label}` : ""}.`
        : "";
    answer =
      `${leadSignal.title}. ${leadSignal.detail}${incidentTail} Open the road details before choosing your route.`;
  } else if (relevantWorkZones.length > 0) {
    const top = relevantWorkZones[0];
    const impact =
      top.lanes.summary === "all-lanes-closed"
        ? "all lanes reported closed"
        : top.lanes.summary === "some-lanes-closed"
          ? top.lanes.closed > 0
            ? `${top.lanes.closed} ${top.lanes.closed === 1 ? "lane" : "lanes"} closed`
            : "a lane closure reported"
          : "active work reported";
    answer =
      `Maryland WZDx lists ${relevantWorkZones.length} active ${relevantWorkZones.length === 1 ? "work zone" : "work zones"}${requestedRoad ? ` for ${requestedRoad.label}` : " in Frederick County"}. The first is on ${top.road}, with ${impact}. ${incidents.length > 0 ? `CHART also lists ${incidents.length} active ${incidents.length === 1 ? "incident" : "incidents"}. ` : ""}Open the map for the exact segment.`;
  } else if (!result.available && !roadIntelligence) {
    answer =
      "I couldn’t load MDOT CHART’s live incident feed. Check the official CHART map for current road closures and traffic incidents.";
  } else if (incidents.length === 0 && requestedRoad) {
    if (!roadIntelligence) {
      answer =
        `MDOT CHART currently lists no active traffic incident for ${requestedRoad.label} in Frederick County. That does not prove every segment is clear, so check CHART before you travel.`;
    } else {
    const checksIncomplete =
      !result.available ||
      roadIntelligence?.summary.coverage === "partial";
    answer =
      checksIncomplete
        ? `I did not find an active ${requestedRoad.label} incident in the road data that loaded, but at least one official check was unavailable. Open CHART before you travel.`
        : `The checked MDOT feeds currently list no active incident or work-zone closure for ${requestedRoad.label} in Frederick County. That does not prove every segment is clear, so check CHART before you travel.`;
    }
  } else if (incidents.length === 0) {
    if (!roadIntelligence) {
      answer =
        "MDOT CHART currently lists no active traffic incidents in Frederick County. The feed does not cover every neighborhood street or show general pavement conditions, so check CHART before you travel.";
    } else {
    const checksIncomplete =
      !result.available ||
      roadIntelligence?.summary.coverage === "partial";
    answer =
      checksIncomplete
        ? "The road data that loaded shows no major active issue, but at least one official check was unavailable. Open CHART before relying on this result."
        : "The checked MDOT feeds currently list no major incident, severe road condition, snow emergency, or active work-zone closure in Frederick County. That does not prove every neighborhood street is clear.";
    }
  } else {
    const count = incidents.length;
    answer =
      `MDOT CHART currently lists ${count} active ${count === 1 ? "traffic incident" : "traffic incidents"}${requestedRoad ? ` for ${requestedRoad.label}` : ""} in Frederick County. ${chartHeroSentence(incidents[0])} Open CHART for the latest lane and location details.`;
  }

  if (countySnowSource) {
    const statusParts = [
      snowCounts.closed > 0 ? `${snowCounts.closed} closed` : null,
      snowCounts.emergency_access > 0
        ? `${snowCounts.emergency_access} emergency-access`
        : null,
      snowCounts.narrow_clear > 0
        ? `${snowCounts.narrow_clear} narrow-clear`
        : null,
      snowCounts.clear > 0 ? `${snowCounts.clear} clear` : null,
    ].filter(Boolean);
    const plowLimit = /\bplows?\b/i.test(context.query ?? "")
      ? " It reports route operations, not individual plow locations."
      : "";
    answer += ` County SnowCommand has ${currentSnowRoutes.length} current route-operation record${currentSnowRoutes.length === 1 ? "" : "s"}${statusParts.length > 0 ? `: ${statusParts.join(", ")}` : ""}.${plowLimit} These provider statuses do not prove that a road is safe or passable.`;
  } else if (/\bplows?\b/i.test(context.query ?? "")) {
    answer +=
      " County SnowCommand does not provide individual plow locations, and no current route-operation record was available.";
  }

  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer,
    context: context.label ?? "Frederick County",
    sources,
    actions: [
      { label: "Open MDOT CHART", kind: "open", href: MDOT_CHART_URL },
      { label: "See Radius traffic", kind: "open", href: "/pulse?open=traffic" },
      { label: "See roads on the map", kind: "open", href: "/map?show=roads" },
    ],
    intelligence: {
      tools: countySnowSource
        ? ["traffic", "county-snow-operations"]
        : ["traffic"],
      confidence:
        result.available &&
        (!roadIntelligence || roadIntelligence.summary.coverage === "complete") &&
        !countySnowSource
          ? "high"
          : "medium",
      retrieval: "keyword",
    },
  };
}

function schoolStatusLabel(status: FcpsAlert["status"]): string {
  switch (status) {
    case "closed": return "Closed";
    case "delayed": return "Delayed opening";
    case "early_dismissal": return "Early dismissal";
    case "open": return "Normal operations";
    default: return "Check the official notice";
  }
}

function schoolSource(alert: FcpsAlert): AskSource {
  return {
    slug: `fcps-${alert.id}`,
    name: alert.title,
    category: "schools",
    city: "Frederick County",
    href: alert.url || FCPS_STATUS_URL,
    eyebrow: "Frederick County Public Schools",
    reason: schoolStatusLabel(alert.status),
    detail: alert.description || undefined,
    status: postedLabel(alert.published_at),
    confidence: "high",
  };
}

export function schoolStatusAskResult(
  result: FcpsAlertsResult,
  context: CivicAskContext = {},
): AskResult {
  const alerts = currentFcpsOperationsNotices(result.data);
  const sources: AskSource[] = alerts.length > 0
    ? alerts.slice(0, 3).map(schoolSource)
    : [{
        slug: "fcps-status",
        name: "Frederick County Public Schools",
        category: "schools",
        city: "Frederick County",
        href: FCPS_STATUS_URL,
        eyebrow: "Official school status",
        reason: result.available
          ? "No current operations notice in the feed"
          : "Operations feed unavailable",
        confidence: result.available ? "high" : "medium",
      }];

  let answer: string;
  if (!result.available) {
    answer =
      "I couldn’t load the FCPS operations feed. Check FCPS directly before relying on a school opening, delay, or closure status.";
  } else if (alerts.length === 0) {
    answer =
      "The FCPS operations feed has no current closure, delay, or early-dismissal notice. Check FCPS directly for a specific school or after-school activity.";
  } else {
    answer =
      `FCPS currently has this operations notice: ${alerts[0].title}. Open the official notice to confirm which schools, programs, or activities it covers.`;
  }

  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer,
    context: context.label ?? "Frederick County",
    sources,
    actions: [
      { label: "Check FCPS", kind: "open", href: FCPS_STATUS_URL },
      { label: "See Radius school status", kind: "open", href: "/pulse?open=schools" },
    ],
    intelligence: {
      tools: ["schools"],
      confidence: result.available ? "high" : "medium",
      retrieval: "keyword",
    },
  };
}

export function publicSafetyActivityAskResult(
  context: CivicAskContext = {},
): AskResult {
  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer:
      "Radius cannot identify a nearby police scene or say why officers are there. Frederick Police’s calls-for-service map can help inside the city, while Pulse carries official City and County police releases. Radius Scanner shows only the limited public, non-medical dispatch data available to the app.",
    context: context.label ?? "Frederick County",
    sources: [
      {
        slug: "fpd-calls-for-service",
        name: "Frederick Police calls for service",
        category: "public-safety",
        city: "City of Frederick",
        href: FPD_CALLS_FOR_SERVICE_URL,
        eyebrow: "Official city map",
        reason: "Recent calls for service inside the City of Frederick",
        confidence: "high",
      },
      {
        slug: "radius-police-updates",
        name: "Official police updates",
        category: "public-safety",
        city: "Frederick County",
        href: "/pulse?open=police",
        eyebrow: "Pulse",
        reason: "City and County police releases",
        confidence: "high",
      },
      {
        slug: "radius-scanner",
        name: "Radius Scanner",
        category: "public-safety",
        city: "Frederick County",
        href: "/scanner",
        eyebrow: "Limited public dispatch feed",
        reason: "Private medical and crime calls are not included",
        confidence: "medium",
      },
    ],
    actions: [
      { label: "Open the city calls map", kind: "open", href: FPD_CALLS_FOR_SERVICE_URL },
      { label: "Open Radius Scanner", kind: "open", href: "/scanner" },
    ],
    intelligence: {
      tools: ["public-safety", "scanner"],
      confidence: "medium",
      retrieval: "keyword",
    },
  };
}

function postedLabel(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `Posted ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(date)}`;
}

function waterNotices(items: CivicPressItem[]): CivicPressItem[] {
  return advisoryReleases(items, 30).filter((item) =>
    WATER_NOTICE_TITLE_RE.test(item.title)
  );
}

function waterNoticeSource(item: CivicPressItem): AskSource {
  return {
    slug: `water-notice-${encodeURIComponent(item.url)}`,
    name: item.title,
    category: "water",
    city: item.source,
    href: item.url,
    eyebrow: `${item.source} · Official notice`,
    reason: "Water-related public notice",
    status: postedLabel(item.publishedAt),
    confidence: "high",
  };
}

function officialWaterAlertSources(
  result: CivicPressResult,
): AskSource[] {
  return [
    {
      slug: "city-of-frederick-alerts",
      name: "City of Frederick alerts",
      category: "water",
      city: "City of Frederick",
      href: CITY_ALERTS_URL,
      eyebrow: "Official public notices",
      reason: result.sourceHealth.unavailable.includes("City of Frederick")
        ? "News feed unavailable; check the alert page"
        : "No recent water notice found in the checked feed",
      confidence: result.sourceHealth.unavailable.includes("City of Frederick")
        ? "medium"
        : "high",
    },
    {
      slug: "frederick-county-alerts",
      name: "Frederick County alerts",
      category: "water",
      city: "Frederick County",
      href: COUNTY_ALERTS_URL,
      eyebrow: "Official public notices",
      reason: result.sourceHealth.unavailable.includes("Frederick County")
        ? "News feed unavailable; check the alert page"
        : "No recent water notice found in the checked feed",
      confidence: result.sourceHealth.unavailable.includes("Frederick County")
        ? "medium"
        : "high",
    },
  ];
}

export function waterAdvisoryAskResult(
  result: CivicPressResult,
  context: CivicAskContext = {},
): AskResult {
  const notices = waterNotices(result.items);
  const incomplete = result.sourceHealth.degraded;
  const sources = notices.length > 0
    ? notices.slice(0, 3).map(waterNoticeSource)
    : officialWaterAlertSources(result);

  let answer: string;
  if (notices.length > 0) {
    const posted = postedLabel(notices[0].publishedAt)?.toLowerCase();
    answer =
      `The latest official water-related notice Radius found is “${notices[0].title}”${posted ? `, ${posted}` : ""}. Open it to confirm the affected area and whether it is still in effect.${incomplete ? " One official news feed did not load, so this is not a complete countywide check." : ""}`;
  } else if (incomplete) {
    answer =
      "I couldn’t confirm a current boil-water or public-water advisory because at least one official news feed did not load. Check the City and County alert pages before relying on the result.";
  } else {
    answer =
      "I did not find a recent boil-water or public-water notice in the City and County news feeds Radius checks. That does not confirm water safety at a specific address or cover every private water system.";
  }

  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer,
    context: context.label ?? "Frederick County",
    sources,
    actions: [
      { label: "Check City alerts", kind: "open", href: CITY_ALERTS_URL },
      { label: "Check County alerts", kind: "open", href: COUNTY_ALERTS_URL },
    ],
    intelligence: {
      tools: ["water", "civic"],
      confidence: notices.length > 0 && !incomplete ? "high" : "medium",
      retrieval: "keyword",
    },
  };
}
