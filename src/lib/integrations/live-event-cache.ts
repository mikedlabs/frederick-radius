import type { LiveEvent } from "@/lib/integrations/ical-live";

/**
 * Next's persistent Data Cache rejects entries around 2 MB. Keep a full
 * 500 kB of headroom for the cache envelope and serializer differences.
 *
 * This budget applies to the complete value returned by unstable_cache, not
 * merely to the event array inside it.
 */
export const LIVE_EVENT_CACHE_ENTRY_BUDGET_BYTES = 1_500_000;

export type LiveEventCacheSourceState = "ok" | "failed" | "disabled";

type PlacementCode = 0 | 1 | 2;
type AttendanceCode = 0 | 1 | 2 | 3;
type StatusCode = 0 | 1 | 2;
type SourceStateCode = 0 | 1 | 2;

/**
 * Positional storage deliberately omits repeated object keys, source, and
 * source_label. The latter two are properties of the source shard and are
 * restored after the cache read.
 */
export type CachedLiveEventRecord = [
  id: string,
  title: string,
  description: string,
  startsAt: string,
  endsAt: string,
  allDay: 0 | 1,
  venueName: string,
  address: string,
  lng: number,
  lat: number,
  placement: PlacementCode,
  municipality: string,
  category: string,
  organizer: string,
  url: string,
  isFree: 0 | 1,
  priceText: string | null,
  attendanceMode: AttendanceCode,
  onlineUrl: string | null,
  heroImage: string | null,
  status: StatusCode,
  lastVerifiedAt: string,
  publisherUpdatedAt: string | null,
];

export type CachedLiveEventPage = {
  /** Cache payload shape version. */
  v: 1;
  /** Source health: 0 ok, 1 failed/partial, 2 disabled. */
  t: SourceStateCode;
  /** Compact event records. */
  e: CachedLiveEventRecord[];
  /** Last stable cursor when another page remains. */
  n: string | null;
};

const encoder = new TextEncoder();

const TEXT_LIMIT_BYTES = {
  id: 2_048,
  title: 4_096,
  description: 4_096,
  timestamp: 128,
  venue: 2_048,
  address: 4_096,
  municipality: 512,
  category: 512,
  organizer: 2_048,
  url: 16_384,
  price: 1_024,
} as const;

export function liveEventCacheEntryBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function hashText(value: string): string {
  // Two independent 32-bit FNV-1a lanes give a compact 64-bit cursor suffix
  // without pulling Node crypto into this pure, isomorphic helper.
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function fitUtf8(
  value: string,
  maxBytes: number,
  suffix = "…",
): string {
  if (liveEventCacheEntryBytes(value) <= maxBytes) return value;

  const suffixBytes = encoder.encode(suffix).byteLength;
  const target = Math.max(0, maxBytes - suffixBytes);
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = value.slice(0, mid);
    if (encoder.encode(candidate).byteLength <= target) low = mid;
    else high = mid - 1;
  }

  // Do not leave half of a UTF-16 surrogate pair at the boundary.
  let end = low;
  if (
    end > 0
    && end < value.length
    && /[\uD800-\uDBFF]/.test(value.charAt(end - 1))
  ) {
    end -= 1;
  }
  return `${value.slice(0, end)}${suffix}`;
}

function fitId(value: string): string {
  if (liveEventCacheEntryBytes(value) <= TEXT_LIMIT_BYTES.id) return value;
  const suffix = `~${hashText(value)}`;
  return fitUtf8(value, TEXT_LIMIT_BYTES.id, suffix);
}

function fitRequiredUrl(value: string): string {
  return liveEventCacheEntryBytes(value) <= TEXT_LIMIT_BYTES.url ? value : "";
}

function fitOptionalUrl(value: string | undefined): string | null {
  if (!value) return null;
  return liveEventCacheEntryBytes(value) <= TEXT_LIMIT_BYTES.url ? value : null;
}

function placementCode(
  placement: LiveEvent["placement"],
): PlacementCode {
  if (placement === "geocoded") return 1;
  if (placement === "venue") return 2;
  return 0;
}

function attendanceCode(
  mode: LiveEvent["attendance_mode"],
): AttendanceCode {
  if (mode === "physical") return 1;
  if (mode === "online") return 2;
  if (mode === "mixed") return 3;
  return 0;
}

function statusCode(status: LiveEvent["status"]): StatusCode {
  if (status === "cancelled") return 1;
  if (status === "postponed") return 2;
  return 0;
}

function sourceStateCode(state: LiveEventCacheSourceState): SourceStateCode {
  if (state === "failed") return 1;
  if (state === "disabled") return 2;
  return 0;
}

export function liveEventCacheSourceState(
  page: CachedLiveEventPage,
): LiveEventCacheSourceState {
  if (page.t === 1) return "failed";
  if (page.t === 2) return "disabled";
  return "ok";
}

