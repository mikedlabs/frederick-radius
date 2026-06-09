/**
 * Google Places API (New) — searchNearby for Frederick County.
 *
 * Strictly scoped: every request is bounded by a circle inside the
 * county, every result is address-validated against the 13 whitelisted
 * municipalities (12 incorporated + Urbana unincorporated), and every
 * Google primaryType is mapped to a clean Frederick Radius UI tag.
 * Out-of-county results from fuzzy neighbors (Gettysburg PA, Leesburg
 * VA, Mount Airy NC, …) are dropped at the sanitizer.
 *
 *   • POST  https://places.googleapis.com/v1/places:searchNearby
 *   • Auth  X-Goog-Api-Key (server-only env)
 *   • Mask  X-Goog-FieldMask (tight by design — we pay per field)
 *   • Retry exponential backoff on 429 / RESOURCE_EXHAUSTED
 *
 * Pure client (no caching). Callers persist to whatever store fits
 * their cadence.
 */
import "server-only";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// ── Field masks ─────────────────────────────────────────────────────
// Every field is billed; the mask is the single biggest lever on cost.
// Keep tight. Order is for human reading, not API.
const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.regularOpeningHours.openNow",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.businessStatus",
  "places.photos.name",
  "places.editorialSummary",
].join(",");

// ── Frederick County ground truth ────────────────────────────────────
export const FREDERICK_CENTER = { lat: 39.4143, lng: -77.4105 } as const;

// The municipalities (12 incorporated + Urbana unincorporated). We
// lowercase here for the membership test; Google returns title-case.
const MUNI_WHITELIST: ReadonlySet<string> = new Set(
  MUNICIPALITIES.flatMap((m) => {
    const set = [m.name.toLowerCase()];
    // "Downtown Frederick" is our editorial label; Google returns plain
    // "Frederick". Allow both so the address validator stays accurate.
    if (m.slug === "frederick") set.push("frederick");
    return set;
  }),
);

const COUNTY_PATTERN = /\bfrederick county\b/i;
const STATE_PATTERN = /\b(md|maryland)\b/i;

// ── Type → UI tag mapping ───────────────────────────────────────────
// categoryFromPrimaryType maps Google primaryType → our slug
// (`coffee_shop` → `coffee`). We layer a thin UI label on top so a
// taxonomy change in the back end doesn't ripple to UI copy.
const UI_LABEL: Record<string, string> = {
  coffee: "Coffee",
  bakery: "Bakery",
  restaurant: "Eat & drink",
  pizza: "Eat & drink",
  bar: "Eat & drink",
  brewery: "Sip & Taste",
  market: "Markets",
  park: "Outdoors",
  trail: "Outdoors",
  outdoors: "Outdoors",
  playground: "Family",
  family: "Family",
  museum: "Arts & Culture",
  gallery: "Arts & Culture",
  theater: "Arts & Culture",
  music: "Arts & Culture",
  "public-art": "Arts & Culture",
  library: "Civic & Public",
  government: "Civic & Public",
  "public-safety": "Civic & Public",
  civic: "Civic & Public",
  worship: "Worship",
  shopping: "Shopping",
  lodging: "Lodging",
  wellness: "Wellness",
  yoga: "Wellness",
  pharmacy: "Wellness",
  services: "Services",
  parking: "Parking",
  transit: "Transit",
  "book-store": "Shopping",
  antiques: "Shopping",
  hardware: "Shopping",
};

function uiTagFor(primaryType: string | undefined, fallbackTypes: string[] = []): string {
  // 1. Try the corrector with primaryType (most precise).
  const corrected = categoryFromPrimaryType(primaryType);
  if (corrected && UI_LABEL[corrected]) return UI_LABEL[corrected];
  // 2. Walk the broader `types` array, first hit wins.
  for (const t of fallbackTypes) {
    const c = categoryFromPrimaryType(t);
    if (c && UI_LABEL[c]) return UI_LABEL[c];
  }
  return "Local";
}

// ── Public types ─────────────────────────────────────────────────────

