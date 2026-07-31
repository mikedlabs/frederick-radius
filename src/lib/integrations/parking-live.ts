import "server-only";
import { unstable_cache } from "next/cache";

/**
 * Live downtown-garage occupancy — DORMANT until a feed is wired.
 *
 * Frederick's real-time garage availability is real, but it lives inside the
 * "Park Frederick" app, which is powered by the ParkZen platform (the Android
 * package is `com.parkzen.frederick`; ParkZen was acquired by Parking Guidance
 * Systems). There is NO free public web feed — the live layer is a commercial
 * vendor API. ParkZen's counts are crowd-sourced (it infers a freed spot from a
 * phone's motion / car-Bluetooth disconnect, ~96% claimed accuracy), so they
 * are good ESTIMATES, not gate-counts. Treat them as "about this full," never as
 * an authoritative space-by-space ledger.
 *
 * Activation is deliberately two-step because the source is still
 * pending_review: `PARKING_OCCUPANCY_ENABLED=1` records the operator's explicit
 * approval, while `PARKING_OCCUPANCY_URL` supplies the licensed endpoint.
 * A stray City webpage URL must never activate the live badges or alert cron.
 * Disabled (the default), every user-facing path is a graceful no-op: we never
 * fabricate a count, exactly as `data/sources.yaml` and parking-garages.ts
 * already promise.
 *
 * The parser is deliberately shape-tolerant: the exact ParkZen response is not
 * confirmed, so it reads a few common field aliases, derives the missing one of
 * available/occupied from capacity when it can, and leaves anything it cannot
 * derive null. `parseOccupancy` is pure (no fetch, no env) so it is unit-tested
 * against representative shapes before the real feed is trusted.
 */

/** percent_full at/above which a garage is treated as "full" for alerts + UI. */
export const GARAGE_FULL_THRESHOLD = 90;
/** percent_full at/above which we show a "filling up" caution (but not full). */
export const GARAGE_FILLING_THRESHOLD = 75;
/** Maximum age accepted for an occupancy snapshot that may drive an alert. */
export const PARKING_OCCUPANCY_MAX_AGE_MS = 10 * 60 * 1_000;
export const PARKING_OCCUPANCY_MAX_BYTES = 64 * 1_024;
export const PARKING_OCCUPANCY_MAX_ROWS = 25;
export const PARKING_OCCUPANCY_MAX_FIELD_LENGTH = 256;
/** Frederick's public decks are far smaller; this rejects corrupt/hostile counts. */
export const PARKING_OCCUPANCY_MAX_COUNT = 10_000;

const PARKING_OCCUPANCY_TIMEOUT_MS = 8_000;
const PARKING_OCCUPANCY_FUTURE_TOLERANCE_MS = 2 * 60 * 1_000;
const PARKING_COUNT_TOLERANCE_RATIO = 0.02;
const PARKING_PERCENT_TOLERANCE_POINTS = 3;

export type ParkingAvailabilityState =
  | "closed"
  | "full"
  | "filling"
  | "available"
  | "open"
  | "unknown";

export type GarageOccupancy = {
  /** Our canonical ParkingGarage.slug, or null when the feed name can't be
   *  matched to one of the five city garages. */
  garageSlug: string | null;
  /** The name the feed reported (kept for debugging / unmatched decks). */
  name: string;
  available: number | null;
  occupied: number | null;
  capacity: number | null;
  percentFull: number | null;
  /** Raw status string from the feed (e.g. "OPEN", "FULL"), when present. */
  status: string | null;
  /** Honest normalized state. `open` does not claim a known free space count. */
  availabilityState: ParkingAvailabilityState;
  /** Derived only from an explicit CLOSED/OUT-OF-SERVICE status. */
  isClosed: boolean;
  /** Derived: at/over the full threshold, zero spaces, or an exact FULL state. */
  isFull: boolean;
  /** Derived: exact FILLING state or numeric threshold, but not full/closed. */
  isFilling: boolean;
  /** ISO timestamp the feed last updated this deck, when present. */
  updated: string | null;
};

export type ParkingOccupancySnapshot = {
  asOf: string | null;
  decks: GarageOccupancy[];
};

export type ParkingOccupancyUnavailableReason =
  | "disabled"
  | "missing-url"
  | "invalid-url"
  | "timeout"
  | "network"
  | "http"
  | "invalid-payload"
  | "stale";

