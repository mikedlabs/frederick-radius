import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  getChartHighwayMessagesFrederickResult,
  getChartRoadConditionsFrederickResult,
  getChartRoadWeatherFrederickResult,
  getChartSnowEmergencyFrederickResult,
  getChartSpeedSensorsFrederickResult,
  getChartTravelTimesFrederickResult,
} from "@/lib/integrations/mdot-road-feeds";
import {
  getMdotWorkZonesFrederickResult,
  MDOT_WZDX_SOURCE_URL,
} from "@/lib/integrations/mdot-wzdx";
import {
  buildRoadIntelligenceSnapshot,
  type RoadIntelligenceSnapshot,
  type RoadIntelligenceSources,
} from "@/lib/live/roadIntelligenceModel";

const DEADLINE_MS = 2_400;
const SNAPSHOT_DEADLINE_MS = DEADLINE_MS + 600;

function unavailableSources(): RoadIntelligenceSources {
  return {
    workZones: {
      data: [],
      available: false,
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    },
    speeds: { data: [], available: false },
    travelTimes: { data: [], available: false },
    messages: { data: [], available: false },
    weatherStations: { data: [], available: false },
    roadConditions: { data: [], available: false },
    snowEmergency: { data: [], available: false },
  };
}

function unavailableSnapshot(now = new Date()): RoadIntelligenceSnapshot {
  return buildRoadIntelligenceSnapshot({
    now,
    sources: unavailableSources(),
  });
}

async function settleByDeadline<T>(
  promise: Promise<T>,
  fallback: T,
  deadlineMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs);
  });
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadRoadIntelligence(): Promise<RoadIntelligenceSnapshot> {
  const now = new Date();
  const options = {
    deadlineMs: DEADLINE_MS,
    now,
  };
  const [
    workZones,
    speeds,
    travelTimes,
    messages,
    weatherStations,
    roadConditions,
    snowEmergency,
  ] = await Promise.all([
    getMdotWorkZonesFrederickResult({
      deadlineMs: DEADLINE_MS,
      revalidateSeconds: 60,
    }),
    getChartSpeedSensorsFrederickResult(options),
    getChartTravelTimesFrederickResult(options),
    getChartHighwayMessagesFrederickResult(options),
    getChartRoadWeatherFrederickResult(options),
    getChartRoadConditionsFrederickResult(options),
    getChartSnowEmergencyFrederickResult(options),
  ]);

  return buildRoadIntelligenceSnapshot({
    now,
    sources: {
      workZones,
      speeds,
      travelTimes,
      messages,
      weatherStations,
      roadConditions,
      snowEmergency,
    },
  });
}

const getCachedRoadIntelligence = unstable_cache(
  loadRoadIntelligence,
  ["road-intelligence-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 60, tags: ["road-intelligence"] },
);

const getRoadIntelligenceForRequest = cache(getCachedRoadIntelligence);

export function getRoadIntelligenceSnapshot(): Promise<RoadIntelligenceSnapshot> {
  // The adapters carry their own network aborts, but the outer cache may
  // still inherit a pending fetch from a canceled render. Never let that
  // implementation detail hold Today, Map, Pulse, or Ask open indefinitely.
  // A timed-out snapshot is explicitly unknown/partial, never "roads are clear."
  return settleByDeadline(
    getRoadIntelligenceForRequest(),
    unavailableSnapshot(),
    SNAPSHOT_DEADLINE_MS,
  );
}
