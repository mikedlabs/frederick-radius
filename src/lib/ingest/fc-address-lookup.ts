import {
  isInFrederickCountyArea,
  isInsideFrederickCounty,
  type LngLat,
} from "@/lib/geo";

/**
 * Official Frederick County address points. This adapter deliberately performs
 * one exact, bounded query; it never downloads or mirrors the county layer.
 */
export const FREDERICK_COUNTY_ADDRESS_LAYER =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/Basemap/Addresses/MapServer/1";

const QUERY_URL = `${FREDERICK_COUNTY_ADDRESS_LAYER}/query`;
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_INPUT_LENGTH = 220;
const MAX_RESULTS = 25;
const MAX_RESPONSE_BYTES = 256_000;

const DIRECTIONS: Readonly<Record<string, string>> = {
  N: "N",
  NORTH: "N",
  S: "S",
  SOUTH: "S",
  E: "E",
  EAST: "E",
  W: "W",
  WEST: "W",
};

/** Values observed in the County layer, plus their common long forms. */
const STREET_TYPES: Readonly<Record<string, string>> = {
  ALLEY: "ALY",
  ALY: "ALY",
  AV: "AVE",
  AVE: "AVE",
  AVENUE: "AVE",
  BEND: "BND",
  BLVD: "BLVD",
  BOULEVARD: "BLVD",
  BND: "BND",
  CIR: "CIR",
  CIRCLE: "CIR",
  COURT: "CT",
  CROSSING: "XING",
  CT: "CT",
  DR: "DR",
  DRIVE: "DR",
  GARDENS: "GDNS",
  GDNS: "GDNS",
  HIGHWAY: "HWY",
  HWY: "HWY",
  LANDING: "LNDG",
  LANE: "LN",
  LN: "LN",
  LNDG: "LNDG",
  LOOP: "LOOP",
  MEWS: "MEWS",
  PARKWAY: "PKWY",
  PASS: "PASS",
  PATH: "PATH",
  PIKE: "PIKE",
  PKWY: "PKWY",
  PLACE: "PL",
  PLAZA: "PLZ",
  PL: "PL",
  PLZ: "PLZ",
  RAMP: "RAMP",
  RD: "RD",
  RDG: "RDG",
  RIDGE: "RDG",
  ROAD: "RD",
  RUN: "RUN",
  SQ: "SQ",
  SQUARE: "SQ",
  ST: "ST",
  STREET: "ST",
  TER: "TER",
  TERRACE: "TER",
  TPKE: "PIKE",
  TRAIL: "TRL",
  TRL: "TRL",
  TURNPIKE: "PIKE",
  WALK: "WALK",
  WAY: "WAY",
  XING: "XING",
};

const UNIT_TYPES: Readonly<Record<string, "APT" | "SUITE" | "UNIT">> = {
  APARTMENT: "APT",
  APT: "APT",
  STE: "SUITE",
  SUITE: "SUITE",
  UNIT: "UNIT",
};

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
  "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

export type CountyAddressQuery = {
  houseNumber: number;
  houseNumberSuffix?: string;
  streetFull: string;
  unitType?: "APT" | "SUITE" | "UNIT";
  unitNumber?: string;
  city?: string;
  zip?: string;
  normalizedAddress: string;
};

export type CountyAddressInputFailure =
  | "empty"
  | "too_long"
  | "imprecise"
  | "unsupported_state";

export type OfficialCountyAddressLookupResult =
  | {
      status: "match";
      source: "frederick_county_address_points";
      normalizedAddress: string;
      officialAddress: string;
      coordinate: LngLat;
      objectId: number;
      addressPointId?: number;
      updatedAt?: string;
      sourceRecords: number;
    }
  | {
      status: "invalid";
      reason: CountyAddressInputFailure;
    }
  | {
      status: "disabled";
      reason: "county_gis_disabled";
    }
  | {
      status: "not_found";
      reason: "no_exact_match" | "outside_county";
      normalizedAddress: string;
    }
  | {
      status: "ambiguous";
      reason: "multiple_exact_matches" | "result_limit";
      normalizedAddress: string;
      candidateCount: number;
    }
  | {
      status: "unavailable";
      reason:
        | "timeout"
        | "network"
        | "http_error"
        | "arcgis_error"
        | "invalid_response"
        | "response_too_large";
      httpStatus?: number;
    };

type ParseAddressResult =
  | { ok: true; query: CountyAddressQuery }
  | { ok: false; reason: CountyAddressInputFailure };

type ArcGisFeature = {
  attributes?: unknown;
  geometry?: unknown;
};

type ArcGisQueryResponse = {
  features?: unknown;
  exceededTransferLimit?: unknown;
  error?: unknown;
};

