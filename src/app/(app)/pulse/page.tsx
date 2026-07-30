/**
 * Live Pulse — Frederick County as an editorial briefing, not a feed console.
 *
 * The server normalizes trusted public feeds; PulseBoard turns them into one
 * lead issue, supporting facts, a calm systems ledger, and distinct modules
 * for transportation, outdoor conditions, and local updates. Heavy bus
 * geometry waits behind intent, and client-owned drawer URLs keep this route
 * cacheable while preserving shareable `?open=` links.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ChevronRight } from "lucide-react";
import {
  chartHeroSentence,
  chartTypeSentence,
  chartTodayTitle,
  chartFreshnessTail,
  humanizeChartText,
} from "@/lib/integrations/mdot-chart";
import { currentFcpsOperationsNotices } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import {
  isPulsePointAlert,
  isPulsePointNotable,
} from "@/lib/integrations/pulsepoint";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getLocalHeadlines } from "@/lib/integrations/news";
import { getCivicPressReleases, policeReleases, featuredPoliceRelease, advisoryReleases } from "@/lib/integrations/civic-press";
import { getMarcBoard, getMarcAlerts, marcClockMinutes } from "@/lib/integrations/marcTrains";
import { airQualityObservedAt, pickWorstAqi, type AqiObservation } from "@/lib/integrations/airnow";
import { getFrederickStockings } from "@/lib/integrations/dnrTrout";
import { getCampDavidTfr } from "@/lib/integrations/faaTfr";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import { getFrederickWaterSitesWithHistory, readingTrend, type WaterSite } from "@/lib/integrations/usgsWater";
import { classifyFlood, nwsGaugeUrl } from "@/lib/integrations/floodStage";
import MetricCard from "@/components/live-data/MetricCard";
import FloodGauge from "@/components/live-data/FloodGauge";
import { getAreaAirportStatus, type AirportStatus } from "@/lib/integrations/faa-airports";
import PageBloom from "@/components/ui/PageBloom";
import ScannerTimeline from "@/components/pulse/ScannerTimeline";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import { selectRoadTravelSummary } from "@/lib/live/roadIntelligenceModel";
import { getOfficialSignalsSnapshot } from "@/lib/live/officialSignals";
import { isLocallyRelevantCivicAlert } from "@/lib/integrations/official-alert-feeds";
import { sourceDisplayState } from "@/lib/live/currentSituationModel";
import { PoliceBreakingStrip, PoliceBlotter } from "@/components/pulse/CivicPress";
import PulseBoard, {
  type PulseTile,
  type PulseHero,
  type PulseHeroChip,
  type PulseHeroFact,
} from "@/components/pulse/PulseBoard";
import { clampPercent } from "@/components/pulse/format";
import PulseWeatherPanel from "@/components/pulse/PulseWeatherPanel";
import BusesReveal from "@/components/pulse/BusesReveal";
import { compareAlertPriority } from "@/lib/alert-priority";
import { powerOutageTone, pulseAlertPriority, pulseStatusState, shouldAqiLead } from "@/lib/pulse/signal-priority";
import { aqiObservationLabel, aqiParameterLabel, hasObservationForAlert, isElevatedAirQualityPeriodActive, summarizeAirQualityAlert } from "@/lib/air-quality";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata: Metadata = {
  alternates: { canonical: "/pulse" },
  title: PRODUCT_NAMES.liveConditions.pageTitle,
  description: PRODUCT_NAMES.liveConditions.description,
};

export const revalidate = 120;

function timeAgo(iso: string): string {
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function titleCaseWords(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Give the observation its date as well as its hour. Around midnight, a bare
 * "12 AM" can make a fresh reading look like yesterday's value. */
function aqiClock(observation: AqiObservation): string {
  const observedAt = airQualityObservedAt(observation);
  if (!observedAt) return `${observation.dateObserved} · ${observation.hourObserved}:00`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
  }).format(observedAt);
}

/** Plain, deterministic local guidance for the alert families NWS publishes.
 * This deliberately avoids speculative AI copy: the alert type selects a
 * short action, while the official NWS record remains one tap away. */
function alertGuidance(
  event: string,
  headline = "",
  description = "",
  observations: AqiObservation[] = [],
  now: Date,
): string {
  const name = event.toLowerCase();
  const copy = `${event} ${headline} ${description}`;
  if (name.includes("tornado")) return "Move indoors, keep emergency alerts on, and be ready to use a lower interior room.";
  if (name.includes("severe thunderstorm")) return "Outdoor plans may need to move inside. Secure loose items and keep weather alerts on.";
  if (name.includes("flood")) return "Avoid low-water crossings and never drive through flooded roads. Check your route before leaving.";
  if (name.includes("heat")) return "Plan shade and water for time outside, and move strenuous activity to a cooler part of the day.";
  if (name.includes("winter") || name.includes("snow") || name.includes("ice")) return "Allow extra travel time and check road conditions before heading out.";
  if (name.includes("wind")) return "Secure loose outdoor items and use extra care around trees and power lines.";
  if (/air quality|smoke|ozone/i.test(copy)) {
    const summary = summarizeAirQualityAlert({ event, headline, description });
    if (summary?.levelLabel) {
      const period = summary.forecastPeriod ? ` ${summary.forecastPeriod}` : "";
      const coverageGap = !hasObservationForAlert(summary, observations.map((observation) => observation.parameter));
      const elevatedNow = isElevatedAirQualityPeriodActive(summary, now);
      const action = elevatedNow
        ? "Everyone should avoid strenuous activity outside during this window."
        : summary.level === "maroon"
        ? "Avoid outdoor activity and follow official guidance."
        : summary.level === "purple"
          ? "Everyone should avoid strenuous activity outside."
          : summary.level === "red"
            ? "Everyone should reduce prolonged or heavy activity outside."
            : "Sensitive groups should reduce strenuous activity outside.";
      if (coverageGap && summary.pollutant === "pm25") {
        const smokeTiming = summary.elevatedRange && summary.elevatedPeriod
          ? ` could make PM2.5 unhealthy to very unhealthy ${summary.elevatedPeriod}`
          : " may raise PM2.5 levels";
        const improvement = summary.improvementPeriod
          ? `, with improvement expected ${summary.improvementPeriod}`
          : "";
        const observation = observations.length > 0
          ? "AirNow’s latest observations do not include PM2.5 and cannot measure that smoke"
          : "AirNow has not returned a fresh PM2.5 observation for Frederick";
        return `The MDE notice says wildfire smoke${smokeTiming}${improvement}. ${observation}, so ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
      }
      return `MDE forecasts Code ${summary.levelLabel}${period}. ${action}`;
    }
    if (/hazardous/i.test(copy)) {
      return "The official alert warns of hazardous air. Avoid outdoor activity and follow official guidance.";
    }
    if (/very unhealthy/i.test(copy)) {
      return "The official alert warns of very unhealthy air. Avoid strenuous activity outside.";
    }
    if (/unhealthy for (?:the )?general population/i.test(copy)) {
      return "The official alert warns of unhealthy air. Everyone should avoid prolonged or heavy outdoor activity.";
    }
    return "The official alert warns that air may be unhealthy for sensitive groups. Take it easier outside.";
  }
  return "Keep official alerts on and check the Frederick-specific timing before changing your plans.";
}

function aqiGuidance(categoryId: number): string {
  if (categoryId >= 6) return "Air is hazardous. Avoid outdoor activity and follow official guidance.";
  if (categoryId >= 5) return "Air is very unhealthy for everyone. Avoid strenuous activity outside.";
  if (categoryId >= 4) return "Air is unhealthy. Everyone should avoid prolonged or heavy outdoor activity.";
  return "Air is unhealthy for sensitive groups. Take it easier outside.";
}

function alertEndLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const end = new Date(iso);
  if (!Number.isFinite(end.getTime())) return undefined;
  return `Through ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(end)}`;
}

// ── River display helpers (mirror /rivers so the two surfaces agree) ──
function titleCaseRiver(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Nr|Ab|Bl|At|Md)\b/gi, (m) => m.toUpperCase())
    .replace(/\bOf\b/g, "of");
}
/** "MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD" → "At Jug Bridge near Frederick". */
function riverLocationOf(name: string): string {
  const m = name.match(/\s+(NEAR|AT|ABOVE|BELOW|NR|BL|AB)\s+(.+?)(?:,\s*MD)?$/i);
  if (!m) return "";
  const prefix = m[1].toLowerCase();
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${titleCaseRiver(m[2].trim())}`;
}
/** Group gauges under one waterway, most-gauged river first. */
function groupByRiver(sites: WaterSite[]): Array<{ river: string; sites: WaterSite[] }> {
  const m = new Map<string, WaterSite[]>();
  for (const s of sites) {
    const bucket = m.get(s.river.toUpperCase());
    if (bucket) bucket.push(s);
    else m.set(s.river.toUpperCase(), [s]);
  }
  return [...m.entries()]
    .map(([river, list]) => ({
      river: titleCaseRiver(river),
      sites: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.sites.length - a.sites.length);
}

/**
 * Race a feed against a fallback: resolves to the feed's value, or the
 * fallback if the feed rejects OR is slower than `ms`. Bounds the ~10-feed
 * fanout so one slow/failing upstream can't stall the (ISR) regeneration or
 * blank the dashboard — each tile self-hides on an empty feed.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  // clearTimeout once the race settles so the loser timer doesn't linger ~ms
  // past resolution for every feed on every render.
  return Promise.race([Promise.resolve(p).catch(() => fallback), timeout]).finally(
    () => clearTimeout(timer),
  );
}

/**
 * Like withTimeout, but keeps a failed or timed-out read distinct from a
 * successful empty response. Returning the status with the data avoids
 * mutation from an asynchronous callback during a server render.
 */
function withTimeoutStatus<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<{ data: T; available: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ data: fallback, available: false });
    }, ms);
    Promise.resolve(p).then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ data: v, available: true });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ data: fallback, available: false });
      },
    );
  });
}

