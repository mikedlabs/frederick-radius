import "server-only";

import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { isInsideFrederickCounty } from "@/lib/geo";
import { createAbortDeadline } from "@/lib/promise-deadline";
import type { LiveEvent } from "@/lib/integrations/ical-live";

export const VISIT_FREDERICK_FEED_URL =
  "https://www.visitfrederick.org/event/rss/";
export const VISIT_FREDERICK_SNAPSHOT_BLOB =
  "events/visit-frederick-snapshot-v1.json";
export const MAX_VISIT_FREDERICK_SNAPSHOT_BYTES = 512 * 1_024;
export const MAX_VISIT_FREDERICK_EVENTS = 250;
export const VISIT_FREDERICK_SNAPSHOT_FRESH_MS = 3 * 60 * 60 * 1_000;
export const VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS =
  24 * 60 * 60 * 1_000;
export const VISIT_FREDERICK_MIN_ATTEMPT_INTERVAL_MS =
  100 * 60 * 1_000;

const DEFAULT_BLOB_READ_TIMEOUT_MS = 3_000;
const MAX_BLOB_READ_TIMEOUT_MS = 6_000;
const BLOB_WRITE_TIMEOUT_MS = 5_000;

export function visitFrederickFactsReuseApproved(): boolean {
  return process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED === "1";
}

export type VisitFrederickAttemptStatus =
  | "ok-native"
  | "ok-firecrawl"
  | "failed"
  | "not-found";

/**
 * Durable, factual event snapshot.
 *
 * Publisher prose and images are intentionally excluded. Visit Frederick's
 * policy requires permission for reuse of its content and images; this cache
 * retains only the event facts Radius needs to identify, date, locate, and
 * attribute a listing.
 */
export type VisitFrederickSnapshot = {
  version: 1;
  sourceUrl: typeof VISIT_FREDERICK_FEED_URL;
  lastAttemptAt: string;
  sourceFetchedAt: string | null;
  lastAttemptStatus: VisitFrederickAttemptStatus;
  events: LiveEvent[];
};

export type VisitFrederickSnapshotReadOptions = {
  cacheMode?: "cache-first" | "origin-fresh";
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type VisitFrederickSnapshotReadResult =
  | {
      state: "ok";
      snapshot: VisitFrederickSnapshot;
      etag: string;
    }
  | {
      state: "missing";
    }
  | {
      state: "unavailable";
      reason: string;
    };

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

export function isExactVisitFrederickOriginUrl(
  value: string,
  pathname: string,
): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "visitfrederick.org" ||
        host === "www.visitfrederick.org") &&
      (url.port === "" || url.port === "443") &&
      url.pathname.replace(/\/+$/, "") ===
        pathname.replace(/\/+$/, "") &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isExactVisitFrederickFeedUrl(value: string): boolean {
  return isExactVisitFrederickOriginUrl(value, "/event/rss");
}

function isVisitFrederickEventUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "visitfrederick.org" ||
        host === "www.visitfrederick.org") &&
      (url.port === "" || url.port === "443") &&
      url.pathname.startsWith("/event/") &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isFactualVisitFrederickEvent(
  value: unknown,
  verifiedAt: string | null,
): value is LiveEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<LiveEvent> & Record<string, unknown>;
  const startsAt = Date.parse(String(event.starts_at ?? ""));
  const endsAt = Date.parse(String(event.ends_at ?? ""));
  const lng = Number(event.geom?.lng);
  const lat = Number(event.geom?.lat);
  return (
    isBoundedString(event.id, 240) &&
    event.id.startsWith("vf-") &&
    isBoundedString(event.title, 400) &&
    event.description === "" &&
    !Object.prototype.hasOwnProperty.call(event, "hero_image") &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    endsAt >= startsAt &&
    isBoundedString(event.venue_name, 300, true) &&
    isBoundedString(event.address, 500, true) &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    isInsideFrederickCounty(lat, lng) &&
    isBoundedString(event.municipality, 80) &&
    Boolean(MUNICIPALITY_BY_SLUG[event.municipality]) &&
    isBoundedString(event.category, 80) &&
    event.organizer === "Visit Frederick" &&
    event.source === "visit-frederick" &&
    event.source_label === "Visit Frederick" &&
    isVisitFrederickEventUrl(event.url) &&
    typeof event.is_free === "boolean" &&
    (event.status === "scheduled" ||
      event.status === "cancelled" ||
      event.status === "postponed") &&
    isIsoDate(event.last_verified_at) &&
    verifiedAt !== null &&
    event.last_verified_at === verifiedAt
  );
}

export function isVisitFrederickSnapshot(
  value: unknown,
): value is VisitFrederickSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<VisitFrederickSnapshot>;
  if (
    snapshot.version !== 1 ||
    snapshot.sourceUrl !== VISIT_FREDERICK_FEED_URL ||
    !isIsoDate(snapshot.lastAttemptAt) ||
    (snapshot.sourceFetchedAt !== null &&
      !isIsoDate(snapshot.sourceFetchedAt)) ||
    !["ok-native", "ok-firecrawl", "failed", "not-found"].includes(
      String(snapshot.lastAttemptStatus),
    ) ||
    !Array.isArray(snapshot.events) ||
    snapshot.events.length > MAX_VISIT_FREDERICK_EVENTS
  ) {
    return false;
  }

  if (
    snapshot.events.length > 0 &&
    snapshot.sourceFetchedAt === null
  ) {
    return false;
  }
  return snapshot.events.every((event) =>
    isFactualVisitFrederickEvent(event, snapshot.sourceFetchedAt ?? null),
  );
}