type ExactCandidate = {
  officialAddress: string;
  coordinate: LngLat;
  objectId: number;
  addressPointId?: number;
  updatedAt?: string;
};

type BoundedBodyResult =
  | { status: "ok"; text: string }
  | { status: "too_large" }
  | { status: "invalid_encoding" };

export type OfficialCountyAddressLookupOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function canonicalText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/\bUNITED STATES(?: OF AMERICA)?\b/gi, "US")
    .replace(/\bMARYLAND\b/gi, "MD")
    .replace(/#/g, " UNIT ")
    .replace(/[,.();:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function canonicalCity(value: string): string {
  return canonicalText(value)
    .replace(/^CITY OF\s+/, "")
    .replace(/\s+CITY$/, "")
    .trim();
}

function canonicalUnitNumber(value: string): string {
  return canonicalText(value).replace(/[^A-Z0-9-]/g, "");
}

function normalizedDisplay(query: Omit<CountyAddressQuery, "normalizedAddress">): string {
  const number = `${query.houseNumber}${query.houseNumberSuffix ?? ""}`;
  const unit = query.unitNumber
    ? `${query.unitType ?? "UNIT"} ${query.unitNumber}`
    : null;
  const stateAndZip = ["MD", query.zip].filter(Boolean).join(" ");
  return [`${number} ${query.streetFull}`, unit, query.city, stateAndZip]
    .filter(Boolean)
    .join(", ");
}

/**
 * Parse only full, street-level Maryland addresses. Venue names, towns, PO
 * boxes, intersections, and street-only strings are intentionally rejected.
 */
export function parseCountyAddressInput(input: string): ParseAddressResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  const clean = canonicalText(input);
  const numberMatch = /^(\d{1,6})([A-Z]?)\s+(.+)$/.exec(clean);
  if (!numberMatch) return { ok: false, reason: "imprecise" };

  const houseNumber = Number(numberMatch[1]);
  const houseNumberSuffix = numberMatch[2] || undefined;
  if (!Number.isInteger(houseNumber) || houseNumber <= 0) {
    return { ok: false, reason: "imprecise" };
  }

  const tokens = numberMatch[3].split(" ").filter(Boolean);
  let typeIndex = -1;
  for (let index = tokens.length - 1; index >= 1; index -= 1) {
    if (STREET_TYPES[tokens[index]]) {
      typeIndex = index;
      break;
    }
  }
  if (typeIndex < 1) return { ok: false, reason: "imprecise" };

  const beforeType = tokens.slice(0, typeIndex);
  const prefix = DIRECTIONS[beforeType[0]];
  const streetName = prefix ? beforeType.slice(1) : beforeType;
  if (streetName.length === 0) return { ok: false, reason: "imprecise" };

  const streetType = STREET_TYPES[tokens[typeIndex]];
  let tailIndex = typeIndex + 1;
  const suffix = DIRECTIONS[tokens[tailIndex]];
  if (suffix) tailIndex += 1;
  const streetFull = [prefix, ...streetName, streetType, suffix]
    .filter(Boolean)
    .join(" ");
  if (streetFull.length > 80) return { ok: false, reason: "imprecise" };

  const tail = tokens.slice(tailIndex);
  let unitType: "APT" | "SUITE" | "UNIT" | undefined;
  let unitNumber: string | undefined;
  if (tail.length > 0 && UNIT_TYPES[tail[0]]) {
    unitType = UNIT_TYPES[tail.shift()!];
    unitNumber = canonicalUnitNumber(tail.shift() ?? "") || undefined;
    if (!unitNumber) return { ok: false, reason: "imprecise" };
  }

  while (tail.at(-1) === "US" || tail.at(-1) === "USA") tail.pop();

  const zipIndex = tail.findIndex((token) => /^\d{5}(?:-\d{4})?$/.test(token));
  const zip = zipIndex >= 0 ? tail[zipIndex].slice(0, 5) : undefined;
  if (zipIndex >= 0 && zipIndex !== tail.length - 1) {
    return { ok: false, reason: "imprecise" };
  }

  // A two-letter locality word is not necessarily a state. In particular,
  // "Mt Airy" is a normal Frederick County locality, so scanning the entire
  // tail would misread MT as Montana. A state is only recognized in its
  // terminal postal position: immediately before a terminal ZIP, or as the
  // final token when no ZIP is present.
  const terminalStateIndex = zipIndex >= 0 ? zipIndex - 1 : tail.length - 1;
  const stateIndex =
    terminalStateIndex >= 0 && US_STATE_CODES.has(tail[terminalStateIndex])
      ? terminalStateIndex
      : undefined;
  if (stateIndex !== undefined && tail[stateIndex] !== "MD") {
    return { ok: false, reason: "unsupported_state" };
  }

  const localityEnd = stateIndex ?? (zipIndex >= 0 ? zipIndex : tail.length);
  const cityTokens = tail.slice(0, localityEnd);
  const city = cityTokens.length > 0
    ? canonicalCity(cityTokens.join(" ")) || undefined
    : undefined;
  const queryBase = {
    houseNumber,
    houseNumberSuffix,
    streetFull,
    unitType,
    unitNumber,
    city,
    zip,
  };
  return {
    ok: true,
    query: {
      ...queryBase,
      normalizedAddress: normalizedDisplay(queryBase),
    },
  };
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build the exact, capped ArcGIS request. Exported for contract tests. */
export function buildCountyAddressQueryUrl(query: CountyAddressQuery): string {
  const clauses = [
    `ST_NUM = ${query.houseNumber}`,
    `ST_FULL = ${sqlString(query.streetFull)}`,
    "STATUS = 'ACT'",
    "STATE = 'MD'",
  ];
  clauses.push(
    query.houseNumberSuffix
      ? `ST_NUM_SUFFIX = ${sqlString(query.houseNumberSuffix)}`
      : "(ST_NUM_SUFFIX IS NULL OR ST_NUM_SUFFIX = '')",
  );
  if (query.unitNumber) {
    clauses.push(`UNIT_NUM = ${sqlString(query.unitNumber)}`);
    if (query.unitType && query.unitType !== "UNIT") {
      clauses.push(`UNIT_TYPE = ${sqlString(query.unitType)}`);
    }
  } else {
    clauses.push("(UNIT_NUM IS NULL OR UNIT_NUM = '')");
  }
  if (query.zip) clauses.push(`ZIP_ADDR LIKE ${sqlString(`${query.zip}%`)}`);

  const url = new URL(QUERY_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", clauses.join(" AND "));
  url.searchParams.set(
    "outFields",
    [
      "OBJECTID",
      "ADDRESSPT_ID",
      "ST_NUM",
      "ST_NUM_SUFFIX",
      "ST_FULL",
      "ADD_FULL",
      "ADD_COMPLETE",
      "CITY",
      "STATE",
      "ZIP_ADDR",
      "STATUS",
      "UNIT_TYPE",
      "UNIT_NUM",
      "LAST_UPDATE",
    ].join(","),
  );
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("resultRecordCount", String(MAX_RESULTS));
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  const result = typeof value === "string" ? value.trim() : "";
  return result || undefined;
}

function optionalInteger(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isInteger(result) ? result : undefined;
}

function sameUnit(
  query: CountyAddressQuery,
  attributes: Record<string, unknown>,
): boolean {
  const returnedNumber = canonicalUnitNumber(
    optionalString(attributes.UNIT_NUM) ?? "",
  );
  const returnedType = canonicalText(optionalString(attributes.UNIT_TYPE) ?? "");
  if (!query.unitNumber) return !returnedNumber && !returnedType;
  if (returnedNumber !== query.unitNumber) return false;
  return (
    !query.unitType ||
    query.unitType === "UNIT" ||
    returnedType === query.unitType
  );
}

function featureMatchesQuery(
  feature: unknown,
  query: CountyAddressQuery,
): { candidate?: ExactCandidate; outsideCounty?: boolean; malformed?: boolean } {
  const record = asRecord(feature) as ArcGisFeature | null;
  if (!record) return { malformed: true };
  const attributes = asRecord(record.attributes);
  const geometry = asRecord(record.geometry);
  if (!attributes || !geometry) return { malformed: true };

  if (
    optionalInteger(attributes.ST_NUM) !== query.houseNumber ||
    canonicalText(optionalString(attributes.ST_NUM_SUFFIX) ?? "") !==
      (query.houseNumberSuffix ?? "") ||
    canonicalText(optionalString(attributes.ST_FULL) ?? "") !== query.streetFull ||
    canonicalText(optionalString(attributes.STATUS) ?? "") !== "ACT" ||
    canonicalText(optionalString(attributes.STATE) ?? "") !== "MD" ||
    !sameUnit(query, attributes)
  ) {
    return {};
  }
  if (
    query.city &&
    !query.zip &&
    canonicalCity(optionalString(attributes.CITY) ?? "") !== query.city
  ) {
    return {};
  }
  if (
    query.zip &&
    (optionalString(attributes.ZIP_ADDR) ?? "").slice(0, 5) !== query.zip
  ) {
    return {};
  }

  const objectId = optionalInteger(attributes.OBJECTID);
  const lng = Number(geometry.x);
  const lat = Number(geometry.y);
  if (objectId === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { malformed: true };
  }
  if (
    !isInsideFrederickCounty(lat, lng) ||
    !isInFrederickCountyArea(lng, lat)
  ) {
    return { outsideCounty: true };
  }

  const officialAddress =
    optionalString(attributes.ADD_COMPLETE) ??
    optionalString(attributes.ADD_FULL);
  if (!officialAddress) return { malformed: true };

  const updatedMillis = Number(attributes.LAST_UPDATE);
  const updatedDate = new Date(updatedMillis);
  const updatedAt = Number.isFinite(updatedMillis) &&
    Number.isFinite(updatedDate.getTime())
    ? updatedDate.toISOString()
    : undefined;
  return {
    candidate: {
      officialAddress,
      coordinate: { lng, lat },
      objectId,
      addressPointId: optionalInteger(attributes.ADDRESSPT_ID),
      updatedAt,
    },
  };
}

function candidateKey(candidate: ExactCandidate): string {
  return [
    canonicalText(candidate.officialAddress),
    candidate.coordinate.lng.toFixed(6),
    candidate.coordinate.lat.toFixed(6),
  ].join("|");
}

async function readBoundedResponseBody(
  response: Response,
): Promise<BoundedBodyResult> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESPONSE_BYTES
  ) {
    try {
      await response.body?.cancel("response exceeds County address limit");
    } catch {
      // The outcome remains a deterministic size rejection even if the
      // upstream stream has already closed and cannot be cancelled.
    }
    return { status: "too_large" };
  }

  const body = response.body;
  if (!body) return { status: "ok", text: "" };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytesRead += next.value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel("response exceeds County address limit");
        } catch {
          // The byte ceiling has already been enforced; cancellation is only
          // connection cleanup and must not change the public result.
        }
        return { status: "too_large" };
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { status: "invalid_encoding" };
  }
}

