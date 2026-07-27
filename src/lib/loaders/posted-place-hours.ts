import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import { PLACES, type Hours } from "@/data/places";
import { parseGoogleHours } from "@/lib/googleHours";

type CatalogRow = {
  slug: string;
  name: string;
  category: string;
  municipality: string;
  google_place_id?: string;
  is_operational?: string;
};

type EnrichmentRow = {
  google_place_id?: string;
  weekday_hours?: string[];
  enriched_at?: string;
};

type RefreshRow = {
  place_id?: string;
  weekday_hours?: string[];
  refreshed_at?: string;
};

type OverrideFile = {
  patch?: Record<string, { hours?: Hours }>;
};

export type StoredPostedHoursPlace = {
  slug: string;
  name: string;
  category: string;
  municipality: string;
  hours: Hours;
  recordedAt?: string;
};

const CATALOG = CLIENT_RAW as unknown as CatalogRow[];
const ENRICHMENT = ENRICHMENT_RAW as Record<string, EnrichmentRow>;
const REFRESH = HOURS_REFRESH_RAW as Record<string, RefreshRow | unknown>;
const PATCH = (OVERRIDES_RAW as OverrideFile).patch ?? {};
const MANUAL_BY_SLUG = new Map(PLACES.map((place) => [place.slug, place]));

let cache: StoredPostedHoursPlace[] | null = null;

/**
 * Historical schedule analytics need the schedule Radius has recorded, while
 * open-now surfaces need a recently verified schedule. Those are different
 * jobs. The public client loader intentionally strips stale hours so it cannot
 * make a current claim; this loader reconstructs the last stored schedule for
 * explicitly historical views such as The Rhythm and County in Numbers.
 *
 * Provider schedules are accepted only when their Google identity still
 * matches the canonical catalog row. Human patches remain the final word.
 */
export function storedPostedHoursPlaces(): StoredPostedHoursPlace[] {
  if (cache) return cache;

  cache = CATALOG.flatMap((place) => {
    if (
      place.is_operational === "closed_permanently" ||
      place.is_operational === "closed_temporarily"
    ) return [];

    const manual = MANUAL_BY_SLUG.get(place.slug);
    const patchHours = PATCH[place.slug]?.hours;
    const refresh = REFRESH[place.slug] as RefreshRow | undefined;
    const enrichment = ENRICHMENT[place.slug];
    const acceptedRefresh =
      place.google_place_id &&
      refresh?.place_id === place.google_place_id
        ? refresh
        : undefined;
    const acceptedEnrichment =
      place.google_place_id &&
      enrichment?.google_place_id === place.google_place_id
        ? enrichment
        : undefined;

    const refreshedHours = parseGoogleHours(acceptedRefresh?.weekday_hours);
    const enrichedHours = parseGoogleHours(acceptedEnrichment?.weekday_hours);
    const hours =
      patchHours ??
      refreshedHours ??
      manual?.hours ??
      enrichedHours;
    if (!hours || Object.keys(hours).length === 0) return [];

    return [{
      slug: place.slug,
      name: place.name,
      category: place.category,
      municipality: place.municipality,
      hours,
      recordedAt:
        patchHours
          ? manual?.updated_at
          : refreshedHours
            ? acceptedRefresh?.refreshed_at
            : manual?.hours
              ? manual.updated_at
              : acceptedEnrichment?.enriched_at,
    }];
  });

  return cache;
}
