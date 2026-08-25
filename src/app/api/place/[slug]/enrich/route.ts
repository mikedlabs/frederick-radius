/**
 * On-demand Google enrichment for the long-tail (DFP-scraped) places.
 *
 * The 51 curated places are enriched at build time into
 * places-enrichment.json. The ~1,280 DFP places are NOT — they have no
 * photos/hours/rating. This route fills that gap only when the shipped place
 * record is bare. Rich summaries, reviews, and decision attributes use
 * `?mode=experience` and are requested only after a deliberate user action.
 * The response is deliberately no-store: Google Places content is
 * request-scoped and is not retained in Next's data cache.
 *
 *   GET /api/place/<slug>/enrich  →  { photos, hours, phone, website, ... }
 *
 * Returns 200 with {} when there's no match or no API key, so the client
 * can always treat a response as best-effort and degrade gracefully.
 */
import { NextResponse } from "next/server";
import { PLACE_BY_SLUG } from "@/data/places";
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import {
  getPlaceDetails,
  googlePlacesConfigured,
  resolveAndEnrich,
  type PlaceEnrichment,
  type GooglePhotoAttribution,
  type GooglePlaceFeature,
  type GooglePlaceSummary,
} from "@/lib/integrations/google-places";
import {
  isOverPaidRequestBudget,
  isRateLimited,
  isSameOriginRequest,
} from "@/lib/origin-check";
import { parseGoogleHours } from "@/lib/googleHours";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import {
  activeManualPlaceStatusOverride,
  isManualPlaceClosureOverride,
} from "@/lib/place-status-overrides";
import { publishableGooglePhotoNames } from "@/lib/google-photo-policy";
import { isValidCoord } from "@/lib/geo";
import { patchRecord, type Overrides } from "@/lib/overrides";
import { reserveDailyUsage } from "@/lib/usage-meter";
import {
  googlePlaceEnrichmentDailyCap,
  type GooglePlaceEnrichmentMode,
} from "@/lib/google-place-enrichment-budget";

// Wrong-business quarantine (UX audit P0): these slugs were bound to a
// DIFFERENT business's Google listing, and the base record's stored
// google_place_id points at that wrong business — so this on-demand path
// would re-serve the law office's hours to the restaurant's sheet. Serve
// EMPTY until the slug is re-enriched with the correct listing.
const PLACE_OVERRIDES = OVERRIDES_RAW as Overrides;
const QUARANTINED = new Set(
  Object.entries(PLACE_OVERRIDES.patch ?? {})
    .filter(([, p]) => p.clearEnrichment)
    .map(([slug]) => slug),
);

export const runtime = "nodejs";

