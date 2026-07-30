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
import { getMdotWorkZonesFrederickResult } from "@/lib/integrations/mdot-wzdx";
import {
  buildRoadIntelligenceSnapshot,
  type RoadIntelligenceSnapshot,
} from "@/lib/live/roadIntelligenceModel";

const DEADLINE_MS = 2_400;

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
  return getRoadIntelligenceForRequest();
}
