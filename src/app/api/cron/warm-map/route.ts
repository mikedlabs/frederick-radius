/**
 * Map-layer cache warmer.
 *
 * These are the same cached loaders the browse map reads. They are kept
 * separate from warm-events so a slow ArcGIS or community-data source cannot
 * consume the event cron's runtime budget. Every layer is optional on the map,
 * so failures stay fail-soft and are reported as booleans without exposing an
 * upstream error.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import {
  getMunicipalBoundaries,
  getCountyBoundary,
} from "@/lib/integrations/fcGis";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getEvChargingStations } from "@/lib/integrations/evCharging";
import { getHistoricCemeteries } from "@/lib/integrations/fcCemeteries";
import { getCommunityReports } from "@/lib/loaders/communityReports";
import { getPublicCountyParkAssets } from "@/lib/integrations/fcParkAssetsPublic";
import { getCountyFloodContext } from "@/lib/integrations/fcFloodRisk";
import { getCountySnowRoutes } from "@/lib/integrations/fcSnowCommand";
import { MAP_FEED_DEADLINE_MS } from "./config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MAP_FEEDS: ReadonlyArray<
  readonly [string, () => Promise<unknown>]
> = [
  ["chart", () => getChartIncidentsFrederick()],
  ["fixit", () => getFixItIssues(30)],
  ["mapillary", () => fetchMapillaryTrash()],
  ["trails", () => getFrederickTrailShapes()],
  ["transit", () => getFrederickTransitRouteShapes()],
  ["muni-bounds", () => getMunicipalBoundaries()],
  ["county-bounds", () => getCountyBoundary()],
  ["water", () => getFrederickWaterSites()],
  ["ev", () => getEvChargingStations()],
  ["cemeteries", () => getHistoricCemeteries()],
  ["park-assets", () => getPublicCountyParkAssets()],
  ["flood-context", () => getCountyFloodContext()],
  ["snow-routes", () => getCountySnowRoutes()],
  ["reports", () => getCommunityReports()],
];

function recordCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    records?: unknown;
    features?: unknown;
    data?: unknown;
  };
  if (Array.isArray(candidate.records)) return candidate.records.length;
  if (Array.isArray(candidate.features)) return candidate.features.length;
  if (Array.isArray(candidate.data)) return candidate.data.length;
  return null;
}

function sourceAvailability(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const availability = (value as { availability?: unknown }).availability;
  return typeof availability === "string" ? availability : null;
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const startedAt = Date.now();
  const results = await Promise.all(
    MAP_FEEDS.map(([, warm]) =>
      withDeadlineOutcome(
        Promise.resolve().then(warm),
        MAP_FEED_DEADLINE_MS,
      ),
    ),
  );
  const mapFeeds = Object.fromEntries(
    MAP_FEEDS.map(([name], index) => [
      name,
      results[index].status === "fulfilled",
    ]),
  );
  const feedDetails = Object.fromEntries(
    MAP_FEEDS.map(([name], index) => {
      const result = results[index];
      return [
        name,
        result.status === "fulfilled"
          ? {
              status: result.status,
              count: recordCount(result.value),
              availability: sourceAvailability(result.value),
            }
          : { status: result.status, count: null, availability: null },
      ];
    }),
  );

  return NextResponse.json({
    ok: Object.values(mapFeeds).every(Boolean),
    duration_ms: Date.now() - startedAt,
    mapFeeds,
    feedDetails,
  });
}