const photoProxy = (name: string, w = 800) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}`;

type EnrichResponse = {
  photos: string[];
  hours: string[];
  phone?: string;
  website?: string;
  rating?: number;
  rating_count?: number;
  status?: PlaceEnrichment["business_status"];
  photo_attributions?: GooglePhotoAttribution[];
  google_maps_uri?: string;
  editorial_summary?: string;
  generative_summary?: GooglePlaceSummary;
  decision_features?: GooglePlaceFeature[];
  review_snippet?: string;
  review_author?: string;
  review_author_uri?: string;
  review_author_photo_uri?: string;
  review_google_maps_uri?: string;
  review_flag_content_uri?: string;
};

const EMPTY: EnrichResponse = { photos: [], hours: [] };
type EnrichMode = GooglePlaceEnrichmentMode;

// Coalesce simultaneous requests for the same slug/field set inside one warm
// server process. The result is deleted as soon as it settles, so this avoids
// duplicate paid calls without retaining Google content.
const IN_FLIGHT = new Map<string, Promise<EnrichResponse>>();

async function enrichSlug(
  slug: string,
  fields: EnrichMode,
): Promise<EnrichResponse> {
  const rawPlace = PLACE_BY_SLUG[slug];
  // A human coordinate correction must be allowed to rescue a source row, but
  // the corrected point still has to clear the county gate before paid work.
  const p = rawPlace
    ? patchRecord(rawPlace, PLACE_OVERRIDES.patch)
    : undefined;
  const manualStatus = activeManualPlaceStatusOverride(slug);
  if (
    !p ||
    !isValidCoord(p.geom) ||
    QUARANTINED.has(slug) ||
    isManualPlaceClosureOverride(manualStatus)
  ) {
    return EMPTY;
  }

  // Reserve only after local eligibility checks and inside the in-flight
  // coalescer, so invalid slugs and duplicate warm-worker requests do not use
  // the allowance. Database uncertainty intentionally falls back to the
  // shipped place record instead of allowing an unbounded provider request.
  const budgetNamespace = fields === "experience"
    ? "budget_google_place_enrich_experience"
    : "budget_google_place_enrich_basic";
  const reservation = await reserveDailyUsage(
    budgetNamespace,
    googlePlaceEnrichmentDailyCap(fields),
  );
  if (!reservation?.reserved) return EMPTY;

  const data =
    p.google_place_id && /^ChIJ/.test(p.google_place_id)
      ? await getPlaceDetails(p.google_place_id, fields)
      : await resolveAndEnrich({
          name: p.name,
          address: `${p.address}, ${p.city}, MD`,
          lat: p.geom?.lat,
          lng: p.geom?.lng,
        }, fields);

  if (!data) return EMPTY;
  const weekdayHours = data.weekday_hours ?? [];
  const publishHours = mayPublishVisitabilityHours(
    slug,
    parseGoogleHours(weekdayHours),
  );
  const photoNames = publishableGooglePhotoNames(
    (data.photo_names ?? []).slice(0, 8),
    data.photo_attributions,
  );
  const photoAttributions = data.photo_attributions.filter((attribution) =>
    photoNames.includes(attribution.photo_name),
  );
  return {
    photos: photoNames.map((name) => photoProxy(name, 800)),
    hours: publishHours ? weekdayHours : [],
    phone: data.phone,
    website: data.website,
    rating: data.rating,
    rating_count: data.user_rating_count,
    // A current first-party correction prevents a provider false-positive
    // closure from leaking back into the client response. We still make the
    // provider call so the record remains refreshable and its other fields can
    // improve while Google catches up.
    status:
      manualStatus?.status === "operational"
        ? "OPERATIONAL"
        : data.business_status,
    photo_attributions: photoAttributions,
    google_maps_uri: data.google_maps_uri,
    editorial_summary: data.editorial_summary,
    generative_summary: data.generative_summary,
    decision_features: data.decision_features,
    review_snippet: data.review_snippet,
    review_author: data.review_author,
    review_author_uri: data.review_author_uri,
    review_author_photo_uri: data.review_author_photo_uri,
    review_google_maps_uri: data.review_google_maps_uri,
    review_flag_content_uri: data.review_flag_content_uri,
  };
}

function enrichOnce(slug: string, fields: EnrichMode): Promise<EnrichResponse> {
  const key = `${slug}:${fields}`;
  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;
  const pending = enrichSlug(slug, fields).finally(() => {
    IN_FLIGHT.delete(key);
  });
  IN_FLIGHT.set(key, pending);
  return pending;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Keys alone are not authority to call Google. Check the shared written-
  // approval/runtime/configuration gate before touching either the request
  // limiter or the durable daily paid-call allowance.
  if (!googlePlacesConfigured()) {
    return NextResponse.json(EMPTY, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  const mode: EnrichMode = new URL(req.url).searchParams.get("mode") === "experience"
    ? "experience"
    : "basic";

  // Keep the paid Google path deliberately tighter than image/map browsing.
  // Rich context gets a second fence because it requests higher-cost fields
  // and is never required to render the place.
  if (await isOverPaidRequestBudget(req, "place-enrich", 30, 60, 5)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "private, no-store" },
    });
  }
  if (
    mode === "experience" &&
    await isRateLimited(req, "place-enrich-experience", 8, 60)
  ) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "private, no-store" },
    });
  }
  const { slug } = await params;
  try {
    const data = await enrichOnce(slug, mode);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(EMPTY, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