export type ParkingOccupancyResult =
  | {
      status: "ok";
      checkedAt: string;
      snapshot: ParkingOccupancySnapshot;
    }
  | {
      status: "unavailable";
      checkedAt: string;
      reason: ParkingOccupancyUnavailableReason;
    };

const EMPTY: ParkingOccupancySnapshot = { asOf: null, decks: [] };

/** Explicit operator approval. A URL by itself is not permission to run. */
export function parkingFeedEnabled(): boolean {
  return process.env.PARKING_OCCUPANCY_ENABLED === "1";
}

/** True only when both approval and the endpoint are present. */
export function parkingFeedConfigured(): boolean {
  return parkingFeedEnabled() && Boolean(process.env.PARKING_OCCUPANCY_URL);
}

// Feed deck name → our canonical garage slug. The feed names are unconfirmed,
// so match on the distinctive street word rather than an exact string; an
// unmatched deck stays usable (garageSlug null) but won't badge a card.
const NAME_TO_SLUG: Array<[RegExp, string]> = [
  [/court/i, "court-street-parking-garage-frederick"],
  [/carroll|creek/i, "carroll-creek-parking-garage-frederick"],
  [/patrick/i, "west-patrick-street-parking-deck"],
  [/church/i, "church-street-garage"],
  [/all\s*saints/i, "east-all-saints-street-parking-garage"],
];

function resolveGarageSlug(name: string): string | null {
  for (const [re, slug] of NAME_TO_SLUG) if (re.test(name)) return slug;
  return null;
}

function strictNumber(v: unknown, allowPercentSuffix = false): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    let cleaned = v.trim().replace(/,/g, "");
    if (allowPercentSuffix && cleaned.endsWith("%")) {
      cleaned = cleaned.slice(0, -1).trim();
    }
    // Do not fish numbers out of arbitrary strings. In particular, scientific
    // notation and units must not silently become a different garage count.
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function count(v: unknown): number | null {
  const parsed = strictNumber(v);
  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= PARKING_OCCUPANCY_MAX_COUNT
    ? parsed
    : null;
}

function percent(v: unknown): number | null {
  const parsed = strictNumber(v, true);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeStatus(status: string | null): string {
  return (status ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reportedState(status: string | null): Exclude<
  ParkingAvailabilityState,
  "available"
> {
  switch (normalizeStatus(status)) {
    case "closed":
    case "temporarily closed":
    case "closed temporarily":
    case "out of service":
      return "closed";
    case "full":
    case "at capacity":
      return "full";
    case "filling":
    case "filling up":
    case "nearly full":
      return "filling";
    case "open":
    case "available":
      // A provider's OPEN/AVAILABLE status establishes operating state, not a
      // positive free-space count. Keep it distinct from `available`.
      return "open";
    default:
      // Exact states are deliberate: NOT CLOSED and NOT AVAILABLE stay unknown.
      return "unknown";
  }
}

function statusBlocksOccupancy(status: string | null): boolean {
  return [
    "not available",
    "unavailable",
    "offline",
    "sensor offline",
    "data unavailable",
    "unknown",
  ].includes(normalizeStatus(status));
}

type RawDeck = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawDeckList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return null;
  const list = raw.decks ?? raw.garages ?? raw.lots ?? raw.data;
  return Array.isArray(list) ? list : null;
}

function fieldsWithinLimit(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      if (current.length > PARKING_OCCUPANCY_MAX_FIELD_LENGTH) return false;
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (key.length > PARKING_OCCUPANCY_MAX_FIELD_LENGTH) return false;
      stack.push(nested);
    }
  }
  return true;
}

/**
 * Pure normalizer — no fetch, no env. Accepts whatever the feed returns
 * (`{ decks: [...] }`, a bare array, or `{ data: [...] }`) and produces the
 * typed snapshot, deriving counts where possible and never inventing them.
 */
