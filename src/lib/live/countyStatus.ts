import { MUNICIPALITIES } from "@/data/municipalities";
import { chartTodayTitle } from "@/lib/integrations/mdot-chart";
import {
  isLocallyRelevantCivicAlert,
  type OfficialCivicAlert,
} from "@/lib/integrations/official-alert-feeds";
import {
  airQualitySeverity,
  powerOutageSeverity,
  ROAD_INCIDENT_SEVERITY,
  SCHOOL_NOTICE_SEVERITY,
  SEVERE_FIRE_RESCUE_SEVERITY,
  selectActiveSituationRows,
  weatherAlertSeverity,
  type CurrentSituationSnapshot,
  type StatusSeverity,
} from "@/lib/live/currentSituationModel";
import type {
  RoadAttentionSignal,
  RoadIntelligenceSnapshot,
} from "@/lib/live/roadIntelligenceModel";

/**
 * County status: ONE answer to "is anything going on in Frederick County?"
 *
 * At 11:03 PM on Oct 6, 2026 the header dot was red while /pulse called the
 * same CHART crash an "Advisory", Today's "1 more active alert" opened a
 * sheet that said no current notice was found, and Compass put "Needs
 * attention" over a single MDOT incident. Each surface had computed status its
 * own way. selectCountyStatus is the one selector: it turns the shared
 * situation snapshot, the road intelligence snapshot and the official civic
 * notices into one list of items, each graded by the severity rules in
 * currentSituationModel.ts, and derives the word, tone and count from that
 * list. The header endpoint, the Live conditions masthead and Compass read it.
 *
 * NPS park notices stay a Today concern; their severity on Today is an owner
 * decision and this selector does not grade them.
 */

export type CountyStatusFamily =
  | "weather"
  | "civic"
  | "water"
  | "fire-rescue"
  | "police"
  | "schools"
  | "roads"
  | "power"
  | "air";

export type CountyStatusItem = {
  /** Provider-stable identity, so a repeated feed row is counted once. */
  id: string;
  family: CountyStatusFamily;
  severity: StatusSeverity;
  /** Plain, sentence-case title for a row. */
  title: string;
  /** The Live conditions detail that explains this item. */
  href: string;
  /**
   * Municipalities whose area contains the item's own position. Set only when
   * the source locates the event itself (a CHART incident or a work zone),
   * never from a message sign, whose position is the sign's, not the event's.
   */
  towns?: string[];
};

export type CountyStatusTone = "alert" | "caution" | "quiet";
export type CountyStatusWord = "Urgent" | "Advisory" | "All quiet" | "Unknown";

export type CountyStatus = {
  word: CountyStatusWord;
  tone: CountyStatusTone;
  count: number;
  items: CountyStatusItem[];
  /** Every source the status depends on answered completely. */
  ok: boolean;
  lastUpdated: string;
};

/** Same family order /pulse uses to break a tie between equal leads. */
const FAMILY_ORDER: Record<CountyStatusFamily, number> = {
  weather: 0,
  civic: 1,
  water: 2,
  "fire-rescue": 3,
  police: 4,
  schools: 5,
  roads: 6,
  power: 7,
  air: 8,
};

const SEVERITY_ORDER: Record<StatusSeverity, number> = {
  urgent: 0,
  advisory: 1,
};

// A corridor through a town reaches a little past its bounding box: the
// interchange that serves a town often sits on its edge. About 500 m.
const TOWN_PAD_DEGREES = 0.005;

type Position = [number, number];

/** Municipality slugs whose padded bounding box contains any position. */
export function townsAt(positions: readonly Position[]): string[] {
  return MUNICIPALITIES.filter((town) => {
    const [west, south, east, north] = town.bbox;
    return positions.some(
      ([lng, lat]) =>
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        lng >= west - TOWN_PAD_DEGREES &&
        lng <= east + TOWN_PAD_DEGREES &&
        lat >= south - TOWN_PAD_DEGREES &&
        lat <= north + TOWN_PAD_DEGREES,
    );
  }).map((town) => town.slug);
}

/** Every [lng, lat] pair in a GeoJSON-like coordinate tree. */
function positionsIn(coordinates: unknown): Position[] {
  if (!Array.isArray(coordinates)) return [];
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return [[coordinates[0], coordinates[1]]];
  }
  return coordinates.flatMap(positionsIn);
}

function withTowns(item: CountyStatusItem, positions: Position[]): CountyStatusItem {
  const towns = townsAt(positions);
  return towns.length > 0 ? { ...item, towns } : item;
}

const SCHOOL_TITLES = {
  closed: "FCPS school closure",
  delayed: "FCPS delayed opening",
  early_dismissal: "FCPS early dismissal",
} as const;

