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
import { FREDERICK_CENTER } from "@/lib/geo";
import {
  buildCurrentSituationSnapshot,
  sourceEnvelope,
  type CurrentSituationSnapshot,
  type SourceAsOfBasis,
} from "@/lib/live/currentSituationModel";
import { fuseScannerWithChartIncidents } from "@/lib/live/incidentFusion";

const EMPTY_OUTAGES = { total_out: 0, total_served: 0, munis: [] };
const LIVE_SOURCE_DEADLINE_MS = 1_700;

export type GetCurrentSituationOptions = {
  /** Explicit clocks bypass cross-request caching and are intended for tests. */
  now?: string | number | Date;
};

function clock(value?: string | number | Date): Date {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Current situation snapshots require a valid clock.");
  }
  return date;
}

function asOf(
  providerValue: string | undefined,
  capturedAt: string,
  providerBasis: SourceAsOfBasis,
): { asOf: string; asOfBasis: SourceAsOfBasis } {
  return providerValue
    ? { asOf: providerValue, asOfBasis: providerBasis }
    : { asOf: capturedAt, asOfBasis: "retrieval" };
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

/**
 * A slow optional source must not hold every live surface hostage.
 *
 * The snapshot keeps unavailable distinct from quiet, so timing a source out
 * is honest: the page becomes partial rather than falsely clear. Individual
 * integrations still own their provider-specific aborts and caches; this is
 * the shared user-facing ceiling around each independent read.
 */
async function settleWithin<T>(
  work: Promise<T>,
  fallback: T,
  deadlineMs = LIVE_SOURCE_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadCurrentSituation(
  nowValue?: string | number | Date,
): Promise<CurrentSituationSnapshot> {
  const now = clock(nowValue);
  const capturedAt = now.toISOString();
  const [
    nws,
    schools,
    traffic,
    scanner,
    power,
    fireRescue,
    rawAir,
  ] = await Promise.all([
    settleWithin<NwsAlertsResult>(
      getNwsAlertsResult(),
      { alerts: [], available: false },
    ),
    settleWithin<FcpsAlertsResult>(
      getFcpsAlertsResult(),
      { data: [], available: false },
    ),
    settleWithin<ChartIncidentsResult>(
      getChartIncidentsFrederickResult({
        deadlineMs: LIVE_SOURCE_DEADLINE_MS - 200,
      }),
      { data: [], available: false },
    ),
    settleWithin<GeocodedScannerIncidentsResult>(
      getGeocodedScannerIncidentsResult(),
      {
        data: [],
        available: false,
        rawCount: 0,
        geocodedCount: 0,
      },
    ),
    settleWithin<FrederickOutagesResult>(
      getFrederickOutagesResult(),
      {
        data: EMPTY_OUTAGES,
        available: false,
      },
    ),
    settleWithin<PulsePointIncidentsResult>(
      getPulsePointIncidentsResult(),
      {
        data: [],
        available: false,
        configured: true,
      },
    ),
    settleWithin(
      getAirQuality(FREDERICK_CENTER, {
        deadlineMs: LIVE_SOURCE_DEADLINE_MS - 200,
      }),
      null,
    ),
  ]);

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
      staleAfterSeconds: 20 * 60,
      ...(nws.available ? asOf(undefined, capturedAt, "provider") : {}),
    }),
    schools: sourceEnvelope({
      source: "fcps",
      data: schools.data,
      availability: schools.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: 20 * 60,
      // FCPS may publish no new item for days while the successfully fetched
      // feed is still current. Use this read's retrieval time for feed health;
      // each notice retains its provider publication time in `published_at`.
      ...(schools.available ? asOf(undefined, capturedAt, "retrieval") : {}),
    }),
    traffic: sourceEnvelope({
      source: "mdot-chart",
      data: traffic.data,
      availability: traffic.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: 5 * 60,
      ...(traffic.available ? asOf(traffic.asOf, capturedAt, "retrieval") : {}),
    }),
    scanner: sourceEnvelope({
      source: "frederick-scanner",
      data: scanner.data,
      availability: scanner.available ? "available" : "unavailable",
      requiredForQuiet: false,
      capturedAt,
      staleAfterSeconds: 3 * 60,
      // The newest incident time says when activity happened, not whether a
      // successful empty/quiet board read is current.
      ...(scanner.available ? asOf(undefined, capturedAt, "retrieval") : {}),
      itemCount: scanner.rawCount,
    }),
    power: sourceEnvelope({
      source: "firstenergy",
      data: power.data,
      availability: power.available ? "available" : "unavailable",
      requiredForQuiet: true,
      capturedAt,
      staleAfterSeconds: 15 * 60,
      ...(power.available ? asOf(power.asOf, capturedAt, "provider") : {}),
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
      ...(fireRescue.available ? asOf(undefined, capturedAt, "retrieval") : {}),
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

const getCachedCurrentSituation = unstable_cache(
  () => loadCurrentSituation(),
  [
    "current-situation-v1",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  ],
  { revalidate: 60, tags: ["current-situation"] },
);

const getCurrentSituationForRequest = cache(getCachedCurrentSituation);

export function getCurrentSituationSnapshot(
  { now }: GetCurrentSituationOptions = {},
): Promise<CurrentSituationSnapshot> {
  return now === undefined
    ? getCurrentSituationForRequest()
    : loadCurrentSituation(now);
}