/**
 * Resolve one address against the official County layer. Every non-match is
 * explicit: callers can distinguish invalid input, a definitive exact miss,
 * ambiguity, and upstream unavailability without inventing a coordinate.
 */
export async function lookupOfficialCountyAddress(
  input: string,
  options: OfficialCountyAddressLookupOptions = {},
): Promise<OfficialCountyAddressLookupResult> {
  const parsed = parseCountyAddressInput(input);
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  if (process.env.FREDERICK_COUNTY_GIS_ENABLED === "0") {
    return { status: "disabled", reason: "county_gis_disabled" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestedTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(MAX_TIMEOUT_MS, Math.floor(requestedTimeout)))
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(buildCountyAddressQueryUrl(parsed.query), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        reason: "http_error",
        httpStatus: response.status,
      };
    }
    const body = await readBoundedResponseBody(response);
    if (body.status === "too_large") {
      return { status: "unavailable", reason: "response_too_large" };
    }
    if (body.status === "invalid_encoding") {
      return { status: "unavailable", reason: "invalid_response" };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body.text) as unknown;
    } catch {
      return { status: "unavailable", reason: "invalid_response" };
    }
    const payload = asRecord(raw) as ArcGisQueryResponse | null;
    if (!payload) return { status: "unavailable", reason: "invalid_response" };
    if (payload.error) return { status: "unavailable", reason: "arcgis_error" };
    if (!Array.isArray(payload.features)) {
      return { status: "unavailable", reason: "invalid_response" };
    }
    if (payload.exceededTransferLimit === true) {
      return {
        status: "ambiguous",
        reason: "result_limit",
        normalizedAddress: parsed.query.normalizedAddress,
        candidateCount: payload.features.length,
      };
    }

    const candidates = new Map<string, ExactCandidate>();
    let outsideCounty = false;
    let malformed = false;
    for (const feature of payload.features) {
      const inspected = featureMatchesQuery(feature, parsed.query);
      if (inspected.candidate) {
        candidates.set(candidateKey(inspected.candidate), inspected.candidate);
      }
      outsideCounty ||= inspected.outsideCounty === true;
      malformed ||= inspected.malformed === true;
    }

    if (candidates.size === 0) {
      if (malformed && payload.features.length > 0) {
        return { status: "unavailable", reason: "invalid_response" };
      }
      return {
        status: "not_found",
        reason: outsideCounty ? "outside_county" : "no_exact_match",
        normalizedAddress: parsed.query.normalizedAddress,
      };
    }
    if (candidates.size > 1) {
      return {
        status: "ambiguous",
        reason: "multiple_exact_matches",
        normalizedAddress: parsed.query.normalizedAddress,
        candidateCount: candidates.size,
      };
    }

    const match = candidates.values().next().value as ExactCandidate;
    return {
      status: "match",
      source: "frederick_county_address_points",
      normalizedAddress: parsed.query.normalizedAddress,
      ...match,
      sourceRecords: payload.features.length,
    };
  } catch (error) {
    const abortError = error instanceof Error && error.name === "AbortError";
    return {
      status: "unavailable",
      reason: timedOut || abortError ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}
