import "server-only";

import {
  FREDERICK_COUNTY_BBOX,
  isInFrederickCountyArea,
} from "@/lib/geo";
import {
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import { meterUsage } from "@/lib/usage-meter";

/**
 * Mapbox Search Box results are licensed for temporary use only. This module
 * deliberately avoids Next caches, database writes, logs, and response fields
 * that the map does not need. Callers must keep the same UUIDv4 session token
 * from suggest through retrieve and discard the result with the UI session.
 */

const SEARCH_BOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const REQUEST_TIMEOUT_MS = 4_500;
const MAX_UPSTREAM_BYTES = 256 * 1024;
const MAX_QUERY_CHARS = 256;
const MAX_ROUTE_CHARS = 8_000;
const MAX_RESULTS = 4;
const COUNTY_BBOX = [
  FREDERICK_COUNTY_BBOX.west,
  FREDERICK_COUNTY_BBOX.south,
  FREDERICK_COUNTY_BBOX.east,
  FREDERICK_COUNTY_BBOX.north,
].join(",");

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAPBOX_ID = /^[A-Za-z0-9._:+/=-]{1,512}$/;

export type MapboxSearchProximity = {
  lng: number;
  lat: number;
};

export type MapboxSearchSuggestInput = {
  action: "suggest";
  q: string;
  sessionToken: string;
  /** True only for the first successful suggest attempt in this UI session.
   *  Mapbox bills abandoned suggest-only sessions too, so Radius meters the
   *  session here instead of waiting for a retrieve that may never happen. */
  sessionStart?: boolean;
  proximity: MapboxSearchProximity;
  limit: number;
  route?: string;
  routeGeometry?: "polyline" | "polyline6";
  timeDeviation?: number;
};

export type MapboxSearchRetrieveInput = {
  action: "retrieve";
  mapboxId: string;
  sessionToken: string;
  proximity: MapboxSearchProximity;
};

export type MapboxSearchBoxInput =
  | MapboxSearchSuggestInput
  | MapboxSearchRetrieveInput;

export type MapboxSearchSuggestion = {
  mapboxId: string;
  name: string;
  featureType: string;
  address?: string;
  fullAddress?: string;
  placeFormatted?: string;
  maki?: string;
  categories?: string[];
  status?: string;
  distanceMeters?: number;
  addedDistanceMeters?: number;
  addedTimeMinutes?: number;
};

export type MapboxSearchResult = MapboxSearchSuggestion & {
  coordinates: MapboxSearchProximity;
  routablePoint?: MapboxSearchProximity;
};

export type MapboxSearchBoxResponse =
  | {
      ok: true;
      action: "suggest";
      temporary: true;
      provider: "Mapbox";
      suggestions: MapboxSearchSuggestion[];
      attribution?: string;
    }
  | {
      ok: true;
      action: "retrieve";
      temporary: true;
      provider: "Mapbox";
      result: MapboxSearchResult;
      attribution?: string;
    }
  | {
      ok: false;
      reason:
        | "disabled"
        | "no-token"
        | "upstream-timeout"
        | "upstream-rate-limited"
        | "upstream-unavailable"
        | "malformed-upstream"
        | "no-result"
        | "outside-county";
      retryable: boolean;
    };

export type MapboxSearchBoxValidation =
  | { ok: true; value: MapboxSearchBoxInput }
  | {
      ok: false;
      reason:
        | "invalid-body"
        | "invalid-action"
        | "invalid-query"
        | "invalid-session-token"
        | "invalid-proximity"
        | "outside-county"
        | "invalid-limit"
        | "invalid-route"
        | "route-required"
        | "invalid-mapbox-id";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rounded(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function normalizeProximity(value: unknown): MapboxSearchProximity | null {
  if (!isRecord(value)) return null;
  if (typeof value.lng !== "number" || typeof value.lat !== "number") {
    return null;
  }
  if (!Number.isFinite(value.lng) || !Number.isFinite(value.lat)) return null;
  return {
    // Search only needs a relevance bias. Keep the same ~100 m privacy grid
    // used by Radius's routed-time services instead of sending a doorstep fix.
    lng: rounded(value.lng, 3),
    lat: rounded(value.lat, 3),
  };
}

function normalizeSessionToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return UUID_V4.test(token) ? token.toLowerCase() : null;
}

function normalizeRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 2 || value.length > MAX_ROUTE_CHARS) return null;
  // Encoded polyline uses printable ASCII. Reject whitespace/control/unicode
  // before it becomes a long metered query parameter.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 33 || code > 126) return null;
  }
  return value;
}

