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
import {
  withDeadlineOutcome,
  type DeadlineOutcome,
} from "@/lib/promise-deadline";
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
import {
  MAP_DATABASE_FEED_DEADLINE_MS,
  MAP_DATABASE_STATEMENT_TIMEOUT_MS,
  MAP_NETWORK_FEED_DEADLINE_MS,
} from "./config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type MapFeed = readonly [string, () => Promise<unknown>];

const NETWORK_MAP_FEEDS: ReadonlyArray<MapFeed> = [
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
];

// Keep database work out of the optional network fanout. A JavaScript timeout
// only bounds how long this route waits; it does not cancel a Postgres query.
// Database-backed feeds therefore run after the fanout, one at a time, with a
// real server-side statement timeout in addition to the route deadline.
const DATABASE_MAP_FEEDS: ReadonlyArray<MapFeed> = [
  [
    "reports",
    () =>
      getCommunityReports(
        new Date(),
        MAP_DATABASE_STATEMENT_TIMEOUT_MS,
      ),
  ],
];

const MAP_FEEDS: ReadonlyArray<MapFeed> = [
  ...NETWORK_MAP_FEEDS,
  ...DATABASE_MAP_FEEDS,
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
  const networkResults = await Promise.all(
    NETWORK_MAP_FEEDS.map(([, warm]) =>
      withDeadlineOutcome(
        Promise.resolve().then(warm),
        MAP_NETWORK_FEED_DEADLINE_MS,
      ),
    ),
  );
  const databaseResults: DeadlineOutcome<unknown>[] = [];
  for (const [, warm] of DATABASE_MAP_FEEDS) {
    databaseResults.push(
      await withDeadlineOutcome(
        Promise.resolve().then(warm),
        MAP_DATABASE_FEED_DEADLINE_MS,
      ),
    );
  }
  const results = [...networkResults, ...databaseResults];
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