export default async function PulsePage() {
  // `?open=<tileKey>` is read by PulseBoard after hydration. Keeping query
  // state out of this server component lets the whole briefing use ISR again
  // instead of regenerating all county feeds for every deep link.
  // Every feed is raced against a 6s timeout + an empty fallback (withTimeout),
  // so one slow or failing upstream can't stall the ISR regeneration or blank
  // the board — each tile self-hides on an empty feed.
  const FEED_MS = 6000;
  const requestNow = new Date();
  const [
    situation,
    roadIntelligence,
    officialSignals,
    fixitResult,
    news,
    press,
    riversResult,
    airports,
    forecast,
    marcBoardResult,
    marcAlerts,
    troutStockings,
    campDavidTfr,
  ] = await Promise.all([
    // Today, Map, Ask, the global status, and Pulse all begin with the same
    // normalized conditions. Only Pulse-exclusive feeds are fetched below.
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot(),
    getOfficialSignalsSnapshot(),
    withTimeoutStatus(getFixItIssues(15), FEED_MS, []),
    // Local headlines from Google News RSS — always-on city signal.
    withTimeout(getLocalHeadlines(), FEED_MS, []),
    // Official City + County press releases (CivicPlus News Flash RSS). The
    // police-lane items get the breaking strip up top + the blotter below.
    withTimeout(getCivicPressReleases(), FEED_MS, []),
    // USGS live gage height + streamflow for county rivers, WITH 24h history
    // (powers the tile's sparklines + rising/falling read + NWS flood gauge).
    // Six hours is ~24 readings per gauge: ample for the eight-reading trend
    // calculation without serializing the full /rivers 24-hour payload here.
    withTimeoutStatus(
      getFrederickWaterSitesWithHistory("PT6H"),
      FEED_MS,
      [] as WaterSite[],
    ),
    // FAA status for BWI / Dulles / Reagan; the tile self-hides when empty.
    withTimeout(getAreaAirportStatus(), FEED_MS, [] as AirportStatus[]),
    // Current conditions for the leading Weather tile (the full panel is its
    // tap-to-open body). Same cached NWS call PulseWeatherPanel makes.
    withTimeout(getNwsForecast(FREDERICK_CENTER), FEED_MS, null),
    // MARC Brunswick Line — the county's commuter rail, schedule-backed with a
    // live delay overlay. The tile head shows the soonest departure; the body
    // is the full per-station board (NextTrainBoard). Complements the live bus
    // map below. Keyless MTA GTFS + GTFS-RT.
    withTimeoutStatus(
      getMarcBoard(requestNow),
      FEED_MS,
      { stations: [], serviceToday: false },
    ),
    withTimeout(getMarcAlerts(), FEED_MS, []),
    // DNR trout stockings in Frederick waters (Carroll Creek included) —
    // near-daily during the spring/fall runs, empty mid-summer. Keyless
    // state JSON API; the tile self-hides out of season.
    withTimeout(getFrederickStockings(14), FEED_MS, []),
    // Camp David airspace (FAA TFR list). Renders ONLY when the P-40 ring is
    // expanded — the quiet explanation for Thurmont's helicopter days.
    withTimeout(getCampDavidTfr(), FEED_MS, null),
  ]);

  const fixit = fixitResult.data;
  const fixitAvailable = fixitResult.available;
  const rivers = riversResult.data;
  const riversAvailable = riversResult.available;
  const marcBoard = marcBoardResult.data;
  const marcBoardAvailable = marcBoardResult.available;
  const marcNow = new Date(situation.generatedAt);
  const sourceIsCurrent = (
    source: { availability: string; freshness: string },
  ) => source.availability === "available" && source.freshness === "fresh";
  const trafficSource = situation.sources.traffic;
  const powerSource = situation.sources.power;
  const schoolsSource = situation.sources.schools;
  const safetySource = situation.sources.fireRescue;
  const weatherSource = situation.sources.weather;
  const airSource = situation.sources.air;
  const trafficAvailable = sourceIsCurrent(trafficSource);
  const powerAvailable = sourceIsCurrent(powerSource);
  const schoolsAvailable = sourceIsCurrent(schoolsSource);
  const safetyState = sourceDisplayState(safetySource);
  const alertsAvailable = sourceIsCurrent(weatherSource);
  const airAvailable = sourceIsCurrent(airSource);
  const urgentDegraded = situation.summary.coverage === "partial";
  const incidentsResult = {
    data: trafficAvailable ? trafficSource.data : [],
    available: trafficAvailable,
    ...(trafficSource.asOf ? { asOf: trafficSource.asOf } : {}),
  };
  const outageResult = {
    data: powerAvailable
      ? powerSource.data
      : { total_out: 0, total_served: 0, munis: [] },
    available: powerAvailable,
    ...(powerSource.asOf ? { asOf: powerSource.asOf } : {}),
  };
  const alertResult = {
    alerts: alertsAvailable ? weatherSource.data : [],
    available: alertsAvailable,
  };
  const incidents = incidentsResult.data;
  const liveIncidentSnapshot = situation.roads.live;
  const liveRoadIncidents = liveIncidentSnapshot.items;
  const corroboratedRoadIncidents = liveRoadIncidents.filter(
    (incident) => incident.status === "corroborated",
  );
  const activeRoadIncidents = corroboratedRoadIncidents.filter(
    (incident) =>
      incident.sources.some(
        (source) =>
          source.source === "frederick-scanner" &&
          source.freshness.state === "fresh",
      ),
  );
  const leadRoadIncident = liveRoadIncidents[0] ?? null;
  const outages = outageResult.data;
  const fcps = schoolsAvailable ? schoolsSource.data : [];
  const safety = sourceIsCurrent(safetySource) ? safetySource.data : [];
  // PulsePoint is a dispatch feed, not a public warning system. Keep every
  // privacy-safe call in the detail tile, but separate routine service calls
  // from notable activity and reserve Pulse alert treatment for clear severe
  // fire, rescue, or hazard types.
  const severeSafety = safety.filter(isPulsePointAlert);
  const notableSafety = safety.filter(
    (incident) => isPulsePointNotable(incident) && !isPulsePointAlert(incident),
  );
  const routineSafety = safety.filter((incident) => !isPulsePointNotable(incident));
  const safetyByPriority = [...severeSafety, ...notableSafety, ...routineSafety];

  // Current weather for the leading dashboard tile. The rich PulseWeatherPanel
  // is the tile's body; here we only need the at-a-glance temp + condition.
  const wxCur = forecast?.hourly?.[0] ?? null;
  const wxCondition = wxCur ? wxCur.shortForecast.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;

  const sevRank = { High: 0, Medium: 1, Low: 2 } as const;
  const traffic = [...incidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity]
  );
  const highTraffic = traffic.filter((incident) => incident.severity === "High");
  const schoolAlerts = currentFcpsOperationsNotices(fcps).filter(
    (alert) => alert.status === "closed" || alert.status === "delayed" || alert.status === "early_dismissal",
  );

  // Power outages are "active" only when 25+ customers are out — below
  // that threshold the data is noise (a single transformer trip).
  const outagesActive = outages.total_out >= 25;
  const outageTone = powerOutageTone(outages.total_out, outages.total_served);
  const outageShare =
    outages.total_served > 0
      ? ((outages.total_out / outages.total_served) * 100).toFixed(2)
      : "0";
  const affectedOutageAreas = [...outages.munis]
    .filter((area) => area.customers_out > 0)
    .sort((a, b) => b.customers_out - a.customers_out);
  const largestOutageArea = affectedOutageAreas[0] ?? null;

  // Only count NWS alerts that haven't already expired. The feed
  // includes alerts with `ends_at` in the past until the cache cycles,
  // so we filter here to avoid double-counting a tornado watch the
  // page still knows about but the weather has moved past.
  const nowMs = marcNow.getTime();
  const activeAlerts = alertResult.alerts
    .filter((a) => !a.ends_at || Date.parse(a.ends_at) > nowMs)
    .sort(compareAlertPriority);
  const officialCivicAlerts = officialSignals.civic.alerts
    .filter(isLocallyRelevantCivicAlert)
    .sort(
      (left, right) =>
        Number(right.kind === "city-emergency") -
        Number(left.kind === "city-emergency"),
    );
  const recentStormReports = officialSignals.stormReports.reports.filter(
    (report) => report.state === "recent",
  );
  const leadOfficialAlert = officialCivicAlerts[0] ?? null;
  const officialAlertShouldLead = Boolean(
    leadOfficialAlert &&
      (leadOfficialAlert.kind === "city-emergency" || !activeAlerts[0]),
  );
  // The shared snapshot has already rejected unavailable or stale AirNow
  // observations. An empty successful read stays distinct from a fresh one and
  // therefore keeps the briefing partial instead of creating a false all-clear.
  const freshAqiObs = airAvailable ? airSource.data : [];
  const aqiWorst = pickWorstAqi(freshAqiObs);
  const aqiActive = aqiWorst ? aqiWorst.category.id >= 3 : false;

  // Only a fresh, urgent police release earns the safety strip. Routine and
  // older releases remain in the standing blotter without alert styling.
  const policeItems = policeReleases(press);
  const breakingPolice = featuredPoliceRelease(policeItems, nowMs);
  const latestPolice = policeItems[0] ?? null;
  const blotter = policeItems
    .filter((p) => p.url !== breakingPolice?.url)
    .slice(0, 5);
  // Planned road work / closures / emergency advisories (distinct from the
  // live MDOT traffic tile). Self-hides when the feeds carry none recent.
  const advisories = advisoryReleases(press).slice(0, 6);
  const roadTravel = selectRoadTravelSummary(roadIntelligence);
  const roadLead = roadIntelligence.attention[0] ?? null;
  const activeWorkZones = roadTravel.workZones.filter(
    (zone) => zone.status === "active",
  );
  const supportingWorkZones = activeWorkZones.filter(
    (zone) => zone.lanes.summary !== "all-lanes-closed",
  );
  const roadTrafficActive = highTraffic.length > 0 || Boolean(roadLead);
  const roadCheckComplete =
    trafficAvailable && roadIntelligence.summary.coverage === "complete";

  // Pulse is active if any trusted urgent category is active. The featured
  // police release must use this SAME model as its breaking strip; otherwise a
  // fresh shooting or missing-person release could sit directly below an
  // "All clear" masthead. We intentionally do not add unlike records into one
  // fake situation total.
  const { heroDegraded, allClear } = pulseStatusState({
    weather: activeAlerts.length > 0 || officialCivicAlerts.length > 0,
    fireRescue: severeSafety.length > 0,
    traffic: roadTrafficActive,
    power: outagesActive,
    schools: schoolAlerts.length > 0,
    air: aqiActive,
    police: Boolean(breakingPolice),
  }, urgentDegraded);

  const leadAlert = activeAlerts[0];
  const leadAirSummary = leadAlert ? summarizeAirQualityAlert(leadAlert) : null;
  const activeAirAlert = activeAlerts.find((alert) => summarizeAirQualityAlert(alert) !== null);
  const activeAirSummary = activeAirAlert ? summarizeAirQualityAlert(activeAirAlert) : null;
  const leadTraffic = highTraffic[0];
  const leadSchool = schoolAlerts[0];
  const leadSafety = severeSafety[0];
  const aqiLeads = Boolean(aqiActive && aqiWorst && shouldAqiLead(aqiWorst.category.id, leadAlert));

  let heroLine = "No major disruptions appear in the checked feeds.";
  let heroSub = "Open any condition below to see its source and latest details.";
  let heroLeadKey: string | undefined;
  let heroLeadMeta: string | undefined;
  let heroActionLabel: string | undefined;
  let heroFacts: PulseHeroFact[] = [];
  let heroTone: PulseHero["tone"] = heroDegraded
    ? "warning"
    : allClear
      ? "positive"
      : "warning";

  if (heroDegraded) {
    heroLine = "The available feeds show no major disruptions.";
    heroSub = "Some live checks are unavailable. Radius will retry them automatically.";
  } else if (aqiLeads && aqiWorst) {
    heroTone = aqiWorst.category.id >= 4 ? "danger" : "warning";
    heroLeadKey = "air";
    heroLine = `${aqiParameterLabel(aqiWorst.parameter).replace(/^./, (c) => c.toUpperCase())} is ${aqiWorst.category.name.toLowerCase()}.`;
    heroSub = aqiGuidance(aqiWorst.category.id);
    heroLeadMeta = `AQI ${aqiWorst.aqi} · observed ${aqiClock(aqiWorst)}`;
    heroActionLabel = "See the air-quality reading";
    heroFacts = [
      { label: "Current AQI", value: String(aqiWorst.aqi), detail: aqiWorst.reportingArea },
      { label: "Category", value: aqiWorst.category.name },
      { label: "Pollutant", value: aqiParameterLabel(aqiWorst.parameter).replace(/^./, (c) => c.toUpperCase()) },
      { label: "Observed", value: aqiClock(aqiWorst) },
    ];
  } else if (officialAlertShouldLead && leadOfficialAlert) {
    heroTone = "warning";
    heroLeadKey = "alerts";
    heroLine = leadOfficialAlert.title;
    heroSub =
      leadOfficialAlert.summary ||
      "Open the official notice for the affected area and current instructions.";
    heroLeadMeta = [
      leadOfficialAlert.scope === "city" ? "City of Frederick" : "Frederick County",
      leadOfficialAlert.publishedAt
        ? timeAgo(leadOfficialAlert.publishedAt)
        : null,
    ].filter(Boolean).join(" · ");
    heroActionLabel = "Read the official notice";
    heroFacts = [
      {
        label: "Publisher",
        value: leadOfficialAlert.provenance.publisher,
      },
      {
        label: "Area",
        value:
          leadOfficialAlert.scope === "city"
            ? "City of Frederick"
            : "Frederick County",
      },
      { label: "Status", value: "Active notice" },
      {
        label: "Published",
        value: leadOfficialAlert.publishedAt
          ? timeAgo(leadOfficialAlert.publishedAt) || "Current notice"
          : "Current notice",
      },
    ];
  } else if (leadAlert) {
    heroTone = pulseAlertPriority(leadAlert) <= 4 ? "danger" : "warning";
    heroLeadKey = "alerts";
    heroLine = leadAirSummary?.levelLabel
      ? `MDE Code ${leadAirSummary.levelLabel} air-quality alert for Frederick County.`
      : `${leadAlert.event} for Frederick County.`;
    heroSub = alertGuidance(leadAlert.event, leadAlert.headline, leadAlert.description, freshAqiObs, marcNow);
    heroLeadMeta = leadAirSummary
      ? [leadAirSummary.forecastPeriod, alertEndLabel(leadAlert.ends_at)].filter(Boolean).join(" · ")
      : alertEndLabel(leadAlert.ends_at);
    heroActionLabel = "Read the Frederick alert";
    heroFacts = [
      { label: "Severity", value: leadAlert.severity },
      { label: "Urgency", value: leadAlert.urgency },
      { label: "Scope", value: "Frederick County" },
      { label: "Timing", value: alertEndLabel(leadAlert.ends_at) || "Active now" },
    ];
  } else if (aqiActive && aqiWorst) {
    heroTone = aqiWorst.category.id >= 4 ? "danger" : "warning";
    heroLeadKey = "air";
    heroLine = `${aqiParameterLabel(aqiWorst.parameter).replace(/^./, (c) => c.toUpperCase())} is ${aqiWorst.category.name.toLowerCase()}.`;
    heroSub = aqiGuidance(aqiWorst.category.id);
    heroLeadMeta = `AQI ${aqiWorst.aqi} · observed ${aqiClock(aqiWorst)}`;
    heroActionLabel = "See the air-quality reading";
    heroFacts = [
      { label: "Current AQI", value: String(aqiWorst.aqi), detail: aqiWorst.reportingArea },
      { label: "Category", value: aqiWorst.category.name },
      { label: "Pollutant", value: aqiParameterLabel(aqiWorst.parameter).replace(/^./, (c) => c.toUpperCase()) },
      { label: "Observed", value: aqiClock(aqiWorst) },
    ];
  } else if (breakingPolice) {
    heroTone = "danger";
    heroLeadKey = "police";
    heroLine = breakingPolice.title;
    heroSub = `${breakingPolice.source} published this update. Read the official release for confirmed details and any instructions.`;
    heroLeadMeta = [breakingPolice.sourceShort, timeAgo(breakingPolice.publishedAt)].filter(Boolean).join(" · ");
    heroActionLabel = "Read the official safety update";
    heroFacts = [
      { label: "Record", value: "Official release" },
      { label: "Publisher", value: breakingPolice.sourceShort },
      { label: "Published", value: timeAgo(breakingPolice.publishedAt) || "Recently" },
      { label: "Area", value: "Frederick" },
    ];
  } else if (outagesActive) {
    heroTone = outageTone;
    heroLeadKey = "power";
    heroLine = `Potomac Edison reports ${outages.total_out.toLocaleString()} customers without power.`;
    heroSub = "Check the affected areas to see whether the outage is near you.";
    heroLeadMeta = "Potomac Edison service area";
    heroActionLabel = "Check affected areas";
    heroFacts = [
      {
        label: "Customers out",
        value: outages.total_out.toLocaleString(),
        detail: `${outageShare}% of ${outages.total_served.toLocaleString()} served`,
      },
      {
        label: "Affected areas",
        value: affectedOutageAreas.length.toLocaleString(),
        detail: "Municipality-level reports",
      },
      {
        label: "Largest report",
        value: largestOutageArea ? titleCaseWords(largestOutageArea.area) : "County total",
        detail: largestOutageArea
          ? `${largestOutageArea.customers_out.toLocaleString()} customers out`
          : undefined,
      },
      {
        label: "Utility update",
        value: outageResult.asOf ? timeAgo(outageResult.asOf) : "Current report",
      },
    ];
  } else if (roadLead) {
    heroLeadKey = "traffic";
    heroTone = roadLead.severity === "emergency" ? "danger" : "warning";
    heroLine = roadLead.title;
    heroSub = roadLead.detail;
    heroLeadMeta = [
      roadLead.scope,
      roadLead.observedAt ? timeAgo(roadLead.observedAt) : null,
    ].filter(Boolean).join(" · ");
    heroActionLabel = "Check the road details";
    heroFacts = [
      { label: "Area", value: roadLead.scope },
      { label: "Status", value: roadLead.severity === "emergency" ? "Emergency" : "Use caution" },
      { label: "Source", value: roadLead.sourceLabel },
      {
        label: "Observed",
        value: roadLead.observedAt
          ? timeAgo(roadLead.observedAt) || "Current report"
          : "Current report",
      },
    ];
  } else if (leadTraffic) {
    heroLeadKey = "traffic";
    // Humanized at the boundary: no raw CHART enum or ramp code reaches the
    // hero. chartHeroSentence adds the local street alias; chartTypeSentence
    // replaces the bare "Special."/"Incident." enum with a plain sentence.
    heroLine = chartHeroSentence(leadTraffic);
    const trafficLanes = leadTraffic.lanes_affected ? humanizeChartText(leadTraffic.lanes_affected) : "";
    heroSub = trafficLanes
      ? `${chartTypeSentence(leadTraffic)} ${trafficLanes}. Check the location before choosing your route.`
      : `${chartTypeSentence(leadTraffic)} Check the incident location before choosing your route.`;
    heroLeadMeta = humanizeChartText(leadTraffic.location);
    heroActionLabel = "Check the road impact";
    heroFacts = [
      {
        label: "Road",
        value: leadTraffic.road || humanizeChartText(leadTraffic.location),
        detail: leadTraffic.direction ? humanizeChartText(leadTraffic.direction) : undefined,
      },
      { label: "Type", value: humanizeChartText(leadTraffic.type) },
      {
        label: "Lane impact",
        value: leadTraffic.lanes_affected
          ? humanizeChartText(leadTraffic.lanes_affected)
          : "Check the incident",
      },
      {
        label: "Reported",
        value: leadTraffic.started_at
          ? timeAgo(leadTraffic.started_at) || "Active now"
          : "Active now",
      },
    ];
  } else if (leadSchool) {
    heroLeadKey = "schools";
    heroLine = leadSchool.status === "closed"
      ? "FCPS posted a school closure update."
      : leadSchool.status === "delayed"
        ? "FCPS posted a delayed-opening update."
        : leadSchool.status === "early_dismissal"
          ? "FCPS posted an early-dismissal update."
          : "FCPS has a schedule update.";
    heroSub = leadSchool.title;
    heroLeadMeta = timeAgo(leadSchool.published_at);
    heroActionLabel = "Read the FCPS update";
    heroFacts = [
      {
        label: "Status",
        value:
          leadSchool.status === "closed"
            ? "Closure update"
            : leadSchool.status === "delayed"
              ? "Delayed opening"
              : "Early dismissal",
      },
      { label: "Published", value: timeAgo(leadSchool.published_at) || "Recently" },
      { label: "System", value: "Frederick County" },
      { label: "Source", value: "FCPS" },
    ];
  } else if (leadSafety) {
    heroLeadKey = "safety";
    heroTone = "danger";
    heroLine = `PulsePoint reports ${severeSafety.length} high-priority fire or rescue ${severeSafety.length === 1 ? "call" : "calls"}.`;
    heroSub = `Most recent: ${leadSafety.type}${leadSafety.address ? ` near ${leadSafety.address}` : ""}.`;
    heroLeadMeta = timeAgo(leadSafety.received_at);
    heroActionLabel = "See active calls";
    heroFacts = [
      { label: "High-priority calls", value: severeSafety.length.toLocaleString() },
      { label: "Latest call", value: leadSafety.type },
      { label: "Location", value: leadSafety.address || "Frederick County" },
      { label: "Received", value: timeAgo(leadSafety.received_at) || "Recently" },
    ];
  }

  // Rivers — group the live gauges and pick a representative reading for
  // the tile peek (the most-gauged river's first reporting gauge). Honest:
  // height + observed time only, never a synthesized flood "stage".
  const riverGroups = groupByRiver(rivers);
  const riverPeekSite = riverGroups[0]?.sites.find((s) => s.gageHeightFt != null);
  const riverPeekDir = riverPeekSite ? readingTrend(riverPeekSite.gageHistory) : null;
  const riverPeek = riverPeekSite
    ? `${riverGroups[0].river} · ${riverPeekSite.gageHeightFt!.toFixed(1)} ft${riverPeekDir ? ` · ${riverPeekDir}` : ""}`
    : undefined;

  // Airports — BWI / Dulles / Reagan. An empty `airports` means the FAA feed
  // was unreachable, so the tile self-hides rather than claim a status we
  // couldn't read; otherwise each airport is "on time" unless the feed lists a
  // delay / ground stop / closure. The peek carries the first delayed airport.
  const airportIssues = airports.filter((a) => a.state !== "clear");
  const airportPeek = airportIssues[0]
    ? `${airportIssues[0].name} ${
        airportIssues[0].state === "closure"
          ? "closed"
          : airportIssues[0].state === "ground_stop"
            ? "ground stop"
            : "delays"
      }`
    : undefined;

  // The dashboard tiles. Each carries an at-a-glance datum + its feed's full
  // detail (`body`), rendered server-side here so the client shell only owns
  // open/close state. Tapping a tile opens the body as a bottom-sheet window;
  // the long stacked sections this replaces are gone. Source attribution
  // lives once, in the footer data-trail below.
  const emptyNote = (text: string) => (
    <p className="px-1 py-6 text-center text-[13px]" style={{ color: "var(--app-ink-3)" }}>
      {text}
    </p>
  );

  // ── Bodies for the civic-feed tiles (News · Police · Road work · Scanner).
  // These reference feeds used to stack as their own text-heavy sections below
  // the board; they now live INSIDE the dashboard as tap-to-open tiles, so the
  // whole page is one unified, visual grid. Built server-side like every tile.
  const newsLead = news[0];
  const newsBody = news.length > 0 ? (
    <div className="space-y-1">
      <a
        href={newsLead.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-[var(--app-radius-md)] px-1 py-2 transition hover:bg-[var(--app-bg-sunken)]"
      >
        <h3 className="font-sans text-[17px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
          {newsLead.title}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>
          {newsLead.source} · {timeAgo(newsLead.published_at)}
        </p>
      </a>
      {news.length > 1 && (
        <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
          {news.slice(1, 6).map((h) => (
            <li
              key={h.url}
              className="border-b last:border-b-0"
              style={{ borderColor: "color-mix(in srgb, var(--app-border) 65%, transparent)" }}
            >
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 px-1 py-2.5 transition hover:bg-[var(--app-bg-sunken)]"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                    {h.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>
                    {h.source} · {timeAgo(h.published_at)}
                  </span>
                </span>
                <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : emptyNote("No local headlines are available right now.");

  const policeBody = (
    <div className="space-y-3">
      {breakingPolice && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
            Featured safety release
          </p>
          <PoliceBlotter items={[breakingPolice]} now={nowMs} />
        </div>
      )}
      {blotter.length > 0 && (
        <div
          className={`space-y-1.5${breakingPolice ? " border-t pt-3" : ""}`}
          style={breakingPolice ? { borderColor: "var(--app-border)" } : undefined}
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            Recent releases
          </p>
          <PoliceBlotter items={blotter} now={nowMs} />
        </div>
      )}
      <div
        className={blotter.length > 0 || breakingPolice ? "space-y-2.5 border-t pt-3" : "space-y-2.5"}
        style={blotter.length > 0 || breakingPolice ? { borderColor: "var(--app-border)" } : undefined}
      >
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Frederick PD also publishes the prior day&apos;s calls for service from its
          CAD system on an official map, updated daily.
        </p>
        <a
          href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)] active:scale-[0.99]"
          style={{ background: "var(--app-cool)" }}
        >
          Open the official CFS map
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </a>
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Calls for service are not confirmed crimes. They reflect requests for
          police response, from the City of Frederick &amp; Frederick County.
        </p>
      </div>
    </div>
  );

  const roadworkBody = advisories.length > 0
    ? <PoliceBlotter items={advisories} now={nowMs} />
    : emptyNote("No road work or closures are reported right now.");

  // MARC — the soonest upcoming departure across the county stations powers
  // the tile head (predicted time when the realtime feed has it, else
  // scheduled); the body is the full per-station board. A service alert tints
  // the tile amber but does NOT roll into the hero "situations" count (a train
  // delay isn't a county emergency), same stance as rivers/airports.
  const marcCandidates = marcBoard.stations.flatMap((sb) =>
    (["eb", "wb"] as const).flatMap((dir) => {
      const d = sb.departures[dir][0];
      return d ? [{ label: d.live && d.predicted ? d.predicted : d.scheduled, dep: d }] : [];
    }),
  );
  marcCandidates.sort((a, b) => marcClockMinutes(a.label) - marcClockMinutes(b.label));
  const marcNext = marcCandidates[0] ?? null;

  // Air quality — the worst pollutant leads (AQI reports the max across
  // parameters). Category 3+ (Unhealthy for Sensitive Groups and worse) tints
  // the tile; Good/Moderate stay a calm cool reading. The category color is
  // AirNow's standard AQI scale (data color, like the flood tones).
  const aqiAccent = !aqiWorst
    ? "var(--app-cool)"
    : aqiWorst.category.id >= 4
      ? "var(--app-danger)"
      : aqiWorst.category.id === 3
        ? "var(--app-warning)"
        : aqiWorst.category.id === 2
          ? "var(--app-accent)"
          : "var(--app-cool)";
  const aqiPollutant = aqiWorst ? aqiParameterLabel(aqiWorst.parameter) : null;
  const aqiPollutantTitle = aqiPollutant?.replace(/^./, (c) => c.toUpperCase()) ?? null;
  const missingAlertObservation = Boolean(
    activeAirSummary?.pollutant
    && !hasObservationForAlert(activeAirSummary, freshAqiObs.map((observation) => observation.parameter)),
  );
  const aqiBody = aqiWorst ? (
    <div className="space-y-3">
      <div
        className="flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <span className="font-mono text-[32px] font-semibold leading-none tabular-nums" style={{ color: aqiWorst.category.color }}>
          {aqiWorst.aqi}
        </span>
        <span className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{aqiWorst.category.name}</span>
          <br />
          {aqiPollutantTitle} · {aqiWorst.reportingArea} · observed {aqiClock(aqiWorst)}
        </span>
      </div>
      {missingAlertObservation && activeAirSummary?.pollutant === "pm25" && (
        <p
          className="rounded-[var(--app-radius-sm)] border px-3 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: "var(--app-warning)", background: "var(--app-warning-tint-6)", color: "var(--app-ink-2)" }}
        >
          The latest AirNow observations do not include PM2.5, so they do not measure the smoke named in the MDE alert.
        </p>
      )}
      {freshAqiObs.length > 1 && (
        <div className="space-y-1.5">
          {freshAqiObs.map((o) => (
            <Row
              key={o.parameter}
              tone={o.category.id >= 4 ? "danger" : o.category.id >= 3 ? "warning" : o.category.id === 2 ? "cool" : "muted"}
              title={aqiParameterLabel(o.parameter).replace(/^./, (c) => c.toUpperCase())}
              body={`AQI ${o.aqi} · ${o.category.name}`}
              meta={[o.reportingArea, `Observed ${aqiClock(o)}`]}
            />
          ))}
        </div>
      )}
      <p className="px-1 text-[10px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Latest preliminary AirNow reporting-area observation. Values are pollutant-specific and update hourly.
      </p>
    </div>
  ) : null;

  // ── Presentation data for the bento board ──────────────────────────
  // The bento shows the numeric feeds as compact count-up stat tiles; the rest
  // as compact status tiles; weather as the wide feature. `attention` marks a
  // tile as one of the hero's active situations so the "Needs attention" filter
  // resolves to exactly those.
  const dailyDay = forecast?.daily?.find((p) => p.isDaytime === true);
  const dailyNight = forecast?.daily?.find((p) => p.isDaytime === false);
  const wxHl =
    [
      dailyDay ? `H ${dailyDay.temperature}°` : null,
      dailyNight ? `L ${dailyNight.temperature}°` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  const aqiShort = (id: number): string =>
    id >= 6 ? "hazardous"
      : id === 5 ? "very unhealthy"
      : id === 4 ? "unhealthy"
      : id === 3 ? "sensitive groups"
      : id === 2 ? "moderate"
      : "good";
  const aqiPct = aqiWorst ? clampPercent((aqiWorst.aqi / 300) * 100) : 0;

  const powerPct = outagesActive ? clampPercent((outages.total_out / 2000) * 100) : 0;
  const unaffectedOutageAreaCount = Math.max(0, outages.munis.length - affectedOutageAreas.length);

  const riverPeekHeight = riverPeekSite?.gageHeightFt ?? null;
  const riverFloodRef = riverPeekSite?.floodStages?.minor ?? null;
  const riverPct =
    riverPeekHeight != null ? clampPercent((riverPeekHeight / (riverFloodRef || 15)) * 100) : 0;

  const fixitPct = clampPercent((fixit.length / 25) * 100);
  const activeOfficialAlertCount =
    activeAlerts.length + officialCivicAlerts.length;
  const leadDisplayedAlert = officialAlertShouldLead
    ? leadOfficialAlert
    : leadAlert ?? leadOfficialAlert;
  const officialAlertsCheckComplete =
    alertResult.available &&
    officialSignals.civic.available &&
    !officialSignals.civic.degraded;
  const officialAlertsDegraded = !officialAlertsCheckComplete;
  const officialAlertsCountLabel = leadDisplayedAlert
    ? "event" in leadDisplayedAlert
      ? leadDisplayedAlert.event
      : leadDisplayedAlert.title
    : recentStormReports.length > 0
      ? `${recentStormReports.length} preliminary ${
          recentStormReports.length === 1 ? "report" : "reports"
        }`
      : officialAlertsCheckComplete
        ? "No current notices"
        : "Check incomplete";
  const officialAlertsPeek = activeOfficialAlertCount > 0
    ? `${activeOfficialAlertCount} current ${
        activeOfficialAlertCount === 1 ? "notice" : "notices"
      }`
    : recentStormReports.length > 0
      ? "Recent observations; not active warnings"
      : officialAlertsCheckComplete
        ? "No current notices in the checked feeds"
        : "At least one official feed could not be checked";
  const officialAlertsAccent = activeAlerts.some(
    (alert) =>
      pulseAlertPriority(alert) <= 5 ||
      alert.severity === "Extreme" ||
      alert.severity === "Severe",
  )
    ? "var(--app-danger)"
    : activeOfficialAlertCount > 0 || officialAlertsDegraded
      ? "var(--app-warning)"
      : "var(--app-cool)";

  const situationActive: Record<string, boolean> = {
    alerts: activeAlerts.length > 0 || officialCivicAlerts.length > 0,
    air: aqiActive,
    safety: severeSafety.length > 0,
    traffic: roadTrafficActive,
    power: outagesActive,
    schools: schoolAlerts.length > 0,
  };

  const pulseTiles: PulseTile[] = [
    // Weather LEADS the board as the wide feature tile: "what's it doing out"
    // is the most-asked live question. Tapping it opens the full conditions +
    // hourly + 7-day panel as its body.
    ...(wxCur
      ? [{
          key: "weather",
          label: "Weather",
          iconName: "CloudSun",
          countLabel: `${wxCur.temperature}°`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "feature",
          feature: {
            temp: wxCur.temperature,
            condition: wxCondition ?? "Frederick",
            hl: wxHl,
          },
          sourceLabel: "NWS · weather.gov",
          body: <PulseWeatherPanel forecast={forecast} aqiObs={freshAqiObs} />,
        } as PulseTile]
      : []),
    // ── Numeric feeds → animated gauge rings ──
    // Air quality: an ambient environmental reading. A missing fresh reading
    // stays visible as an exact degraded tile, so the hero does not need a
    // generic "some feeds" warning with no source or next step.
    ...(aqiWorst
      ? [{
          key: "air",
          label: aqiPollutantTitle ? `Current ${aqiPollutant}` : "Current AQI",
          iconName: "Wind",
          countLabel: aqiObservationLabel(aqiWorst.parameter, aqiWorst.aqi),
          accent: aqiAccent,
          active: aqiActive,
          attention: situationActive.air,
          kind: "gauge",
          gauge: { value: aqiWorst.aqi, pct: aqiPct, unit: `Latest ${aqiPollutant ?? "AQI"} · ${aqiShort(aqiWorst.category.id)}` },
          sourceLabel: "AirNow · EPA",
          body: aqiBody,
        } as PulseTile]
      : [{
          key: "air",
          label: "Air quality",
          iconName: "Wind",
          countLabel: "No fresh reading",
          accent: "var(--app-warning)",
          active: false,
          attention: false,
          degraded: true,
          kind: "status",
          sourceLabel: "AirNow · EPA",
          peek: "No fresh Frederick reading",
          body: (
            <>
              {emptyNote("AirNow did not return a fresh Frederick observation. Radius will check again automatically.")}
              <a
                href="https://www.airnow.gov/?city=Frederick&state=MD&country=USA"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: "var(--app-brand-press)" }}
              >
                Check Frederick on AirNow
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </>
          ),
        } as PulseTile]),
    {
      key: "power",
      label: "Power out",
      iconName: "Zap",
      countLabel: outagesActive
        ? `${outages.total_out.toLocaleString()} out`
        : powerAvailable
          ? "No major outage"
          : "Feed unavailable",
      accent: outagesActive
        ? outageTone === "danger" ? "var(--app-danger)" : "var(--app-warning)"
        : powerAvailable
          ? "var(--app-cool)"
          : "var(--app-warning)",
      active: outagesActive,
      attention: situationActive.power,
      degraded: !powerAvailable,
      kind: "gauge",
      gauge: {
        value: outages.total_out,
        pct: powerPct,
        comma: true,
        unit: outagesActive ? "customers out" : "all served",
      },
      sourceLabel: "Potomac Edison",
      body: outagesActive ? (
        <>
          <div
            className="mb-1 flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
            style={{
              borderColor: "var(--app-border)",
              background: `color-mix(in srgb, ${outageTone === "danger" ? "var(--app-danger)" : "var(--app-warning)"} 6%, var(--app-bg-elevated))`,
            }}
          >
            <span className="font-mono text-[28px] font-semibold leading-none tabular-nums" style={{ color: outageTone === "danger" ? "var(--app-danger)" : "var(--app-warning)" }}>
              {outages.total_out.toLocaleString()}
            </span>
            <span className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              customers without power
              <br />
              {outageShare}% of {outages.total_served.toLocaleString()} served
            </span>
          </div>
          {affectedOutageAreas.map((m) => (
            <Row
              key={m.area}
              tone={m.customers_out > 500 ? "danger" : "warning"}
              title={m.area}
              body={`${m.customers_out.toLocaleString()} out of ${m.customers_served.toLocaleString()} (${m.percentage.toFixed(1)}%)`}
            />
          ))}
          {unaffectedOutageAreaCount > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              No outage was reported in {unaffectedOutageAreaCount} other listed {unaffectedOutageAreaCount === 1 ? "area" : "areas"}.
            </p>
          ) : null}
          <a
            href="https://outages-mdwv.firstenergycorp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Open the official outage map
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </>
      ) : emptyNote(
        powerAvailable
          ? "No significant power outages are reported right now."
          : "Potomac Edison outage data could not be loaded right now.",
      ),
    },
    // ── The rest → compact status tiles ──
    {
      key: "safety",
      label: "Fire & rescue",
      iconName: "Siren",
      countLabel: safety.length > 0
        ? `${safety.length} active`
        : safetyState === "current"
          ? "No active calls reported"
          : safetyState === "disabled"
            ? "Not connected"
            : "Feed unavailable",
      accent: severeSafety.length > 0
        ? "var(--app-danger)"
        : notableSafety.length > 0
          ? "var(--app-warning)"
          : "var(--app-cool)",
      active: severeSafety.length > 0,
      attention: situationActive.safety,
      degraded: safetyState === "unavailable",
      availability:
        safetyState === "current"
          ? "current"
          : safetyState === "disabled"
            ? "not-connected"
            : "unavailable",
      kind: "status",
      sourceLabel: "PulsePoint",
      peek: safety.length > 0
        ? safetyByPriority[0].type
        : safetyState === "current"
          ? "no active calls reported"
          : safetyState === "disabled"
            ? "PulsePoint is not connected"
            : "PulsePoint could not be reached",
      body: safety.length > 0
        ? safetyByPriority.slice(0, 12).map((s) => (
            <Row
              key={s.id}
              tone={s.severity === "severe" ? "danger" : s.severity === "notable" ? "warning" : "muted"}
              title={s.type}
              meta={[s.address, timeAgo(s.received_at)]}
            />
          ))
        : emptyNote(
            safetyState === "current"
              ? "No active fire or rescue calls are reported right now."
              : safetyState === "disabled"
                ? "PulsePoint is not connected to Radius right now."
                : "PulsePoint reports could not be loaded right now.",
          ),
    },
    {
      key: "traffic",
      label: "Traffic",
      iconName: "Construction",
      countLabel: roadLead
        ? roadLead.title
        : traffic.length > 0
        ? `${traffic.length} ${traffic.length === 1 ? "incident" : "incidents"}`
        : activeWorkZones.length > 0
          ? `${activeWorkZones.length} active ${activeWorkZones.length === 1 ? "work zone" : "work zones"}`
          : roadCheckComplete
            ? "No major impact"
            : "Check incomplete",
      accent: roadTrafficActive || !roadCheckComplete ? "var(--app-warning)" : "var(--app-cool)",
      active: roadTrafficActive,
      attention: situationActive.traffic,
      degraded: !roadCheckComplete,
      kind: "status",
      sourceLabel: "MDOT CHART + Maryland WZDx",
      peek:
        roadLead
          ? `${roadLead.scope} · ${roadLead.detail}`
          : traffic.length > 0
          ? `${traffic[0].road || traffic[0].location}${traffic[0].direction ? ` ${traffic[0].direction}` : ""} · ${traffic[0].type}`
          : activeWorkZones.length > 0
            ? `${activeWorkZones.length} official work ${activeWorkZones.length === 1 ? "zone" : "zones"} in Frederick County`
            : roadCheckComplete
              ? "No major road impact appears in the checked feeds"
              : "At least one official road feed could not be checked",
      body:
        roadIntelligence.attention.length > 0 ||
        supportingWorkZones.length > 0 ||
        traffic.length > 0
          ? (
            <>
              {roadIntelligence.attention.slice(0, 5).map((signal) => (
                <Row
                  key={signal.id}
                  tone={signal.severity === "emergency" ? "danger" : "warning"}
                  title={signal.title}
                  body={signal.detail}
                  meta={[
                    signal.scope,
                    signal.observedAt ? timeAgo(signal.observedAt) : undefined,
                    signal.sourceLabel,
                  ]}
                />
              ))}
              {supportingWorkZones.slice(0, 6).map((zone) => (
                <Row
                  key={`work-zone-${zone.id}`}
                  tone={zone.lanes.summary === "some-lanes-closed" ? "warning" : "muted"}
                  title={`${zone.road} · ${zone.status === "active" ? "Active road work" : "Scheduled road work"}`}
                  body={zone.description}
                  meta={[
                    zone.lanes.summary === "some-lanes-closed"
                      ? zone.lanes.closed > 0
                        ? `${zone.lanes.closed} ${zone.lanes.closed === 1 ? "lane" : "lanes"} closed`
                        : "Lane closure"
                      : "No lane closure reported",
                    zone.direction,
                    zone.endAt
                      ? `Through ${new Date(zone.endAt).toLocaleString("en-US", {
                          timeZone: "America/New_York",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                        })}`
                      : undefined,
                  ]}
                />
              ))}
              {traffic.slice(0, 12).map((i) => (
            <Row
              key={i.id}
              tone={i.severity === "High" ? "danger" : i.severity === "Medium" ? "warning" : "muted"}
              title={`${i.road || i.location}${i.direction ? ` ${i.direction}` : ""} · ${i.type}`}
              body={i.description}
              meta={[
                i.location.trim().toLocaleLowerCase() !== i.description.trim().toLocaleLowerCase()
                  ? i.location
                  : undefined,
                i.lanes_affected,
                i.expected_end
                  ? `Clears ~${new Date(i.expected_end).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric" })}`
                  : undefined,
              ]}
            />
              ))}
            </>
          )
          : emptyNote(
              roadCheckComplete
                ? "The official feeds report no major traffic incident, severe road condition, or active work-zone closure in Frederick County."
                : "At least one official road feed could not be checked. Open MDOT CHART before relying on this result.",
            ),
    },
    {
      key: "schools",
      label: "Schools",
      iconName: "School",
      countLabel: schoolAlerts.length > 0
        ? `${schoolAlerts.length} ${schoolAlerts.length === 1 ? "alert" : "alerts"}`
        : schoolsAvailable
          ? "No closure or delay"
          : "Feed unavailable",
      accent: schoolAlerts.length > 0 || !schoolsAvailable ? "var(--app-warning)" : "var(--app-cool)",
      active: schoolAlerts.length > 0,
      attention: situationActive.schools,
      degraded: !schoolsAvailable,
      kind: "status",
      sourceLabel: "FCPS RSS",
      peek:
        schoolAlerts.length > 0
          ? schoolAlerts[0].status === "closed"
            ? "Schools closed"
            : schoolAlerts[0].status === "delayed"
              ? "Delayed opening"
              : schoolAlerts[0].status === "early_dismissal"
                ? "Early dismissal"
                : "Update"
          : schoolsAvailable
            ? "no alerts today"
            : "FCPS could not be reached",
      body: schoolAlerts.length > 0
        ? schoolAlerts.map((a) => (
            <Row
              key={a.id}
              tone={a.status === "closed" ? "danger" : a.status === "open" ? "muted" : "warning"}
              title={
                a.status === "closed" ? "Schools closed"
                  : a.status === "delayed" ? "Delayed opening"
                  : a.status === "early_dismissal" ? "Early dismissal"
                  : "Update"
              }
              body={a.title}
              meta={[timeAgo(a.published_at)]}
            />
          ))
        : emptyNote(
            schoolsAvailable
              ? "No school closures or delays are reported right now."
              : "FCPS closure and delay data could not be loaded right now.",
          ),
    },
    {
      key: "fixit",
      label: "311 reports",
      iconName: "AlertTriangle",
      countLabel: fixit.length > 0
        ? `${fixit.length} open`
        : fixitAvailable
          ? "No open reports"
          : "Reports unavailable",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      availability: fixitAvailable ? "current" : "unavailable",
      kind: "gauge",
      gauge: { value: fixit.length, pct: fixitPct, unit: "open reports" },
      sourceLabel: "FCG FixIT · SeeClickFix",
      body: fixit.length > 0
        ? fixit.slice(0, 10).map((i) => (
            <Row
              key={i.id}
              tone={i.status === "closed" ? "muted" : "cool"}
              title={i.summary}
              body={i.category && i.category !== i.summary ? i.category : undefined}
              // FCG FixIt can include a resident's exact street address. Pulse
              // is a countywide situation board, not a request-level map, so
              // the public row keeps only time and status. The official source
              // remains available below for anyone who needs the full record.
              meta={[timeAgo(i.reported_at), i.status]}
            />
          ))
        : emptyNote(
            fixitAvailable
              ? "No open 311 reports are listed right now."
              : "FCG FixIT reports could not be loaded right now.",
          ),
    },
    {
      key: "alerts",
      label: "Official alerts",
      iconName: "CloudAlert",
      countLabel: officialAlertsCountLabel,
      accent: officialAlertsAccent,
      active: activeOfficialAlertCount > 0,
      attention: situationActive.alerts,
      degraded: officialAlertsDegraded,
      kind: "status",
      sourceLabel: "NWS + City + County",
      peek: officialAlertsPeek,
      body: (
        <div className="space-y-4">
          {activeAlerts.length > 0 && (
            <section aria-labelledby="pulse-weather-alerts-heading" className="space-y-3">
              <p
                id="pulse-weather-alerts-heading"
                className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Weather alerts
              </p>
              {activeAlerts.slice(0, 6).map((alert) => {
                const priority = pulseAlertPriority(alert);
                const tone =
                  priority <= 5 ||
                  alert.severity === "Extreme" ||
                  alert.severity === "Severe"
                    ? "danger"
                    : priority === 6 || alert.severity === "Moderate"
                      ? "warning"
                      : "cool";
                return (
                  <div key={alert.id} className="space-y-1.5">
                    <Row
                      tone={tone}
                      title={alert.event}
                      body={alertGuidance(
                        alert.event,
                        alert.headline,
                        alert.description,
                        freshAqiObs,
                        marcNow,
                      )}
                      meta={["Frederick County", alertEndLabel(alert.ends_at)]}
                    />
                    <a
                      href={alert.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 px-1 text-[11px] font-semibold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      Read the NWS alert
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </div>
                );
              })}
            </section>
          )}

          {officialCivicAlerts.length > 0 && (
            <section
              aria-labelledby="pulse-civic-alerts-heading"
              className={`${activeAlerts.length > 0 ? "border-t pt-4" : ""} space-y-3`}
              style={
                activeAlerts.length > 0
                  ? { borderColor: "var(--app-border)" }
                  : undefined
              }
            >
              <p
                id="pulse-civic-alerts-heading"
                className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                City and County notices
              </p>
              {officialCivicAlerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="space-y-1.5">
                  <Row
                    tone={alert.kind === "city-emergency" ? "danger" : "warning"}
                    title={alert.title}
                    body={
                      alert.summary ||
                      "Open the official notice for current instructions."
                    }
                    meta={[
                      alert.scope === "city"
                        ? "City of Frederick"
                        : "Frederick County",
                      alert.publishedAt
                        ? timeAgo(alert.publishedAt)
                        : undefined,
                    ]}
                  />
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 px-1 text-[11px] font-semibold"
                    style={{ color: "var(--app-cool)" }}
                  >
                    Read the official notice
                    <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </section>
          )}

          {recentStormReports.length > 0 && (
            <section
              aria-labelledby="pulse-storm-reports-heading"
              className={`${
                activeOfficialAlertCount > 0 ? "border-t pt-4" : ""
              } space-y-3`}
              style={
                activeOfficialAlertCount > 0
                  ? { borderColor: "var(--app-border)" }
                  : undefined
              }
            >
              <div className="space-y-1 px-1">
                <p
                  id="pulse-storm-reports-heading"
                  className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Recent storm reports
                </p>
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  These are preliminary observations published by NWS. They are
                  not active warnings.
                </p>
              </div>
              {recentStormReports.slice(0, 6).map((report) => (
                <div key={report.id} className="space-y-1.5">
                  <Row
                    tone="muted"
                    title={report.event}
                    body={report.summary}
                    meta={[
                      report.location,
                      report.magnitude || undefined,
                      report.occurredAt
                        ? timeAgo(report.occurredAt)
                        : undefined,
                    ]}
                  />
                  <a
                    href={report.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 px-1 text-[11px] font-semibold"
                    style={{ color: "var(--app-cool)" }}
                  >
                    Open the NWS report
                    <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </section>
          )}

          {activeOfficialAlertCount === 0 &&
            recentStormReports.length === 0 &&
            emptyNote(
              officialAlertsCheckComplete
                ? "No current notice appears in the official feeds Radius checked."
                : "At least one official alert feed could not be checked. Open weather.gov or the City and County alert pages before relying on this result.",
            )}

          {officialAlertsDegraded &&
            (activeOfficialAlertCount > 0 ||
              recentStormReports.length > 0) && (
              <p
                className="rounded-[var(--app-radius-sm)] border px-3 py-2 text-[11px] leading-relaxed"
                style={{
                  borderColor: "var(--app-warning)",
                  background: "var(--app-warning-tint-6)",
                  color: "var(--app-ink-2)",
                }}
              >
                At least one official alert feed could not be checked. The
                notices shown here may not be complete.
              </p>
            )}
        </div>
      ),
    },
    {
      // Rivers is live county data (rising water), not an alert — it stays a
      // calm cool tile (active:false): no accent band, no "situation" count
      // in the hero roll-up. The peek carries a representative gage reading
      // so a glance gets the water level; the window lists every gauge by
      // river with height + streamflow + observed-ago, and links to the full
      // /rivers dashboard for 24-hour trends + the map.
      key: "rivers",
      label: riverPeekHeight != null ? (riverGroups[0]?.river ?? "River") : "Rivers",
      iconName: "Waves",
      countLabel: rivers.length > 0
        ? `${rivers.length} ${rivers.length === 1 ? "gauge" : "gauges"}`
        : "No data",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      availability: riversAvailable ? "current" : "unavailable",
      kind: riverPeekHeight != null ? "gauge" : "status",
      ...(riverPeekHeight != null
        ? {
            gauge: {
              value: riverPeekHeight,
              pct: riverPct,
              decimals: 1,
              unit: `ft · ${riverPeekDir ?? "steady"}`,
            },
          }
        : { peek: riverPeek }),
      sourceLabel: "USGS Water Services",
      body: rivers.length > 0
        ? (
          <div className="space-y-4">
            {riverGroups.map((g) => (
              <div key={g.river} className="space-y-2">
                <p className="flex items-baseline gap-1.5 px-0.5">
                  <span className="font-sans text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {g.river}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {g.sites.length} {g.sites.length === 1 ? "gauge" : "gauges"}
                  </span>
                </p>
                <ul className="space-y-2.5">
                  {g.sites.map((s) => {
                    const hasHeight = s.gageHeightFt != null;
                    const dir = readingTrend(s.gageHistory) ?? readingTrend(s.streamflowHistory);
                    const flood = classifyFlood(s.gageHeightFt, s.floodStages);
                    const trendTone: "neutral" | "good" | "warning" =
                      dir === "rising" ? "warning" : dir === "falling" ? "good" : "neutral";
                    const trendLabel =
                      dir === "rising" ? "Rising" : dir === "falling" ? "Falling" : dir === "steady" ? "Steady" : "Current";
                    // A flood category (action+) outranks the trend on the pill —
                    // on a water board, "how close to flooding" beats "rising".
                    const status: { label: string; tone: "neutral" | "good" | "warning" | "danger" } =
                      flood && flood.key !== "normal"
                        ? { label: flood.label, tone: flood.tone === "danger" ? "danger" : "warning" }
                        : { label: trendLabel, tone: trendTone };
                    const value = hasHeight ? s.gageHeightFt!.toFixed(2) : (s.streamflowCfs ?? 0).toLocaleString();
                    const unit = hasHeight ? "ft" : "ft³/s";
                    const trend = hasHeight ? s.gageHistory?.map((r) => r.value) : s.streamflowHistory?.map((r) => r.value);
                    const secondary = hasHeight && s.streamflowCfs != null
                      ? `Flow ${s.streamflowCfs.toLocaleString()} ft³/s`
                      : null;
                    const ago = s.observedAt ? timeAgo(s.observedAt) : "";
                    return (
                      <li key={s.id}>
                        <MetricCard
                          title={riverLocationOf(s.name) || titleCaseRiver(s.name)}
                          value={value}
                          unit={unit}
                          trend={trend}
                          animatedTrend
                          accent="var(--app-cool)"
                          trendStroke="var(--app-cool)"
                          status={status}
                          meta={
                            ago || secondary ? (
                              <>
                                {ago}
                                {ago && secondary && <span className="mx-1.5 opacity-50">·</span>}
                                {secondary}
                              </>
                            ) : undefined
                          }
                          footer={
                            flood && s.floodStages && s.gageHeightFt != null ? (
                              <FloodGauge current={s.gageHeightFt} stages={s.floodStages} category={flood} animated />
                            ) : undefined
                          }
                          href={
                            s.floodStages
                              ? nwsGaugeUrl(s.floodStages.nws)
                              : `https://waterdata.usgs.gov/monitoring-location/${s.id}/`
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <Link
              href="/rivers"
              className="inline-flex items-center gap-1 px-1 pt-1 text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              See 24-hour trends and the gauge map
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
            <Link
              href="/map?show=roads"
              className="inline-flex items-center gap-1 px-1 text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              See County-mapped high-water context
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
            <p className="px-1 pt-0.5 text-[10px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Gauge readings are live. The high-water map is static risk
              context and does not report current flooding.
            </p>
          </div>
        )
        : emptyNote("River gauge readings are briefly unavailable."),
    },
    ...(airports.length > 0
      ? [{
          // BWI / Dulles / Reagan. The accent goes amber + the tile tints only
          // when there's an actual delay; an "on time" day stays a calm cool
          // tile. Not part of the hero situation roll-up (a flight delay isn't
          // a county emergency) — the peek names the delayed airport.
          key: "airports",
          label: "Airports",
          iconName: "Plane",
          countLabel: airportIssues.length > 0 ? `${airportIssues.length} delayed` : "On time",
          accent: airportIssues.length > 0 ? "var(--app-warning)" : "var(--app-cool)",
          active: airportIssues.length > 0,
          attention: false,
          kind: "status",
          sourceLabel: "FAA",
          peek: airportPeek ?? "BWI · IAD · DCA",
          body: (
            <div className="space-y-1.5">
              {airports.map((a) => (
                <Row
                  key={a.code}
                  tone={
                    a.state === "closure" || a.state === "ground_stop"
                      ? "danger"
                      : a.state === "delay"
                        ? "warning"
                        : "muted"
                  }
                  title={a.name}
                  meta={[a.code, a.state === "clear" ? "On time" : a.detail ?? a.state.replace("_", " ")]}
                />
              ))}
            </div>
          ),
        } as PulseTile]
      : []),
    // MARC Brunswick Line — the county's commuter rail, beside the live bus map.
    // Calm cool tile (informational transit, not a hero "situation"); a service
    // alert tints it amber. The head shows the soonest departure, the body the
    // full per-station board. On weekends/after the last train it reads honestly.
    {
      key: "train",
      label: "MARC trains",
      iconName: "TrainFront",
      countLabel: !marcBoard.serviceToday ? "No service" : marcNext ? marcNext.label : "Done today",
      accent: marcAlerts.length > 0 ? "var(--app-warning)" : "var(--app-cool)",
      active: marcAlerts.length > 0,
      attention: false,
      degraded: !marcBoardAvailable,
      kind: "status",
      sourceLabel: "MTA MARC · Brunswick Line",
      peek: marcAlerts.length > 0
        ? marcAlerts[0].header || "Service alert"
        : marcNext
          ? `to ${marcNext.dep.headsign}`
          : marcBoard.serviceToday
            ? "Brunswick Line"
            : undefined,
      body: <NextTrainBoard board={marcBoard} alerts={marcAlerts} />,
    },
    // Trout stockings — seasonal, self-hides mid-summer. Frederick's waters
    // (Carroll Creek included) get near-daily drops in the spring/fall runs.
    ...(troutStockings.length > 0
      ? [{
          key: "trout",
          label: "Trout stocking",
          iconName: "Fish",
          countLabel: `${troutStockings.length} recent`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "status",
          sourceLabel: "Maryland DNR",
          peek: `${troutStockings[0].location} · ${troutStockings[0].species}`,
          body: troutStockings.map((t) => (
            <Row
              key={`${t.location}-${t.date}`}
              tone="cool"
              title={t.location}
              meta={[
                `${t.fish} ${t.species}`,
                new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(t.date)),
                t.regulations,
              ]}
            />
          )),
        } as PulseTile]
      : []),
    // Camp David airspace — renders ONLY while the P-40 ring is expanded.
    ...(campDavidTfr
      ? [{
          key: "airspace",
          label: "Camp David airspace",
          iconName: "Plane",
          countLabel: "Expanded",
          accent: "var(--app-warning)",
          active: true,
          attention: false,
          kind: "status",
          sourceLabel: "FAA TFR",
          peek: "Restrictions widened over Thurmont",
          body: (
            <p className="px-1 py-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              The FAA has expanded the flight-restriction ring around Camp David
              (NOTAM {campDavidTfr.notamId}). Expect helicopters and extra
              activity around Thurmont and Catoctin Mountain Park.
            </p>
          ),
        } as PulseTile]
      : []),
    // ── Reference feeds, first-class status tiles (were stacked text sections).
    {
      key: "news",
      label: "In the news",
      iconName: "Newspaper",
      countLabel: news.length > 0 ? `${news.length} ${news.length === 1 ? "story" : "stories"}` : "No stories loaded",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      degraded: news.length === 0,
      kind: "status",
      sourceLabel: "Google News · Frederick County",
      peek: news[0]?.title,
      body: newsBody,
    },
    {
      key: "police",
      label: "Police & safety",
      iconName: "Shield",
      countLabel: breakingPolice
        ? "Breaking release"
        : blotter.length > 0
          ? `${blotter.length} ${blotter.length === 1 ? "release" : "releases"}`
          : "CFS map",
      accent: "var(--app-cool)",
      active: Boolean(breakingPolice),
      // The dedicated breaking strip already keeps this release prominent.
      // Do not duplicate it in the board's "Happening now" row when another
      // higher-priority signal owns the masthead.
      attention: false,
      kind: "status",
      sourceLabel: "Frederick PD · City + County",
      peek: breakingPolice?.title ?? latestPolice?.title,
      body: policeBody,
    },
    ...(advisories.length > 0
      ? [{
          key: "roadwork",
          label: "Road work",
          iconName: "TrafficCone",
          countLabel: `${advisories.length} ${advisories.length === 1 ? "advisory" : "advisories"}`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "status",
          sourceLabel: "City + County advisories",
          peek: advisories[0]?.title,
          body: roadworkBody,
        } as PulseTile]
      : []),
    {
      key: "scanner",
      label: "Road incidents",
      iconName: "Radio",
      countLabel:
        liveIncidentSnapshot.totalCount > 0
          ? `${liveIncidentSnapshot.totalCount} ${
              liveIncidentSnapshot.totalCount === 1 ? "public report" : "public reports"
            }`
          : "No road reports to map",
      accent: "var(--app-cool)",
      active: activeRoadIncidents.length > 0,
      attention: false,
      availability:
        liveIncidentSnapshot.scannerAvailable === false
          ? "unavailable"
          : liveIncidentSnapshot.chartAvailable
            ? "current"
            : "partial",
      kind: "status",
      sourceLabel: "Frederick Scanner + MDOT CHART",
      peek: leadRoadIncident
        ? `${leadRoadIncident.kind} · ${leadRoadIncident.location}`
        : liveIncidentSnapshot.chartAvailable
          ? "The latest public response has no road report with a safe map location"
          : "MDOT road context is unavailable",
      body: <ScannerTimeline initial={liveIncidentSnapshot} />,
    },
  ];

  // ── Hero + ticker for the board ──────────────────────────────────
  const hero: PulseHero = {
    allClear,
    degraded: heroDegraded,
    tone: heroTone,
    line: heroLine,
    sub: heroSub,
    renderedAt: nowMs,
    facts: heroFacts,
    leadKey: heroLeadKey,
    leadMeta: heroLeadMeta,
    actionLabel: heroActionLabel,
  };

  // Supporting facts only: the lead issue is already fully explained in the
  // hero and must not appear again as a duplicate chip.
  const heroChips: PulseHeroChip[] = [];
  const addHeroChip = (chip: PulseHeroChip) => {
    if (chip.key === heroLeadKey || heroChips.some((item) => item.key === chip.key)) return;
    heroChips.push(chip);
  };
  if (!allClear) {
    // Active mode = the Active alerts ledger. Only live situations here; the
    // "No X reported" positives are dropped so the reader never has to sort
    // good news from bad in one list (they return in the all-clear branch).
    if (leadAlert && heroLeadKey !== "alerts" && !/air quality|smoke|ozone/i.test(`${leadAlert.event} ${leadAlert.description}`)) {
      addHeroChip({
        tone: pulseAlertPriority(leadAlert) <= 4 ? "danger" : "warning",
        label: leadAlert.event,
        key: "alerts",
        meta: alertEndLabel(leadAlert.ends_at) || undefined,
      });
    }
    if (aqiWorst && (aqiActive || Boolean(activeAirSummary))) {
      addHeroChip({
        tone: aqiWorst.category.id >= 4 ? "danger" : aqiWorst.category.id >= 3 ? "warning" : "cool",
        label: `${aqiObservationLabel(aqiWorst.parameter, aqiWorst.aqi)} · ${aqiClock(aqiWorst)}`,
        key: "air",
      });
    }
    if (outagesActive) {
      addHeroChip({ tone: outageTone, label: `${outages.total_out.toLocaleString()} without power`, key: "power", meta: "Potomac Edison area" });
    }
    if (roadLead) {
      addHeroChip({
        tone: roadLead.severity === "emergency" ? "danger" : "warning",
        label: roadLead.title,
        key: "traffic",
        meta: roadLead.scope,
      });
    } else if (leadTraffic) {
      addHeroChip({
        tone: "warning",
        label: chartTodayTitle(leadTraffic),
        key: "traffic",
        meta: chartFreshnessTail(leadTraffic, new Date(nowMs)),
      });
    }
    if (leadSafety) {
      addHeroChip({ tone: "danger", label: leadSafety.type, key: "safety" });
    }
    if (leadSchool) {
      addHeroChip({
        tone: "warning",
        label: leadSchool.status === "closed" ? "Schools closed" : leadSchool.status === "delayed" ? "Schools delayed" : "School update",
        key: "schools",
      });
    }
  } else {
    if (wxCur) {
      addHeroChip({ tone: "cool", label: `${wxCur.temperature}°${wxCondition ? ` ${wxCondition}` : ""}`, key: "weather" });
    }
    if (aqiWorst && aqiWorst.category.id <= 2) {
      addHeroChip({ tone: "cool", label: `Air ${aqiWorst.category.name.toLowerCase()}`, key: "air" });
    }
  }
  const heroChipsCapped = heroChips.slice(0, 4);

  return (
    <div className="relative min-w-0 space-y-6 pb-4">
      <PageBloom variant="cool" />

      {/* The briefing owns hierarchy and interaction; detail remains in sourced
          drawers so the first screen stays useful at a glance. */}
      <PulseBoard
        hero={hero}
        chips={heroChipsCapped}
        tiles={pulseTiles}
        breaking={breakingPolice ? <PoliceBreakingStrip item={breakingPolice} now={nowMs} /> : undefined}
      />

      {/* The live bus tools stay behind intent because they are the heaviest
          client surface on Pulse — part of getting around, not a second
          dashboard. The reveal button IS the section: the old "Buses right now"
          h2 with a pulsing dot duplicated the button and implied liveness
          before anything had polled, so it was removed (owner: the bus section
          "feels messy and hard to see everything"). */}
      <BusesReveal />
      {/* AppFooter carries the sitewide emergency/use disclaimer once. Pulse
          keeps only its source trail here so mobile users do not read the same
          legal guidance twice in succession. */}
      <footer
        className="min-w-0 border-t px-1 text-[11px]"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink-3)",
        }}
      >
        <details className="group pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Sources &amp; data trail
          </summary>
          <div className="grid min-w-0 grid-cols-1 gap-x-4 pb-1 pt-1 sm:grid-cols-2">
            <SourceLine label="Weather alerts" source="NWS · weather.gov" href="https://www.weather.gov/" />
            <SourceLine label="City alerts" source="City of Frederick" href="https://www.cityoffrederickmd.gov/AlertCenter.aspx?CID=City-Emergencies-4" />
            <SourceLine label="County health alerts" source="Frederick County Health Department" href="https://health.frederickcountymd.gov/AlertCenter.aspx" />
            <SourceLine label="Storm observations" source="NWS Baltimore/Washington" href="https://www.weather.gov/lwx/" />
            <SourceLine label="Fire & rescue" source="PulsePoint" href="https://web.pulsepoint.org/" />
            <SourceLine label="Traffic" source="MDOT CHART" href="https://chart.maryland.gov/" />
            <SourceLine label="Power" source="FirstEnergy" href="https://outages-mdwv.firstenergycorp.com/" />
            <SourceLine label="Schools" source="FCPS RSS" href="https://www.fcps.org/" />
            <SourceLine label="MARC trains" source="MTA Maryland" href="https://www.mta.maryland.gov/schedule/marc" />
            <SourceLine label="Air quality" source="AirNow · EPA" href="https://www.airnow.gov/" />
            <SourceLine label="311 reports" source="FCG FixIT · SeeClickFix" href="https://www.frederickcountymd.gov/8235/FCG-FixIT" />
            <SourceLine label="News" source="Google News · Frederick" href="https://news.google.com/search?q=Frederick%20County%20Maryland" />
            <SourceLine label="Police" source="Frederick PD" href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map" />
          </div>
        </details>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Components
 * ───────────────────────────────────────────────────────────── */

function Row({
  title, body, meta, tone,
}: {
  title: string;
  body?: string;
  meta?: (string | undefined)[];
  tone: "danger" | "warning" | "cool" | "muted";
}) {
  const dot =
    tone === "danger" ? "var(--app-danger)"
      : tone === "warning" ? "var(--app-warning)"
      : tone === "cool" ? "var(--app-cool)"
      : "var(--app-ink-3)";
  const metas = (meta ?? []).filter(Boolean) as string[];
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
      }}
    >
      {/* Vertical severity bar — taller than the previous dot so the
          tone is felt without reading the text. */}
      <span
        className="mt-0.5 h-full min-h-[1.75rem] w-[3px] shrink-0 rounded-full"
        style={{ background: dot }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </p>
        {body && (
          <p
            className="mt-0.5 line-clamp-2 text-[12px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            {body}
          </p>
        )}
        {metas.length > 0 && (
          <p
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {metas.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function SourceLine({
  label,
  source,
  href,
}: {
  label: string;
  source: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label} source: ${source} (opens in a new tab)`}
      className="flex min-h-11 min-w-0 w-full items-center gap-1.5 rounded-sm px-1 underline-offset-2 transition hover:bg-[var(--app-bg-sunken)] focus-visible:underline"
      style={{ color: "var(--app-ink-3)" }}
    >
      <span
        className="shrink-0 font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--app-ink-2)" }}
      >
        {label}
      </span>
      <span>·</span>
      <span className="min-w-0 truncate" style={{ color: "var(--app-cool)" }}>
        {source}
      </span>
      <ExternalLink className="ml-auto h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
    </a>
  );
}