export function parseOccupancy(raw: unknown): ParkingOccupancySnapshot {
  const root = isRecord(raw) ? raw : {};
  const list = rawDeckList(raw) ?? [];
  const decksRaw: RawDeck[] = list.filter(isRecord);

  const decks: GarageOccupancy[] = decksRaw
    .map((d): GarageOccupancy => {
      const name = str(d.name ?? d.deck ?? d.garage ?? d.lot ?? d.title) ?? "";
      const capacity = count(d.capacity ?? d.total ?? d.spaces ?? d.spots);
      let available = count(d.available ?? d.open ?? d.free ?? d.vacant ?? d.spaces_available);
      let occupied = count(d.occupied ?? d.used ?? d.taken ?? d.filled);
      if (capacity !== null) {
        if (available === null && occupied !== null) available = Math.max(0, capacity - occupied);
        if (occupied === null && available !== null) occupied = Math.max(0, capacity - available);
      }
      const percentSource =
        d.percent_full !== undefined && d.percent_full !== null
          ? "percent_full"
          : d.percentFull !== undefined && d.percentFull !== null
            ? "percentFull"
            : d.occupancy !== undefined && d.occupancy !== null
              ? "occupancy"
              : "occupancy_pct";
      const rawPercentValue =
        d.percent_full ?? d.percentFull ?? d.occupancy ?? d.occupancy_pct;
      let percentFull = percent(rawPercentValue);
      const rawPercent = strictNumber(rawPercentValue, true);
      const explicitlyPercent =
        typeof rawPercentValue === "string" && rawPercentValue.trim().endsWith("%");
      // Only the generic `occupancy` alias is commonly a 0–1 ratio. Fields
      // explicitly named percent/pct remain on their stated 0–100 scale.
      if (
        percentSource === "occupancy" &&
        !explicitlyPercent &&
        percentFull !== null &&
        rawPercent !== null &&
        rawPercent <= 1
      ) {
        percentFull = rawPercent * 100;
      }
      if (percentFull === null && capacity && occupied !== null) {
        percentFull = Math.round((occupied / capacity) * 100);
      }
      const status = str(d.status ?? d.state);
      const stated = reportedState(status);
      const availabilityState: ParkingAvailabilityState =
        statusBlocksOccupancy(status)
          ? "unknown"
          : stated === "closed"
          ? "closed"
          : stated === "full" ||
              (percentFull !== null && percentFull >= GARAGE_FULL_THRESHOLD) ||
              (available !== null && available <= 0)
            ? "full"
            : stated === "filling" ||
                (percentFull !== null &&
                  percentFull >= GARAGE_FILLING_THRESHOLD)
              ? "filling"
              : (available !== null && available > 0) ||
                  (percentFull !== null &&
                    percentFull < GARAGE_FILLING_THRESHOLD)
                ? "available"
                : stated === "open"
                  ? "open"
                  : "unknown";
      const isClosed = availabilityState === "closed";
      const isFull = availabilityState === "full";
      const isFilling = availabilityState === "filling";
      return {
        garageSlug: resolveGarageSlug(name),
        name,
        available,
        occupied,
        capacity,
        percentFull,
        status,
        availabilityState,
        isClosed,
        isFull,
        isFilling,
        updated: str(d.updated ?? d.last_updated ?? d.timestamp ?? d.as_of),
      };
    })
    .filter((d) => d.name);

  return { asOf: str(root.as_of ?? root.asOf ?? root.updated), decks };
}

class ParkingOccupancyUnavailableError extends Error {
  constructor(readonly reason: ParkingOccupancyUnavailableReason) {
    super(`Parking occupancy unavailable: ${reason}`);
    this.name = "ParkingOccupancyUnavailableError";
  }
}

