import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  airQualityObservedAt,
  getAirQuality,
  isFreshAqiObservation,
  type AqiObservation,
} from "@/lib/integrations/airnow";
import {
  getFcpsAlertsResult,
  isCurrentFcpsNotice,
  type FcpsAlertsResult,
} from "@/lib/integrations/fcps";
import {
  getFrederickOutagesResult,
  type FrederickOutagesResult,
} from "@/lib/integrations/firstenergy";
import {
  getChartIncidentsFrederickResult,
  type ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import {
  getNwsAlertsResult,
  type NwsAlertsResult,
} from "@/lib/integrations/nws-alerts";
import {
  getPulsePointIncidentsResult,
  type PulsePointIncidentsResult,
} from "@/lib/integrations/pulsepoint";
import {
  getGeocodedScannerIncidentsResult,
  type GeocodedScannerIncidentsResult,
} from "@/lib/integrations/scannerIncidents";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { createVerifiedSourceReader } from "./verifiedSourceReader";
import { FREDERICK_CENTER } from "@/lib/geo";
import {
  buildCurrentSituationSnapshot,
  sourceEnvelope,
  type CurrentSituationSnapshot,
} from "@/lib/live/currentSituationModel";
import { fuseScannerWithChartIncidents } from "@/lib/live/incidentFusion";
import { SCANNER_SOURCE_CHECK_MAX_AGE_MS } from "@/lib/live/incidentFreshness";
import { NWS_ALERTS_FUTURE_TOLERANCE_MS, NWS_ALERTS_MAX_CHECK_AGE_MS } from "@/lib/weather-safety";

const EMPTY_OUTAGES = { total_out: 0, total_served: 0, munis: [] };
const LIVE_SOURCE_DEADLINE_MS = 1_700;
const PULSE_DETAIL_SOURCE_DEADLINE_MS = 4_500;
const SCHOOL_CHECK_MAX_AGE_MS = 20 * 60_000;
const TRAFFIC_CHECK_MAX_AGE_MS = 5 * 60_000;
const POWER_REPORT_MAX_AGE_MS = 15 * 60_000;

const readWeather = createVerifiedSourceReader<NwsAlertsResult>(
  "nws", getNwsAlertsResult, { alerts: [], available: false }, (result) => result.checkedAt, NWS_ALERTS_MAX_CHECK_AGE_MS,
);
const readSchools = createVerifiedSourceReader<FcpsAlertsResult>(
  "fcps", getFcpsAlertsResult, { data: [], available: false }, (result) => result.checkedAt, SCHOOL_CHECK_MAX_AGE_MS,
);
const readTraffic = createVerifiedSourceReader<ChartIncidentsResult>(
  "mdot-chart", () => getChartIncidentsFrederickResult({ deadlineMs: PULSE_DETAIL_SOURCE_DEADLINE_MS }),
  { data: [], available: false }, (result) => result.asOf, TRAFFIC_CHECK_MAX_AGE_MS,
);
const readScanner = createVerifiedSourceReader<GeocodedScannerIncidentsResult>(
  "scanner", getGeocodedScannerIncidentsResult, { data: [], available: false, rawCount: 0, geocodedCount: 0 },
  (result) => result.asOfBasis === "retrieval" ? result.asOf : undefined, SCANNER_SOURCE_CHECK_MAX_AGE_MS,
);
const readPower = createVerifiedSourceReader<FrederickOutagesResult>(
  "firstenergy", getFrederickOutagesResult, { data: EMPTY_OUTAGES, available: false }, (result) => result.asOf, POWER_REPORT_MAX_AGE_MS,
);

export type GetCurrentSituationOptions = {
  /** Explicit clocks bypass cross-request caching and are intended for tests. */
  now?: string | number | Date;
  /** Full Pulse can wait for a cold provider longer than the header or Ask. */
  waitForSources?: boolean;
};

function clock(value?: string | number | Date): Date {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Current situation snapshots require a valid clock.");
  }
  return date;
}

function newestAirObservation(
  observations: readonly AqiObservation[],
): string | undefined {
  const newest = observations
    .map((observation) => airQualityObservedAt(observation)?.getTime() ?? NaN)
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  return newest === undefined ? undefined : new Date(newest).toISOString();
}

// Preserve the short cache for the two optional services, including their
// genuine unconfigured or empty states. Their presence is independent of the
// five live checks whose last successful result is retained separately.
const optionalSourceCache = { revalidate: 60, tags: ["current-situation"] };
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
const readFire = unstable_cache(getPulsePointIncidentsResult, ["county-fire-rescue-v1", release], optionalSourceCache);
const loadAir = () => getAirQuality(FREDERICK_CENTER, { deadlineMs: LIVE_SOURCE_DEADLINE_MS - 200 });
const readAir = unstable_cache(loadAir, ["county-air-observations-v1", release], optionalSourceCache);