export function normalizeMapboxSearchBoxInput(
  value: unknown,
): MapboxSearchBoxValidation {
  if (!isRecord(value)) return { ok: false, reason: "invalid-body" };

  const action = value.action;
  if (action !== "suggest" && action !== "retrieve") {
    return { ok: false, reason: "invalid-action" };
  }

  const sessionToken = normalizeSessionToken(value.sessionToken);
  if (!sessionToken) {
    return { ok: false, reason: "invalid-session-token" };
  }

  const proximity = normalizeProximity(value.proximity);
  if (!proximity) return { ok: false, reason: "invalid-proximity" };
  if (!isInFrederickCountyArea(proximity.lng, proximity.lat)) {
    return { ok: false, reason: "outside-county" };
  }

  if (action === "retrieve") {
    if (typeof value.mapboxId !== "string" || !MAPBOX_ID.test(value.mapboxId)) {
      return { ok: false, reason: "invalid-mapbox-id" };
    }
    return {
      ok: true,
      value: {
        action,
        mapboxId: value.mapboxId,
        sessionToken,
        proximity,
      },
    };
  }

  if (typeof value.q !== "string") {
    return { ok: false, reason: "invalid-query" };
  }
  const q = value.q.replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > MAX_QUERY_CHARS) {
    return { ok: false, reason: "invalid-query" };
  }

  const limit = value.limit === undefined ? MAX_RESULTS : value.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_RESULTS
  ) {
    return { ok: false, reason: "invalid-limit" };
  }

  const hasRouteOptions =
    value.routeGeometry !== undefined || value.timeDeviation !== undefined;
  if (value.route === undefined) {
    if (hasRouteOptions) return { ok: false, reason: "route-required" };
    return {
      ok: true,
      value: {
        action,
        q,
        sessionToken,
        ...(value.sessionStart === true ? { sessionStart: true } : {}),
        proximity,
        limit,
      },
    };
  }

  const route = normalizeRoute(value.route);
  if (!route) return { ok: false, reason: "invalid-route" };
  if (
    value.routeGeometry !== undefined &&
    value.routeGeometry !== "polyline" &&
    value.routeGeometry !== "polyline6"
  ) {
    return { ok: false, reason: "invalid-route" };
  }
  if (
    value.timeDeviation !== undefined &&
    (typeof value.timeDeviation !== "number" ||
      !Number.isFinite(value.timeDeviation) ||
      value.timeDeviation <= 0 ||
      value.timeDeviation > 60)
  ) {
    return { ok: false, reason: "invalid-route" };
  }

  return {
    ok: true,
    value: {
      action,
      q,
      sessionToken,
      ...(value.sessionStart === true ? { sessionStart: true } : {}),
      proximity,
      limit,
      route,
      routeGeometry: value.routeGeometry ?? "polyline",
      ...(value.timeDeviation === undefined
        ? {}
        : { timeDeviation: rounded(value.timeDeviation, 1) }),
    },
  };
}

function plainText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gi, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function safeNumber(
  value: unknown,
  max: number,
  precision = 0,
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  ) {
    return undefined;
  }
  return rounded(value, precision);
}

function safeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .slice(0, 8)
    .map((item) => plainText(item, 64))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function safeMapboxId(value: unknown): string | null {
  return typeof value === "string" && MAPBOX_ID.test(value) ? value : null;
}

function sanitizeSuggestion(value: unknown): MapboxSearchSuggestion | null {
  if (!isRecord(value)) return null;
  const mapboxId = safeMapboxId(value.mapbox_id);
  const name = plainText(value.name_preferred ?? value.name, 160);
  const featureType = plainText(value.feature_type, 32);
  if (!mapboxId || !name || !featureType) return null;

  return {
    mapboxId,
    name,
    featureType,
    ...(plainText(value.address, 180)
      ? { address: plainText(value.address, 180) }
      : {}),
    ...(plainText(value.full_address, 260)
      ? { fullAddress: plainText(value.full_address, 260) }
      : {}),
    ...(plainText(value.place_formatted, 220)
      ? { placeFormatted: plainText(value.place_formatted, 220) }
      : {}),
    ...(plainText(value.maki, 48) ? { maki: plainText(value.maki, 48) } : {}),
    ...(safeStringList(value.poi_category)
      ? { categories: safeStringList(value.poi_category) }
      : {}),
    ...(plainText(value.operational_status, 32)
      ? { status: plainText(value.operational_status, 32) }
      : {}),
    ...(safeNumber(value.distance, 250_000) !== undefined
      ? { distanceMeters: safeNumber(value.distance, 250_000) }
      : {}),
    ...(safeNumber(value.added_distance, 250_000) !== undefined
      ? { addedDistanceMeters: safeNumber(value.added_distance, 250_000) }
      : {}),
    ...(safeNumber(value.added_time, 1_440, 1) !== undefined
      ? { addedTimeMinutes: safeNumber(value.added_time, 1_440, 1) }
      : {}),
  };
}

function safePoint(value: unknown): MapboxSearchProximity | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    !isInFrederickCountyArea(lng, lat)
  ) {
    return null;
  }
  return { lng: rounded(lng, 6), lat: rounded(lat, 6) };
}

function safeRoutablePoint(value: unknown): MapboxSearchProximity | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value.slice(0, 4)) {
    if (!isRecord(item)) continue;
    const point = safePoint([item.longitude, item.latitude]);
    if (point) return point;
  }
  return undefined;
}