function fail(reason: ParkingOccupancyUnavailableReason): never {
  throw new ParkingOccupancyUnavailableError(reason);
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertFreshTimestamp(value: string, nowMs: number): void {
  const parsed = timestampMs(value);
  if (parsed === null) fail("invalid-payload");
  if (
    parsed > nowMs + PARKING_OCCUPANCY_FUTURE_TOLERANCE_MS ||
    nowMs - parsed > PARKING_OCCUPANCY_MAX_AGE_MS
  ) {
    fail("stale");
  }
}

function hasOccupancySignal(deck: GarageOccupancy): boolean {
  const countSignal =
    deck.available !== null ||
    deck.occupied !== null ||
    deck.percentFull !== null;
  const statusSignal = deck.availabilityState !== "unknown";
  return countSignal || statusSignal;
}

const COUNT_FIELD_GROUPS = [
  ["capacity", "total", "spaces", "spots"],
  ["available", "open", "free", "vacant", "spaces_available"],
  ["occupied", "used", "taken", "filled"],
] as const;
const PERCENT_FIELDS = [
  "percent_full",
  "percentFull",
  "occupancy",
  "occupancy_pct",
] as const;

function selectedField(
  row: RawDeck,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function isNumericPlaceholder(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  return ["", "n/a", "na", "unknown", "unavailable", "--", "null"].includes(
    value.trim().toLowerCase(),
  );
}

function validateRawNumbers(row: RawDeck): void {
  for (const keys of COUNT_FIELD_GROUPS) {
    const value = selectedField(row, keys);
    if (!isNumericPlaceholder(value) && count(value) === null) {
      fail("invalid-payload");
    }
  }
  const rawPercent = selectedField(row, PERCENT_FIELDS);
  if (!isNumericPlaceholder(rawPercent) && percent(rawPercent) === null) {
    fail("invalid-payload");
  }
}

function validateDeckConsistency(deck: GarageOccupancy): void {
  const { available, occupied, capacity, percentFull } = deck;
  if (
    (available !== null && available < 0) ||
    (occupied !== null && occupied < 0) ||
    (capacity !== null && capacity <= 0) ||
    (capacity !== null && available !== null && available > capacity) ||
    (capacity !== null && occupied !== null && occupied > capacity)
  ) {
    fail("invalid-payload");
  }

  if (capacity === null) return;
  const countTolerance = Math.max(
    2,
    capacity * PARKING_COUNT_TOLERANCE_RATIO,
  );
  if (
    available !== null &&
    occupied !== null &&
    Math.abs(available + occupied - capacity) > countTolerance
  ) {
    fail("invalid-payload");
  }

  if (percentFull === null) return;
  if (
    occupied !== null &&
    Math.abs(percentFull - (occupied / capacity) * 100) >
      PARKING_PERCENT_TOLERANCE_POINTS
  ) {
    fail("invalid-payload");
  }
  if (
    available !== null &&
    Math.abs(percentFull - ((capacity - available) / capacity) * 100) >
      PARKING_PERCENT_TOLERANCE_POINTS
  ) {
    fail("invalid-payload");
  }
}

function assertSnapshotFreshForRead(
  snapshot: ParkingOccupancySnapshot,
  nowMs: number,
): ParkingOccupancySnapshot {
  if (snapshot.decks.length === 0) fail("invalid-payload");
  for (const deck of snapshot.decks) {
    if (![
      "closed",
      "full",
      "filling",
      "available",
      "open",
      "unknown",
    ].includes(deck.availabilityState)) {
      fail("invalid-payload");
    }
    if (!deck.updated) fail("invalid-payload");
    assertFreshTimestamp(deck.updated, nowMs);
  }
  return snapshot;
}

function validateSnapshot(
  raw: unknown,
  nowMs: number,
): ParkingOccupancySnapshot {
  const rows = rawDeckList(raw);
  if (
    !rows ||
    rows.length === 0 ||
    rows.length > PARKING_OCCUPANCY_MAX_ROWS ||
    rows.some((row) => !isRecord(row))
  ) {
    fail("invalid-payload");
  }
  if (!fieldsWithinLimit(raw)) fail("invalid-payload");

  for (const row of rows) {
    if (!isRecord(row)) fail("invalid-payload");
    validateRawNumbers(row);
  }

  const parsed = parseOccupancy(raw);
  const knownDecks = parsed.decks.filter((deck) => deck.garageSlug);
  if (knownDecks.length === 0) fail("invalid-payload");
  // Explicit sensor/data-unavailable states invalidate the live snapshot.
  // Their numeric fields may be stale and must not leak to map/Ask/alerts.
  if (knownDecks.some((deck) => statusBlocksOccupancy(deck.status))) {
    fail("invalid-payload");
  }
  if (knownDecks.some((deck) => !hasOccupancySignal(deck))) {
    fail("invalid-payload");
  }

  const canonicalSlugs = knownDecks.map((deck) => deck.garageSlug);
  if (new Set(canonicalSlugs).size !== canonicalSlugs.length) {
    fail("invalid-payload");
  }

  for (const deck of knownDecks) {
    validateDeckConsistency(deck);
  }

  if (parsed.asOf) {
    assertFreshTimestamp(parsed.asOf, nowMs);
    // A current envelope must not conceal an individually stale deck.
    for (const deck of knownDecks) {
      if (deck.updated) assertFreshTimestamp(deck.updated, nowMs);
    }
  } else {
    // Without a feed-level timestamp, every accepted deck must carry its own.
    for (const deck of knownDecks) {
      if (!deck.updated) fail("invalid-payload");
      assertFreshTimestamp(deck.updated, nowMs);
    }
  }

  const normalized = {
    asOf: parsed.asOf,
    decks: knownDecks.map((deck) => ({
      ...deck,
      updated: deck.updated ?? parsed.asOf,
    })),
  };
  return assertSnapshotFreshForRead(normalized, nowMs);
}

type FetchOccupancyOptions = {
  fetchImpl?: typeof fetch;
  nowMs?: number;
  timeoutMs?: number;
};

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredHeader = response.headers.get("content-length");
  if (declaredHeader) {
    const declared = Number(declaredHeader);
    if (
      !Number.isFinite(declared) ||
      declared < 0 ||
      declared > PARKING_OCCUPANCY_MAX_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      fail("invalid-payload");
    }
  }
  if (!response.body) fail("invalid-payload");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > PARKING_OCCUPANCY_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        fail("invalid-payload");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof ParkingOccupancyUnavailableError) throw error;
    fail("network");
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(chunks.join("")) as unknown;
  } catch {
    fail("invalid-payload");
  }
}