export type NearbyQuery = {
  /** Center of the search circle. Default: Downtown Frederick. */
  center?: { lat: number; lng: number };
  /** Radius in meters. Clamped 50 m – 30 km. */
  radiusMeters?: number;
  /** Google primaryType filter — keeps cost down + results focused.
   *  Empty array = type-agnostic "what's nearby". */
  includedPrimaryTypes?: string[];
  /** Cap the result count (1–20, Google's hard limit). */
  maxResultCount?: number;
  /** "DISTANCE" sorts by proximity; "POPULARITY" by Google's default. */
  rankPreference?: "DISTANCE" | "POPULARITY";
  /** Restrict to one municipality. Centers the circle on its centroid
   *  and narrows address validation to that town's locality. */
  municipality?: string;
};

export type DiscoveredPlace = {
  google_place_id: string;
  name: string;
  formatted_address: string;
  location: { lat: number; lng: number };
  /** Frederick Radius UI tag, e.g. "Eat & drink", "Outdoors". */
  ui_tag: string;
  /** Google's raw primaryType for downstream tools. */
  primary_type?: string;
  primary_type_display?: string;
  rating?: number;
  user_rating_count?: number;
  open_now?: boolean;
  weekday_hours?: string[];
  website?: string;
  phone?: string;
  business_status?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  photo_names: string[];
  editorial_summary?: string;
};

export type NearbyResult = {
  ok: true;
  count: number;
  places: DiscoveredPlace[];
  /** Raw Google rows that failed address validation — surfaces "of 20
   *  returned, 4 were out of county" so callers can adjust. */
  dropped_out_of_county: number;
};

export type NearbyError = {
  ok: false;
  status: number;
  code?: string;
  message: string;
};

// ── HTTP with retry ─────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 400;

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  const expo = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return expo + Math.floor(Math.random() * 200);
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function postNearby(body: object): Promise<Response> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": NEARBY_FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

// ── Address validation ──────────────────────────────────────────────

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

/**
 * Walk Google's addressComponents for a hard membership signal:
 *   • administrative_area_level_2 === "Frederick County"  → in scope
 *   • locality / sublocality in the whitelist             → in scope
 *   • administrative_area_level_1 must be Maryland
 *
 * Falls back to a regex over formattedAddress when components are
 * missing. Conservative — drops on doubt; an extra trip is cheaper
 * than serving Mount Airy NC on a chip that says "Frederick County".
 */
function isInFrederickCounty(
  components: GoogleAddressComponent[] | undefined,
  formatted: string | undefined,
  expectedMuni?: string,
): boolean {
  if (components && components.length > 0) {
    let stateOk = false;
    let countyHit = false;
    let muniHit = false;
    let expectedMuniHit = false;
    for (const c of components) {
      const text = (c.longText ?? c.shortText ?? "").toLowerCase();
      const types = c.types ?? [];
      if (types.includes("administrative_area_level_1")) {
        stateOk = /maryland|^md$/i.test(text);
      }
      if (types.includes("administrative_area_level_2")) {
        countyHit = /frederick county/i.test(text);
      }
      if (
        types.includes("locality") ||
        types.includes("sublocality") ||
        types.includes("postal_town")
      ) {
        muniHit = MUNI_WHITELIST.has(text);
        if (expectedMuni && text === expectedMuni.toLowerCase()) {
          expectedMuniHit = true;
        }
      }
    }
    if (!stateOk) return false;
    if (expectedMuni) return expectedMuniHit;
    return countyHit || muniHit;
  }
  // Fallback regex — less reliable; require BOTH state AND (county or whitelisted muni).
  const f = (formatted ?? "").toLowerCase();
  if (!STATE_PATTERN.test(f)) return false;
  if (COUNTY_PATTERN.test(f)) return true;
  if (expectedMuni) return f.includes(expectedMuni.toLowerCase());
  for (const muni of MUNI_WHITELIST) {
    if (f.includes(muni)) return true;
  }
  return false;
}

// ── Sanitizer (also exported standalone — see google-place-sanitize.ts) ──

type GoogleNearbyPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  photos?: { name?: string }[];
  editorialSummary?: { text?: string };
};

