import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  fetchOsmFrederickOutcome,
  type OsmPlace,
} from "@/lib/integrations/overpass";

export const runtime = "nodejs";
// The successful payload has its own data cache below. Keeping the route
// dynamic is what prevents a fail-soft [] response from entering Next's route
// cache for a day.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEALTHY_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";
const STALE_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";
const NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";

type CachedOsmSnapshot = {
  places: OsmPlace[];
  fetchedAt: string;
};

class OsmRefreshFailure extends Error {
  constructor(readonly availability: "empty" | "unavailable") {
    super(`osm-${availability}`);
  }
}

// This is a warm-instance fallback only. The durable Next data cache remains
// the cross-instance last-known-good layer; the process copy covers a cache
// refresh error without relabeling an outage as a real empty county.
let lastKnownGood: CachedOsmSnapshot | null = null;

/**
 * Same-origin door to the optional OpenStreetMap amenity enrichment.
 *
 * The browser used to POST directly to volunteer Overpass servers. That was
 * blocked by our own Content Security Policy and made every fallback attempt
 * appear as a console error. Fetching here keeps the browser inside the site's
 * security boundary and gives a successful county-wide response a shared
 * daily cache. Empty/error refreshes deliberately reject before the data
 * cache boundary. The map's reviewed static amenity snapshot remains visible
 * through /api/map/layers even when this optional live enrichment is down.
 */
const cachedOsmFrederick = unstable_cache(
  async (): Promise<CachedOsmSnapshot> => {
    const outcome = await fetchOsmFrederickOutcome();
    if (outcome.availability !== "current" || outcome.places.length === 0) {
      throw new OsmRefreshFailure(
        outcome.availability === "unavailable" ? "unavailable" : "empty",
      );
    }
    return {
      places: outcome.places,
      fetchedAt: new Date().toISOString(),
    };
  },
  // v2 invalidates the prior cache, which could contain a 24-hour [] result.
  ["map-osm-frederick-v2-nonempty"],
  { revalidate: 86_400 },
);

export async function GET() {
  try {
    const snapshot = await cachedOsmFrederick();
    lastKnownGood = snapshot;
    return NextResponse.json(snapshot.places, {
      headers: {
        "Cache-Control": HEALTHY_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "X-Radius-Source-Status": "current",
        "X-Radius-Source-As-Of": snapshot.fetchedAt,
      },
    });
  } catch (error) {
    if (lastKnownGood) {
      return NextResponse.json(lastKnownGood.places, {
        headers: {
          "Cache-Control": STALE_CACHE_CONTROL,
          "X-Content-Type-Options": "nosniff",
          "X-Radius-Source-Status": "stale",
          "X-Radius-Source-As-Of": lastKnownGood.fetchedAt,
        },
      });
    }

    const availability =
      error instanceof OsmRefreshFailure ? error.availability : "unavailable";
    // Preserve the legacy array body for existing map clients, but make the
    // source state and caching contract honest. The browser can distinguish
    // this from a verified empty result without a response-shape migration.
    return NextResponse.json([], {
      headers: {
        "Cache-Control": NO_STORE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "X-Radius-Source-Status": availability,
      },
    });
  }
}