export function compactLiveEvent(event: LiveEvent): CachedLiveEventRecord {
  return [
    fitId(event.id),
    fitUtf8(event.title, TEXT_LIMIT_BYTES.title),
    fitUtf8(event.description, TEXT_LIMIT_BYTES.description),
    fitUtf8(event.starts_at, TEXT_LIMIT_BYTES.timestamp),
    fitUtf8(event.ends_at, TEXT_LIMIT_BYTES.timestamp),
    event.is_all_day ? 1 : 0,
    fitUtf8(event.venue_name, TEXT_LIMIT_BYTES.venue),
    fitUtf8(event.address, TEXT_LIMIT_BYTES.address),
    event.geom.lng,
    event.geom.lat,
    placementCode(event.placement),
    fitUtf8(event.municipality, TEXT_LIMIT_BYTES.municipality),
    fitUtf8(event.category, TEXT_LIMIT_BYTES.category),
    fitUtf8(event.organizer, TEXT_LIMIT_BYTES.organizer),
    fitRequiredUrl(event.url),
    event.is_free ? 1 : 0,
    event.price_text
      ? fitUtf8(event.price_text, TEXT_LIMIT_BYTES.price)
      : null,
    attendanceCode(event.attendance_mode),
    fitOptionalUrl(event.online_url),
    fitOptionalUrl(event.hero_image),
    statusCode(event.status),
    fitUtf8(event.last_verified_at, TEXT_LIMIT_BYTES.timestamp),
    event.publisher_updated_at
      ? fitUtf8(event.publisher_updated_at, TEXT_LIMIT_BYTES.timestamp)
      : null,
  ];
}

export function inflateCachedLiveEvent(
  record: CachedLiveEventRecord,
  source: LiveEvent["source"],
  sourceLabel: string,
): LiveEvent {
  const event: LiveEvent = {
    id: record[0],
    title: record[1],
    description: record[2],
    starts_at: record[3],
    ends_at: record[4],
    venue_name: record[6],
    address: record[7],
    geom: { lng: record[8], lat: record[9] },
    municipality: record[11],
    category: record[12],
    organizer: record[13],
    source,
    source_label: sourceLabel,
    url: record[14],
    is_free: record[15] === 1,
    status:
      record[20] === 1
        ? "cancelled"
        : record[20] === 2
          ? "postponed"
          : "scheduled",
    last_verified_at: record[21],
  };

  if (record[5] === 1) event.is_all_day = true;
  if (record[10] === 1) event.placement = "geocoded";
  else if (record[10] === 2) event.placement = "venue";
  if (record[16]) event.price_text = record[16];
  if (record[17] === 1) event.attendance_mode = "physical";
  else if (record[17] === 2) event.attendance_mode = "online";
  else if (record[17] === 3) event.attendance_mode = "mixed";
  if (record[18]) event.online_url = record[18];
  if (record[19]) event.hero_image = record[19];
  if (record[22]) event.publisher_updated_at = record[22];

  return event;
}

type PreparedRecord = {
  cursor: string;
  record: CachedLiveEventRecord;
};

function prepareRecords(events: readonly LiveEvent[]): PreparedRecord[] {
  const compact = events.map(compactLiveEvent);
  const sorted = compact
    .map((record) => ({
      base: `${record[3]}:${hashText(JSON.stringify(record))}`,
      record,
    }))
    .sort((a, b) => a.base.localeCompare(b.base));

  let priorBase = "";
  let duplicateOrdinal = 0;
  return sorted.map(({ base, record }) => {
    duplicateOrdinal = base === priorBase ? duplicateOrdinal + 1 : 0;
    priorBase = base;
    return {
      cursor: `${base}:${duplicateOrdinal.toString(36).padStart(4, "0")}`,
      record,
    };
  });
}

/**
 * Build one cache-safe source page. Calling again with `page.n` yields the
 * next page. No event is dropped: the source continues until `n` is null.
 */
export function buildLiveEventCachePage(
  events: readonly LiveEvent[],
  state: LiveEventCacheSourceState,
  afterCursor: string | null = null,
  budgetBytes = LIVE_EVENT_CACHE_ENTRY_BUDGET_BYTES,
): CachedLiveEventPage {
  if (!Number.isFinite(budgetBytes) || budgetBytes < 1_024) {
    throw new Error("live event cache page budget must be at least 1024 bytes");
  }

  const remaining = prepareRecords(events).filter(
    ({ cursor }) => afterCursor === null || cursor > afterCursor,
  );
  const records: CachedLiveEventRecord[] = [];
  let lastCursor: string | null = null;
  // Exact byte count for the serialized `e` array. Start with [] and add one
  // comma plus each already-serialized positional record. This keeps packing
  // O(n); stringifying the growing array on every iteration was O(n²).
  let recordsBytes = 2;

  for (let index = 0; index < remaining.length; index += 1) {
    const item = remaining[index];
    const hasMore = index < remaining.length - 1;
    const recordBytes = liveEventCacheEntryBytes(item.record);
    const candidateRecordsBytes =
      recordsBytes + (records.length > 0 ? 1 : 0) + recordBytes;
    const envelope: CachedLiveEventPage = {
      v: 1,
      t: sourceStateCode(state),
      e: [],
      n: hasMore ? item.cursor : null,
    };
    // The empty array contributes two bytes to the envelope measurement.
    const candidateBytes =
      liveEventCacheEntryBytes(envelope) - 2 + candidateRecordsBytes;
    if (candidateBytes > budgetBytes) {
      if (records.length === 0) {
        throw new Error(
          "one compact live event exceeded the cache page byte budget",
        );
      }
      break;
    }
    records.push(item.record);
    recordsBytes = candidateRecordsBytes;
    lastCursor = item.cursor;
  }

  const page: CachedLiveEventPage = {
    v: 1,
    t: sourceStateCode(state),
    e: records,
    n: records.length < remaining.length ? lastCursor : null,
  };
  const measured = liveEventCacheEntryBytes(page);
  if (measured > budgetBytes) {
    throw new Error(
      `live event cache page measured ${measured} bytes, above ${budgetBytes}`,
    );
  }
  if (page.n !== null && page.e.length === 0) {
    throw new Error("live event cache pagination made no progress");
  }
  return page;
}