function sanitize(p: GoogleNearbyPlace): DiscoveredPlace | null {
  const id = p.id;
  const name = p.displayName?.text?.trim();
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  // Hard requirements: id, name, coords. Without any of these the
  // result can't render as a discovery card.
  if (!id || !name || typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    google_place_id: id,
    name,
    formatted_address: p.formattedAddress ?? "",
    location: { lat, lng },
    ui_tag: uiTagFor(p.primaryType, p.types ?? []),
    primary_type: p.primaryType,
    primary_type_display: p.primaryTypeDisplayName?.text,
    rating: p.rating,
    user_rating_count: p.userRatingCount,
    open_now: p.regularOpeningHours?.openNow,
    weekday_hours: p.regularOpeningHours?.weekdayDescriptions,
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    business_status: p.businessStatus,
    photo_names: (p.photos ?? []).map((x) => x?.name).filter((s): s is string => Boolean(s)),
    editorial_summary: p.editorialSummary?.text,
  };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Search nearby places inside Frederick County, with retry, address
 * validation, type cleansing, and tight field masking. Returns a
 * discriminated union — never throws on Google error; always returns
 * a shape callers can branch on.
 */
export async function searchNearby(q: NearbyQuery): Promise<NearbyResult | NearbyError> {
  const muni = q.municipality ? MUNICIPALITY_BY_SLUG[q.municipality] : null;
  const center = muni
    ? { lat: muni.centroid.lat, lng: muni.centroid.lng }
    : q.center ?? FREDERICK_CENTER;

  // 30 km from the county center reaches well past every municipality;
  // Google rejects > 50 km. Floor 50 m so a single-pin radius is sane.
  const radiusMeters = Math.max(50, Math.min(q.radiusMeters ?? 5000, 30_000));

  const body: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    },
    maxResultCount: Math.max(1, Math.min(q.maxResultCount ?? 20, 20)),
    rankPreference: q.rankPreference ?? "DISTANCE",
  };
  if (q.includedPrimaryTypes && q.includedPrimaryTypes.length > 0) {
    body.includedPrimaryTypes = q.includedPrimaryTypes;
  }

  let lastError: NearbyError = { ok: false, status: 0, message: "no attempt" };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await postNearby(body);
    } catch (e) {
      lastError = {
        ok: false,
        status: 0,
        code: "NETWORK",
        message: e instanceof Error ? e.message : "network error",
      };
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt, null)));
        continue;
      }
      return lastError;
    }

    if (res.ok) {
      const json = (await res.json()) as { places?: GoogleNearbyPlace[] };
      const expectedMuni = muni?.name;
      let droppedOOC = 0;
      const out: DiscoveredPlace[] = [];
      for (const raw of json.places ?? []) {
        if (!isInFrederickCounty(raw.addressComponents, raw.formattedAddress, expectedMuni)) {
          droppedOOC++;
          continue;
        }
        const clean = sanitize(raw);
        if (clean) out.push(clean);
      }
      return { ok: true, count: out.length, places: out, dropped_out_of_county: droppedOOC };
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      /* ignore */
    }
    let code: string | undefined;
    try {
      const parsed = JSON.parse(bodyText) as { error?: { status?: string; message?: string } };
      code = parsed?.error?.status;
    } catch {
      /* not JSON */
    }

    lastError = {
      ok: false,
      status: res.status,
      code,
      message:
        code === "RESOURCE_EXHAUSTED"
          ? "Places API rate limit hit (RESOURCE_EXHAUSTED)"
          : `Places API returned ${res.status}: ${bodyText.slice(0, 240)}`,
    };

    if (isRetryable(res.status) && attempt < MAX_RETRIES) {
      const ra = res.headers.get("retry-after");
      await new Promise((r) => setTimeout(r, backoffMs(attempt, ra)));
      continue;
    }
    return lastError;
  }
  return lastError;
}

/** Exported so the standalone sanitizer utility can reuse the exact
 *  same shape. Keep both call-sites consistent. */
export { sanitize as sanitizeGooglePlace, isInFrederickCounty, uiTagFor };
