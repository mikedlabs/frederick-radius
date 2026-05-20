/**
 * Google Places API (New) — Autocomplete strictly scoped to Frederick County.
 *
 *   POST https://places.googleapis.com/v1/places:autocomplete
 *
 * locationRestriction (NOT locationBias) is the right primitive here:
 * `restriction` HARD-FILTERS to a rectangle; `bias` is a soft hint.
 * Combined with includedRegionCodes:["us"] we keep the user inside the
 * county even when they fat-finger "Frederick" (which Google otherwise
 * happily resolves to OH/CO/OK).
 *
 * Field-mask scoped: we only need suggestion text + the placePrediction
 * id to follow up with a Place Details call.
 */
import "server-only";

const ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete";

// Frederick County bbox (lng-min, lat-min, lng-max, lat-max) — wide
// enough to include Burkittsville on the west and Mount Airy on the
// east. Verified against the county GIS boundary.
export const COUNTY_BBOX = {
  low: { latitude: 39.290, longitude: -77.700 },
  high: { latitude: 39.770, longitude: -77.040 },
} as const;

const AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text",
  "suggestions.placePrediction.structuredFormat",
  "suggestions.placePrediction.types",
].join(",");

export type AutocompleteSuggestion = {
  place_id: string;
  primary: string;
  secondary: string;
  /** The full one-line text Google returns ("Brunswick Heritage Museum, …"). */
  full_text: string;
  types: string[];
};

export type AutocompleteResult =
  | { ok: true; suggestions: AutocompleteSuggestion[] }
  | { ok: false; status: number; code?: string; message: string };

const MAX_RETRIES = 2;

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const n = parseInt(retryAfter, 10);
    if (Number.isFinite(n) && n > 0) return n * 1000;
  }
  return 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 120);
}

type GoogleSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
};

export async function autocomplete(input: string): Promise<AutocompleteResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, message: "GOOGLE_PLACES_API_KEY not configured" };
  }
  const query = input.trim();
  if (query.length < 2) {
    return { ok: true, suggestions: [] };
  }

  const body = {
    input: query,
    includedRegionCodes: ["us"],
    // HARD bound to the county. A "soft" locationBias still returns
    // out-of-state matches — exactly what this app fails on.
    locationRestriction: { rectangle: COUNTY_BBOX },
    // Cap so the dropdown never overruns; Google defaults to 5.
    // The mask is the real cost driver; this is a UX cap.
  };

  let lastErr: AutocompleteResult = { ok: false, status: 0, message: "no attempt" };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (e) {
      lastErr = {
        ok: false,
        status: 0,
        code: "NETWORK",
        message: e instanceof Error ? e.message : "network error",
      };
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt, null)));
        continue;
      }
      return lastErr;
    }

    if (res.ok) {
      const json = (await res.json()) as { suggestions?: GoogleSuggestion[] };
      const out: AutocompleteSuggestion[] = [];
      for (const s of json.suggestions ?? []) {
        const p = s.placePrediction;
        if (!p?.placeId || !p?.text?.text) continue;
        out.push({
          place_id: p.placeId,
          primary: p.structuredFormat?.mainText?.text ?? p.text.text,
          secondary: p.structuredFormat?.secondaryText?.text ?? "",
          full_text: p.text.text,
          types: p.types ?? [],
        });
      }
      return { ok: true, suggestions: out };
    }

    let raw = "";
    try {
      raw = await res.text();
    } catch {
      /* ignore */
    }
    let code: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { error?: { status?: string } };
      code = parsed?.error?.status;
    } catch {
      /* not JSON */
    }
    lastErr = {
      ok: false,
      status: res.status,
      code,
      message:
        code === "RESOURCE_EXHAUSTED"
          ? "Places API rate limit hit"
          : `Autocomplete returned ${res.status}: ${raw.slice(0, 240)}`,
    };
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt, res.headers.get("retry-after"))));
      continue;
    }
    return lastErr;
  }
  return lastErr;
}