/** Items from the shared current-situation snapshot. */
export function situationStatusItems(
  situation: CurrentSituationSnapshot,
): CountyStatusItem[] {
  const nowMs = Date.parse(situation.generatedAt);
  const active = selectActiveSituationRows(situation.sources, nowMs);
  const items: CountyStatusItem[] = [];

  for (const alert of active.weather) {
    items.push({
      id: `nws:${alert.id}`,
      family: "weather",
      severity: weatherAlertSeverity(alert),
      title: alert.event,
      href: "/pulse?open=alerts",
    });
  }
  for (const notice of active.schools) {
    items.push({
      id: `fcps:${notice.id}`,
      family: "schools",
      severity: SCHOOL_NOTICE_SEVERITY,
      title:
        SCHOOL_TITLES[notice.status as keyof typeof SCHOOL_TITLES] ??
        "FCPS schedule update",
      href: "/pulse?open=schools",
    });
  }
  for (const incident of active.roads) {
    items.push(
      withTowns(
        {
          id: `mdot-chart:${incident.id}`,
          family: "roads",
          severity: ROAD_INCIDENT_SEVERITY,
          title: chartTodayTitle(incident),
          href: "/pulse?open=traffic",
        },
        [[incident.lng, incident.lat]],
      ),
    );
  }
  if (active.power) {
    const out = active.power.total_out;
    items.push({
      id: "firstenergy:outage",
      family: "power",
      severity: powerOutageSeverity(out, active.power.total_served),
      title: `${out.toLocaleString("en-US")} ${out === 1 ? "customer" : "customers"} without power`,
      href: "/pulse?open=power",
    });
  }
  for (const incident of active.fireRescue) {
    items.push({
      id: `pulsepoint:${incident.id}`,
      family: "fire-rescue",
      severity: SEVERE_FIRE_RESCUE_SEVERITY,
      title: incident.type,
      href: "/pulse?open=safety",
    });
  }
  if (active.air) {
    items.push({
      id: "airnow:worst",
      family: "air",
      severity: airQualitySeverity(active.air.category.id),
      title: `Air quality is ${active.air.category.name.toLowerCase()}`,
      href: "/pulse?open=air",
    });
  }
  return items;
}

function signalSeverity(signal: RoadAttentionSignal): StatusSeverity {
  // /pulse paints only an emergency road signal (an active snow emergency)
  // as Urgent; closures, pavement reports and sign messages are advisories.
  return signal.severity === "emergency" ? "urgent" : "advisory";
}

/** Items from the road intelligence snapshot (signs outside the county are
 * already dropped by the model). */
export function roadStatusItems(
  road: RoadIntelligenceSnapshot | null,
): CountyStatusItem[] {
  if (!road) return [];
  const zones = new Map(
    (road.sources.workZones.available ? road.sources.workZones.data : []).map(
      (zone) => [`work-zone:${zone.id}`, zone],
    ),
  );
  return road.attention.map((signal) => {
    const item: CountyStatusItem = {
      id: `mdot-road:${signal.id}`,
      family: "roads",
      severity: signalSeverity(signal),
      title: signal.title,
      href: "/pulse?open=traffic",
    };
    const zone = signal.kind === "work-zone-closure" ? zones.get(signal.id) : undefined;
    return zone ? withTowns(item, positionsIn(zone.geometry.coordinates)) : item;
  });
}

type CivicAlertsInput = {
  alerts: readonly OfficialCivicAlert[];
  available: boolean;
  degraded: boolean;
};

/** Items from the City and Health Department Alert Center feeds. */
export function civicStatusItems(
  civic: CivicAlertsInput | null,
): CountyStatusItem[] {
  if (!civic) return [];
  return civic.alerts.filter(isLocallyRelevantCivicAlert).map((alert) => ({
    id: `official:${alert.url}`,
    family: "civic",
    severity: alert.kind === "city-emergency" ? "urgent" : "advisory",
    title: alert.title,
    href: "/pulse?open=alerts",
  }));
}

/** A river at NWS action stage or above. Only /pulse reads river gauges, so
 * the page adds this item to its own status through the same grading. */
export function floodStatusItem(flood: {
  id: string;
  title: string;
  tone: "danger" | "warning" | "neutral";
}): CountyStatusItem {
  return {
    id: `usgs:${flood.id}`,
    family: "water",
    severity: flood.tone === "danger" ? "urgent" : "advisory",
    title: flood.title,
    href: "/pulse?open=rivers",
  };
}

/** A fresh official public-safety release that /pulse leads with. */
export function policeStatusItem(release: {
  url: string;
  title: string;
}): CountyStatusItem {
  return {
    id: `police:${release.url}`,
    family: "police",
    severity: "urgent",
    title: release.title,
    href: "/pulse?open=police",
  };
}

/** Urgent first, then the /pulse family order; equal items keep feed order. */
export function rankCountyStatusItems(
  items: readonly CountyStatusItem[],
): CountyStatusItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        SEVERITY_ORDER[left.item.severity] - SEVERITY_ORDER[right.item.severity] ||
        FAMILY_ORDER[left.item.family] - FAMILY_ORDER[right.item.family] ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

/** The word and tone every surface shows for a list of graded items. */
export function countyStatusFromItems(
  items: readonly CountyStatusItem[],
  { ok, lastUpdated }: { ok: boolean; lastUpdated: string },
): CountyStatus {
  const ranked = rankCountyStatusItems(items);
  const urgent = ranked.some((item) => item.severity === "urgent");
  const tone: CountyStatusTone = urgent
    ? "alert"
    : ranked.length > 0
      ? "caution"
      : "quiet";
  // A quiet claim is earned only by a complete check. With nothing to report
  // and a source missing, the honest word is Unknown, never All quiet.
  const word: CountyStatusWord = urgent
    ? "Urgent"
    : ranked.length > 0
      ? "Advisory"
      : ok
        ? "All quiet"
        : "Unknown";
  return { word, tone, count: ranked.length, items: ranked, ok, lastUpdated };
}

export function selectCountyStatus({
  situation,
  road,
  civic,
  extraItems = [],
}: {
  situation: CurrentSituationSnapshot;
  road: RoadIntelligenceSnapshot | null;
  civic: CivicAlertsInput | null;
  /** Page-only evidence (river stage, a police release) graded the same way. */
  extraItems?: readonly CountyStatusItem[];
}): CountyStatus {
  const ok =
    situation.summary.coverage === "complete" &&
    road !== null &&
    road.summary.coverage === "complete" &&
    civic !== null &&
    civic.available &&
    !civic.degraded;
  return countyStatusFromItems(
    [
      ...situationStatusItems(situation),
      ...roadStatusItems(road),
      ...civicStatusItems(civic),
      ...extraItems,
    ],
    { ok, lastUpdated: situation.generatedAt },
  );
}