async function readJsonWithLimit(response: Response): Promise<unknown | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_UPSTREAM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function upstreamFailure(status: number): MapboxSearchBoxResponse {
  if (status === 429) {
    return {
      ok: false,
      reason: "upstream-rate-limited",
      retryable: true,
    };
  }
  return {
    ok: false,
    reason: "upstream-unavailable",
    retryable: status >= 500,
  };
}

function commonParams(
  sessionToken: string,
  proximity: MapboxSearchProximity,
): URLSearchParams {
  // Reapply the privacy grid at the final network boundary so a future
  // trusted server caller cannot accidentally bypass request normalization.
  const privateProximity = {
    lng: rounded(proximity.lng, 3),
    lat: rounded(proximity.lat, 3),
  };
  return new URLSearchParams({
    session_token: sessionToken,
    access_token: MAPBOX_SERVER_TOKEN,
    language: "en",
    proximity: `${privateProximity.lng},${privateProximity.lat}`,
  });
}

async function requestMapbox(url: URL): Promise<Response | MapboxSearchBoxResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: MAPBOX_SERVER_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { ok: false, reason: "upstream-timeout", retryable: true };
    }
    return { ok: false, reason: "upstream-unavailable", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}

function serviceAvailable(): MapboxSearchBoxResponse | null {
  if (process.env.MAPBOX_SEARCH_BOX_ENABLED !== "1") {
    return { ok: false, reason: "disabled", retryable: false };
  }
  if (!MAPBOX_SERVER_TOKEN) {
    return { ok: false, reason: "no-token", retryable: false };
  }
  return null;
}

export async function searchMapboxTemporary(
  input: MapboxSearchBoxInput,
): Promise<MapboxSearchBoxResponse> {
  const unavailable = serviceAvailable();
  if (unavailable) return unavailable;

  if (input.action === "suggest") {
    const params = commonParams(input.sessionToken, input.proximity);
    params.set("q", input.q);
    params.set("bbox", COUNTY_BBOX);
    params.set("country", "US");
    params.set("limit", String(input.limit));
    params.set("show_closed_pois", "false");
    params.set(
      "types",
      "poi,address,street,place,locality,neighborhood",
    );
    if (input.route) {
      params.set("sar_type", "isochrone");
      params.set("route", input.route);
      params.set("route_geometry", input.routeGeometry ?? "polyline");
      if (input.timeDeviation !== undefined) {
        params.set("time_deviation", String(input.timeDeviation));
      }
    }

    const upstream = await requestMapbox(
      new URL(`${SEARCH_BOX_BASE}/suggest?${params.toString()}`),
    );
    if (!(upstream instanceof Response)) return upstream;
    if (!upstream.ok) return upstreamFailure(upstream.status);
    if (input.sessionStart) {
      meterUsage("mapbox_search_box");
    }

    const payload = await readJsonWithLimit(upstream);
    if (!isRecord(payload) || !Array.isArray(payload.suggestions)) {
      return { ok: false, reason: "malformed-upstream", retryable: true };
    }
    const suggestions = payload.suggestions
      .slice(0, input.limit)
      .map(sanitizeSuggestion)
      .filter((item): item is MapboxSearchSuggestion => item !== null);

    return {
      ok: true,
      action: "suggest",
      temporary: true,
      provider: "Mapbox",
      suggestions,
      ...(plainText(payload.attribution, 700)
        ? { attribution: plainText(payload.attribution, 700) }
        : {}),
    };
  }

  const params = commonParams(input.sessionToken, input.proximity);
  const upstream = await requestMapbox(
    new URL(
      `${SEARCH_BOX_BASE}/retrieve/${encodeURIComponent(input.mapboxId)}?${params.toString()}`,
    ),
  );
  if (!(upstream instanceof Response)) return upstream;
  if (!upstream.ok) return upstreamFailure(upstream.status);

  const payload = await readJsonWithLimit(upstream);
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return { ok: false, reason: "malformed-upstream", retryable: true };
  }
  if (payload.features.length === 0) {
    return { ok: false, reason: "no-result", retryable: false };
  }

  for (const feature of payload.features.slice(0, 4)) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    if (safeMapboxId(feature.properties.mapbox_id) !== input.mapboxId) {
      continue;
    }
    const suggestion = sanitizeSuggestion(feature.properties);
    if (!suggestion) continue;
    const geometry = isRecord(feature.geometry) ? feature.geometry : null;
    const coordinates = geometry ? safePoint(geometry.coordinates) : null;
    if (!coordinates) continue;
    const coordinateDetails = isRecord(feature.properties.coordinates)
      ? feature.properties.coordinates
      : null;
    const routablePoint = coordinateDetails
      ? safeRoutablePoint(coordinateDetails.routable_points)
      : undefined;

    return {
      ok: true,
      action: "retrieve",
      temporary: true,
      provider: "Mapbox",
      result: {
        ...suggestion,
        coordinates,
        ...(routablePoint ? { routablePoint } : {}),
      },
      ...(plainText(payload.attribution, 700)
        ? { attribution: plainText(payload.attribution, 700) }
        : {}),
    };
  }

  return { ok: false, reason: "outside-county", retryable: false };
}