async function loadCurrentSituation(
  nowValue?: string | number | Date,
  waitForSources = false,
): Promise<CurrentSituationSnapshot> {
  const deadlineMs = waitForSources ? PULSE_DETAIL_SOURCE_DEADLINE_MS : LIVE_SOURCE_DEADLINE_MS;
  const uncached = nowValue !== undefined;
  const [
    nws,
    schools,
    traffic,
    scanner,
    power,
    fireRescue,
    rawAir,
  ] = await Promise.all([
    readWeather(deadlineMs, uncached),
    readSchools(deadlineMs, uncached),
    readTraffic(deadlineMs, uncached),
    readScanner(deadlineMs, uncached),
    readPower(deadlineMs, uncached),
    withDeadlineFallback<PulsePointIncidentsResult>(
      uncached ? getPulsePointIncidentsResult() : readFire(),
      LIVE_SOURCE_DEADLINE_MS,
      {
        data: [],
        available: false,
        configured: true,
      },
    ),
    withDeadlineFallback(uncached ? loadAir() : readAir(), LIVE_SOURCE_DEADLINE_MS, null),
  ]);

  const now = clock(nowValue);
  const capturedAt = now.toISOString();
  const freshAir = (rawAir ?? []).filter((observation) =>
    isFreshAqiObservation(observation, now),
  );
  const airAsOf = newestAirObservation(freshAir);
  const sources = {
    weather: sourceEnvelope({
      source: "nws",
      data: nws.alerts,
      availability: nws.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: NWS_ALERTS_MAX_CHECK_AGE_MS / 1_000,
      futureToleranceMs: NWS_ALERTS_FUTURE_TOLERANCE_MS,
      asOf: nws.checkedAt ?? null,
      asOfBasis: nws.checkedAt ? "retrieval" : null,
    }),
    schools: sourceEnvelope({
      source: "fcps",
      data: schools.data.filter((notice) => isCurrentFcpsNotice(notice.published_at, now.getTime())),
      availability: schools.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: SCHOOL_CHECK_MAX_AGE_MS / 1_000,
      // FCPS may publish no new item for days while the successfully fetched
      // feed is still current. Use this read's retrieval time for feed health;
      // each notice retains its provider publication time in `published_at`.
      asOf: schools.checkedAt ?? null,
      asOfBasis: schools.checkedAt ? "retrieval" : null,
    }),
    traffic: sourceEnvelope({
      source: "mdot-chart",
      data: traffic.data,
      availability: traffic.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: TRAFFIC_CHECK_MAX_AGE_MS / 1_000,
      asOf: traffic.asOf ?? null,
      asOfBasis: traffic.asOf ? "retrieval" : null,
    }),
    scanner: sourceEnvelope({
      source: "frederick-scanner",
      data: scanner.data,
      availability: scanner.available ? "available" : "unavailable",
      requiredForQuiet: false,
      capturedAt,
      staleAfterSeconds: SCANNER_SOURCE_CHECK_MAX_AGE_MS / 1_000,
      // Report occurrence is separate from feed retrieval. Missing retrieval
      // evidence cannot be refreshed merely by assembling this snapshot.
      asOf: scanner.asOfBasis === "retrieval" ? scanner.asOf ?? null : null,
      asOfBasis: scanner.asOfBasis === "retrieval" ? "retrieval" : null,
      itemCount: scanner.rawCount,
    }),
    power: sourceEnvelope({
      source: "firstenergy",
      data: power.data,
      availability: power.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: POWER_REPORT_MAX_AGE_MS / 1_000,
      asOf: power.asOf ?? null,
      asOfBasis: power.asOf ? "provider" : null,
      itemCount: power.data.total_out > 0 ? 1 : 0,
    }),
    fireRescue: sourceEnvelope({
      source: "pulsepoint",
      data: fireRescue.data,
      availability: !fireRescue.configured
        ? "disabled"
        : fireRescue.available
          ? "available"
          : "unavailable",
      requiredForQuiet: fireRescue.configured,
      capturedAt,
      staleAfterSeconds: 3 * 60,
      asOf: fireRescue.asOfBasis === "retrieval" ? fireRescue.asOf ?? null : null,
      asOfBasis: fireRescue.asOfBasis === "retrieval" ? "retrieval" : null,
    }),
    air: sourceEnvelope({
      source: "airnow",
      data: freshAir,
      availability: rawAir === null ? "unavailable" : "available",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: 3 * 60 * 60,
      asOf: airAsOf,
      asOfBasis: airAsOf ? "observation" : null,
    }),
  } as const;

  const roadFusion = fuseScannerWithChartIncidents(
    scanner.data,
    traffic.data,
    { now },
  );

  return buildCurrentSituationSnapshot({ sources, roadFusion, now });
}

const getCurrentSituationForRequest = cache((waitForSources: boolean) => loadCurrentSituation(undefined, waitForSources));

export function getCurrentSituationSnapshot(
  { now, waitForSources = false }: GetCurrentSituationOptions = {},
): Promise<CurrentSituationSnapshot> {
  return now === undefined
    ? getCurrentSituationForRequest(waitForSources)
    : loadCurrentSituation(now, waitForSources);
}