/**
 * One strict upstream pull. It throws a sanitized typed error so a failed
 * request is never stored by the successful-snapshot cache.
 */
export async function fetchParkingOccupancyFresh(
  options: FetchOccupancyOptions = {},
): Promise<ParkingOccupancySnapshot> {
  const url = process.env.PARKING_OCCUPANCY_URL;
  if (!url) fail("missing-url");
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    fail("invalid-url");
  }
  if (endpoint.protocol !== "https:") fail("invalid-url");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "frederick-radius",
  };
  // Optional bearer/key for the licensed vendor endpoint.
  if (process.env.PARKING_OCCUPANCY_KEY) {
    headers.Authorization = `Bearer ${process.env.PARKING_OCCUPANCY_KEY}`;
  }

  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(endpoint, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(
        options.timeoutMs ?? PARKING_OCCUPANCY_TIMEOUT_MS,
      ),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      fail("timeout");
    }
    fail("network");
  }

  if (!res.ok) fail("http");
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    fail("invalid-payload");
  }

  const raw = await readBoundedJson(res);
  return validateSnapshot(raw, options.nowMs ?? Date.now());
}

/**
 * Successful snapshots share a short cache across the parking surfaces.
 * Rejections escape this boundary, so a network outage is never cached as a
 * healthy empty feed.
 */
const getCachedParkingOccupancy = unstable_cache(
  fetchParkingOccupancyFresh,
  ["parking-occupancy-v4"],
  {
    revalidate: 60,
    tags: ["parking-occupancy"],
  },
);

/**
 * Revalidate cache output at read time. Next may serve a stale value while a
 * background refresh fails; that stale-while-revalidate behavior is useful for
 * ordinary content but must never make an old occupancy count look current.
 */
export async function resolveParkingOccupancyResult(
  loadSnapshot: () => Promise<ParkingOccupancySnapshot>,
  nowMs = Date.now(),
): Promise<ParkingOccupancyResult> {
  const checkedAt = new Date(nowMs).toISOString();
  try {
    const snapshot = await loadSnapshot();
    return {
      status: "ok",
      checkedAt,
      snapshot: assertSnapshotFreshForRead(snapshot, nowMs),
    };
  } catch (error) {
    return {
      status: "unavailable",
      checkedAt,
      reason:
        error instanceof ParkingOccupancyUnavailableError
          ? error.reason
          : "network",
    };
  }
}

export async function getParkingOccupancyResult(): Promise<ParkingOccupancyResult> {
  const nowMs = Date.now();
  const checkedAt = new Date(nowMs).toISOString();
  if (!parkingFeedEnabled()) {
    return { status: "unavailable", checkedAt, reason: "disabled" };
  }
  if (!process.env.PARKING_OCCUPANCY_URL) {
    return { status: "unavailable", checkedAt, reason: "missing-url" };
  }
  return resolveParkingOccupancyResult(getCachedParkingOccupancy, nowMs);
}

/**
 * Compatibility helper for user-facing surfaces. A failed or disabled live
 * feed remains neutral: static garage facts still render, but no live count is
 * invented.
 */
export async function getParkingOccupancy(): Promise<ParkingOccupancySnapshot> {
  const result = await getParkingOccupancyResult();
  return result.status === "ok" ? result.snapshot : EMPTY;
}

/** Live occupancy keyed by our garage slug — for the /parking cards. Only
 *  matched, real decks land in the map; dormant ⇒ empty map. */
export async function occupancyByGarageSlug(): Promise<Map<string, GarageOccupancy>> {
  const snap = await getParkingOccupancy();
  const m = new Map<string, GarageOccupancy>();
  for (const d of snap.decks) if (d.garageSlug) m.set(d.garageSlug, d);
  return m;
}
