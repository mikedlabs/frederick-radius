import "server-only";

import {
  getChartIncidentsFrederickResult,
  type ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import {
  getMdotWorkZonesFrederickResult,
  MDOT_WZDX_SOURCE_URL,
  type MdotWorkZonesResult,
} from "@/lib/integrations/mdot-wzdx";
import {
  getNwsAlertsResult,
  type NwsAlertsResult,
} from "@/lib/integrations/nws-alerts";
import {
  getOfficialCivicAlertsResult,
  type OfficialCivicAlertsResult,
} from "@/lib/integrations/official-alert-feeds";
import {
  getStopPredictionsResult,
  getTransitServiceAlertsResult,
  type StopPrediction,
  type TransitFeedResult,
  type TransitServiceAlert,
} from "@/lib/integrations/transitRealtime";

import {
  buildFairArrivalNotTodayStatus,
  buildFairArrivalStatus,
  isFairArrivalDate,
  isSelectedFairDateToday,
  type FairArrivalStatus,
} from "./arrival-status";

const DEADLINE_MS = 2_400;
const PROVIDER_DEADLINE_MS = DEADLINE_MS - 300;

function resolvedClock(value?: Date): Date {
  const now = value ? new Date(value.getTime()) : new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Fair arrival status requires a valid clock.");
  }
  return now;
}

async function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unavailableTransit<T>(receivedAt: number): TransitFeedResult<T[]> {
  return {
    data: [],
    status: "unavailable",
    available: false,
    receivedAt,
  };
}

export type GetFairArrivalStatusOptions = {
  selectedDate: string;
  includeTransit?: boolean;
  /** Explicit clocks are for deterministic tests and bypass no source cache. */
  now?: Date;
};

/**
 * Reads only the official sources represented by the public Fair-arrival
 * contract. Transit is deliberately deferred until the visitor selects it.
 */
export async function getFairArrivalStatus({
  selectedDate,
  includeTransit = false,
  now: nowValue,
}: GetFairArrivalStatusOptions): Promise<FairArrivalStatus> {
  const now = resolvedClock(nowValue);
  if (!isFairArrivalDate(selectedDate)) {
    throw new RangeError("Arrival status requires a date inside the 2026 Fair.");
  }
  if (!isSelectedFairDateToday(selectedDate, now)) {
    return buildFairArrivalNotTodayStatus({ selectedDate, now });
  }
  const requestCheckedAt = now.toISOString();
  const transitPromise = includeTransit
    ? Promise.all([
        within<TransitFeedResult<StopPrediction[]>>(
          getStopPredictionsResult(),
          unavailableTransit<StopPrediction>(now.getTime()),
        ),
        within<TransitFeedResult<TransitServiceAlert[]>>(
          getTransitServiceAlertsResult(),
          unavailableTransit<TransitServiceAlert>(now.getTime()),
        ),
      ])
    : Promise.resolve(null);

  const [chart, workZones, weather, civic, transit] = await Promise.all([
    within<ChartIncidentsResult>(
      getChartIncidentsFrederickResult({
        deadlineMs: PROVIDER_DEADLINE_MS,
        revalidateSeconds: 60,
      }),
      { data: [], available: false },
    ),
    within<MdotWorkZonesResult>(
      getMdotWorkZonesFrederickResult({
        deadlineMs: PROVIDER_DEADLINE_MS,
        revalidateSeconds: 60,
      }),
      { data: [], available: false, sourceUrl: MDOT_WZDX_SOURCE_URL },
    ),
    within<NwsAlertsResult>(getNwsAlertsResult(), {
      alerts: [],
      available: false,
    }),
    within<OfficialCivicAlertsResult>(
      getOfficialCivicAlertsResult({
        deadlineMs: PROVIDER_DEADLINE_MS,
        revalidateSeconds: 300,
        now,
      }),
      {
        alerts: [],
        available: false,
        degraded: true,
        coverageComplete: false,
        coverageNote:
          "City and County alert feeds could not be verified for this check.",
        sourceHealth: [],
      },
    ),
    transitPromise,
  ]);

  return buildFairArrivalStatus({
    now,
    chart: { result: chart, checkedAt: requestCheckedAt },
    workZones: { result: workZones, checkedAt: requestCheckedAt },
    weather: { result: weather, checkedAt: requestCheckedAt },
    civic: { result: civic, checkedAt: requestCheckedAt },
    ...(transit
      ? {
          transit: {
            arrivals: {
              result: transit[0],
              checkedAt: requestCheckedAt,
            },
            alerts: {
              result: transit[1],
              checkedAt: requestCheckedAt,
            },
          },
        }
      : {}),
  });
}