async function readBoundedJson(
  stream: ReadableStream<Uint8Array>,
): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_VISIT_FREDERICK_SNAPSHOT_BYTES) {
        await reader.cancel(
          "Visit Frederick snapshot exceeded its read limit",
        );
        return null;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } finally {
    reader.releaseLock();
  }
}

/**
 * Strict read for the refresh worker. Missing is different from unavailable:
 * only a confirmed missing object may be replaced without an ETag. A timeout,
 * malformed object, or storage error must never look like "no previous data"
 * and overwrite a valid snapshot.
 */
export async function readVisitFrederickSnapshotState(
  {
    cacheMode = "origin-fresh",
    timeoutMs = DEFAULT_BLOB_READ_TIMEOUT_MS,
    signal,
  }: VisitFrederickSnapshotReadOptions = {},
): Promise<VisitFrederickSnapshotReadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      state: "unavailable",
      reason: "Blob storage is not configured",
    };
  }
  const boundedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(Math.floor(timeoutMs), MAX_BLOB_READ_TIMEOUT_MS)
      : DEFAULT_BLOB_READ_TIMEOUT_MS;
  const deadline = createAbortDeadline(boundedTimeoutMs, signal);
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(VISIT_FREDERICK_SNAPSHOT_BLOB, {
      access: "public",
      useCache: cacheMode === "cache-first",
      abortSignal: deadline.signal,
    });
    if (!result) return { state: "missing" };
    if (result.statusCode !== 200 || !result.stream) {
      return {
        state: "unavailable",
        reason: "Snapshot storage returned an unreadable response",
      };
    }
    if (
      !Number.isFinite(result.blob.size) ||
      result.blob.size < 0 ||
      result.blob.size > MAX_VISIT_FREDERICK_SNAPSHOT_BYTES ||
      typeof result.blob.etag !== "string" ||
      result.blob.etag.length === 0
    ) {
      try {
        await result.stream.cancel(
          "Visit Frederick snapshot exceeded its declared read limit",
        );
      } catch {
        // The malformed response is already being discarded.
      }
      return {
        state: "unavailable",
        reason: "The stored snapshot failed its metadata checks",
      };
    }
    const parsed = await readBoundedJson(result.stream);
    return isVisitFrederickSnapshot(parsed)
      ? {
          state: "ok",
          snapshot: parsed,
          etag: result.blob.etag,
        }
      : {
          state: "unavailable",
          reason: "The stored snapshot failed validation",
        };
  } catch {
    return {
      state: "unavailable",
      reason: "Snapshot storage was unavailable",
    };
  } finally {
    deadline.dispose();
  }
}

/** Fail-soft read used by public pages. Operational callers use the stateful
 * form above so they never confuse an unavailable Blob with a missing one. */
export async function readStoredVisitFrederickSnapshot(
  options: VisitFrederickSnapshotReadOptions = {},
): Promise<VisitFrederickSnapshot | null> {
  const result = await readVisitFrederickSnapshotState(options);
  return result.state === "ok" ? result.snapshot : null;
}

export type VisitFrederickSnapshotWriteResult = {
  stored: boolean;
  url?: string;
  etag?: string;
  conflict?: boolean;
  reason?: string;
};

export async function writeVisitFrederickSnapshot(
  snapshot: VisitFrederickSnapshot,
  options: { ifMatch?: string } = {},
): Promise<VisitFrederickSnapshotWriteResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      stored: false,
      reason: "Blob storage is not configured",
    };
  }
  if (!isVisitFrederickSnapshot(snapshot)) {
    return {
      stored: false,
      reason: "Snapshot validation failed",
    };
  }
  const serialized = JSON.stringify(snapshot);
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_VISIT_FREDERICK_SNAPSHOT_BYTES
  ) {
    return {
      stored: false,
      reason: "Snapshot exceeded the storage limit",
    };
  }

  const deadline = createAbortDeadline(BLOB_WRITE_TIMEOUT_MS);
  let isPreconditionFailure: (error: unknown) => boolean = () => false;
  try {
    const { put, BlobPreconditionFailedError } =
      await import("@vercel/blob");
    isPreconditionFailure = (error: unknown) =>
      error instanceof BlobPreconditionFailedError;
    const blob = await put(VISIT_FREDERICK_SNAPSHOT_BLOB, serialized, {
      access: "public",
      addRandomSuffix: false,
      // A confirmed-missing read may create the deterministic object once.
      // Every later write must carry the ETag observed by the worker.
      allowOverwrite: Boolean(options.ifMatch),
      abortSignal: deadline.signal,
      cacheControlMaxAge: 60,
      contentType: "application/json",
      maximumSizeInBytes: MAX_VISIT_FREDERICK_SNAPSHOT_BYTES,
      ...(options.ifMatch ? { ifMatch: options.ifMatch } : {}),
    });
    return { stored: true, url: blob.url, etag: blob.etag };
  } catch (error) {
    if (isPreconditionFailure(error)) {
      return {
        stored: false,
        conflict: true,
        reason: "A newer snapshot was kept",
      };
    }
    return {
      stored: false,
      reason: "Snapshot storage was unavailable",
    };
  } finally {
    deadline.dispose();
  }
}

export function visitFrederickSnapshotAgeMs(
  snapshot: VisitFrederickSnapshot,
  now: Date = new Date(),
): number {
  if (!snapshot.sourceFetchedAt) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    now.getTime() - Date.parse(snapshot.sourceFetchedAt),
  );
}
