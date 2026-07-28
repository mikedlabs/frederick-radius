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

export const MDOT_CHART_URL = "https://chart.maryland.gov/";
export const FCPS_STATUS_URL = "https://www.fcps.org/";
export const FPD_CALLS_FOR_SERVICE_URL =
  "https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map";
export const CITY_ALERTS_URL =
  "https://www.cityoffrederickmd.gov/CivicAlerts.aspx";
export const COUNTY_ALERTS_URL =
  "https://www.frederickcountymd.gov/CivicAlerts.aspx";

type CivicAskContext = {
  label?: string | null;
  origin?: LngLat | null;
  canShowDistance?: boolean;
  query?: string | null;
};

const ROAD_NOUN_RE =
  /\b(?:road|roads|roadway|traffic|highway|highways|interstate|route|routes|i-?\s?\d+|us\s?\d+|md\s?\d+)\b/i;
const ROAD_STATUS_RE =
  /\b(?:closed|closure|closures|open|condition|conditions|incident|incidents|crash|crashes|collision|blocked|blocking|detour|detours|delay|delays|backup|backed up|clear|hazard|hazards|how (?:are|is)|what(?:'s| is) happening)\b/i;
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
  return ROAD_NOUN_RE.test(query) && ROAD_STATUS_RE.test(query);
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

export function roadStatusAskResult(
  result: ChartIncidentsResult,
  context: CivicAskContext = {},
  now = new Date(),
): AskResult {
  const requestedRoad = requestedRoadOf(context.query);
  const relevantIncidents = requestedRoad
    ? result.data.filter((incident) =>
        incidentMatchesRoad(incident, requestedRoad),
      )
    : result.data;
  const incidents = sortedIncidents(relevantIncidents, context);
  const sources: AskSource[] = incidents.length > 0
    ? incidents.slice(0, 4).map((incident) => chartSource(incident, context, now))
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

  let answer: string;
  if (!result.available) {
    answer =
      "I couldn’t load MDOT CHART’s live incident feed. Check the official CHART map for current road closures and traffic incidents.";
  } else if (incidents.length === 0 && requestedRoad) {
    answer =
      `MDOT CHART currently lists no active traffic incident for ${requestedRoad.label} in Frederick County. That does not prove every segment is clear, so check CHART before you travel.`;
  } else if (incidents.length === 0) {
    answer =
      "MDOT CHART currently lists no active traffic incidents in Frederick County. The feed does not cover every neighborhood street or show general pavement conditions, so check CHART before you travel.";
  } else {
    const count = incidents.length;
    answer =
      `MDOT CHART currently lists ${count} active ${count === 1 ? "traffic incident" : "traffic incidents"}${requestedRoad ? ` for ${requestedRoad.label}` : ""} in Frederick County. ${chartHeroSentence(incidents[0])} Open CHART for the latest lane and location details.`;
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
    ],
    intelligence: {
      tools: ["traffic"],
      confidence: result.available ? "high" : "medium",
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
