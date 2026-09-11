/**
 * Small, privacy-bounded offline handoff.
 *
 * This is deliberately not a second application database. It keeps one
 * IndexedDB record with:
 *   - aggregate Saved counts (never the saved ids, notes, or account data),
 *   - a short public Today read,
 *   - coarse preference identifiers (never coordinates), and
 *   - the last time an online app surface refreshed the record.
 *
 * The service worker still treats every navigation as network-first and never
 * caches personalized HTML. `/offline` reads this record in the browser only.
 */

export const OFFLINE_DB_NAME = "frederick-radius-offline";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_STORE_NAME = "handoff";
export const OFFLINE_RECORD_KEY = "current";
export const OFFLINE_PREFERENCES_CHANGE_EVENT = "fr:offline-preferences-change";

export const OFFLINE_SNAPSHOT_VERSION = 1 as const;
export const OFFLINE_TODAY_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
export const OFFLINE_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

const MAX_RECORD_BYTES = 12_000;
const MAX_IDENTIFIER_LENGTH = 64;
const MAX_INTERESTS = 8;
const MAX_SAVED_COUNT = 999;
const IDENTIFIER = /^[a-z0-9][a-z0-9:-]{0,63}$/;
const SAFE_PATH =
  /^\/(?:today|events\/[a-z0-9][a-z0-9-]{0,119}|places\/[a-z0-9][a-z0-9-]{0,79})$/;

export type OfflineSavedSummary = {
  updatedAt: string;
  total: number;
  place: number;
  event: number;
  radius: number;
  beer: number;
  capped: boolean;
};

export type OfflinePreferenceSummary = {
  updatedAt: string;
  homeMunicipality?: string;
  scope?: string;
  mode?: "resident" | "visitor";
  interests: string[];
};

export type OfflineTodayLead = {
  kind: "event" | "place";
  title: string;
  detail?: string;
  href?: string;
};

export type OfflineTodayWeather = {
  headline: string;
  condition?: string;
  temperatureF?: number;
  highF?: number;
  safetyNote?: string;
};

export type OfflineTodaySummary = {
  updatedAt: string;
  dayKey: string;
  weather?: OfflineTodayWeather;
  lead?: OfflineTodayLead;
};

export type OfflineSnapshot = {
  version: typeof OFFLINE_SNAPSHOT_VERSION;
  updatedAt: string;
  saved?: OfflineSavedSummary;
  preferences?: OfflinePreferenceSummary;
  today?: OfflineTodaySummary;
};

export type SavedSummaryInput = {
  type?: unknown;
};

export type TodaySnapshotPatch = {
  dayKey: string;
  weather?: OfflineTodayWeather;
  lead?: OfflineTodayLead;
};

export type OfflineSnapshotView = {
  updatedAt: string;
  saved?: OfflineSavedSummary;
  preferences?: OfflinePreferenceSummary;
  today?: OfflineTodaySummary;
};

function isoAt(now: number): string {
  return new Date(now).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    value.length <= 40
  );
}

function ageOf(value: string, now: number): number {
  return Math.max(0, now - Date.parse(value));
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_SAVED_COUNT)
    : null;
}

function shortText(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().toLowerCase();
  return clean.length <= MAX_IDENTIFIER_LENGTH && IDENTIFIER.test(clean)
    ? clean
    : undefined;
}

function dayKey(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

function safeNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : undefined;
}

function sanitizeSaved(value: unknown): OfflineSavedSummary | undefined {
  if (!isRecord(value) || !validIso(value.updatedAt)) return undefined;
  const total = integer(value.total);
  const place = integer(value.place);
  const event = integer(value.event);
  const radius = integer(value.radius);
  const beer = integer(value.beer);
  if ([total, place, event, radius, beer].some((count) => count === null)) return undefined;
  return {
    updatedAt: value.updatedAt,
    total: total!,
    place: place!,
    event: event!,
    radius: radius!,
    beer: beer!,
    capped: value.capped === true,
  };
}

function sanitizePreferences(value: unknown): OfflinePreferenceSummary | undefined {
  if (!isRecord(value) || !validIso(value.updatedAt)) return undefined;
  const homeMunicipality = identifier(value.homeMunicipality);
  const scope = identifier(value.scope);
  const mode = value.mode === "resident" || value.mode === "visitor"
    ? value.mode
    : undefined;
  const interests = Array.isArray(value.interests)
    ? Array.from(
        new Set(
          value.interests
            .map(identifier)
            .filter((item): item is string => Boolean(item)),
        ),
      ).slice(0, MAX_INTERESTS)
    : [];
  return {
    updatedAt: value.updatedAt,
    ...(homeMunicipality ? { homeMunicipality } : {}),
    ...(scope ? { scope } : {}),
    ...(mode ? { mode } : {}),
    interests,
  };
}

function sanitizeLead(value: unknown): OfflineTodayLead | undefined {
  if (!isRecord(value) || (value.kind !== "event" && value.kind !== "place")) {
    return undefined;
  }
  const title = shortText(value.title, 100);
  if (!title) return undefined;
  const detail = shortText(value.detail, 140);
  const href =
    typeof value.href === "string" && SAFE_PATH.test(value.href)
      ? value.href
      : undefined;
  return {
    kind: value.kind,
    title,
    ...(detail ? { detail } : {}),
    ...(href ? { href } : {}),
  };
}

function sanitizeWeather(value: unknown): OfflineTodayWeather | undefined {
  if (!isRecord(value)) return undefined;
  const headline = shortText(value.headline, 120);
  if (!headline) return undefined;
  const condition = shortText(value.condition, 80);
  const safetyNote = shortText(value.safetyNote, 140);
  const temperatureF = safeNumber(value.temperatureF, -80, 140);
  const highF = safeNumber(value.highF, -80, 140);
  return {
    headline,
    ...(condition ? { condition } : {}),
    ...(temperatureF !== undefined ? { temperatureF } : {}),
    ...(highF !== undefined ? { highF } : {}),
    ...(safetyNote ? { safetyNote } : {}),
  };
}

function sanitizeToday(value: unknown): OfflineTodaySummary | undefined {
  if (!isRecord(value) || !validIso(value.updatedAt)) return undefined;
  const key = dayKey(value.dayKey);
  if (!key) return undefined;
  const weather = sanitizeWeather(value.weather);
  const lead = sanitizeLead(value.lead);
  if (!weather && !lead) return undefined;
  return {
    updatedAt: value.updatedAt,
    dayKey: key,
    ...(weather ? { weather } : {}),
    ...(lead ? { lead } : {}),
  };
}

/**
 * Parse only the known fields. Oversized or malformed records fail closed, and
 * unknown keys (coordinates, notes, account identifiers, etc.) are discarded.
 */
export function sanitizeOfflineSnapshot(value: unknown): OfflineSnapshot | null {
  if (!isRecord(value)) return null;
  let encoded = "";
  try {
    encoded = JSON.stringify(value);
  } catch {
    return null;
  }
  if (encoded.length > MAX_RECORD_BYTES) return null;
  if (value.version !== OFFLINE_SNAPSHOT_VERSION || !validIso(value.updatedAt)) {
    return null;
  }
  const saved = sanitizeSaved(value.saved);
  const preferences = sanitizePreferences(value.preferences);
  const today = sanitizeToday(value.today);
  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    updatedAt: value.updatedAt,
    ...(saved ? { saved } : {}),
    ...(preferences ? { preferences } : {}),
    ...(today ? { today } : {}),
  };
}

export function buildOfflineSavedSummary(
  items: readonly SavedSummaryInput[],
  now = Date.now(),
): OfflineSavedSummary {
  const counts = { place: 0, event: 0, radius: 0, beer: 0 };
  for (const item of items.slice(0, MAX_SAVED_COUNT)) {
    if (item?.type === "place") counts.place += 1;
    else if (item?.type === "event") counts.event += 1;
    else if (item?.type === "radius") counts.radius += 1;
    else if (item?.type === "beer") counts.beer += 1;
  }
  const total = counts.place + counts.event + counts.radius + counts.beer;
  return {
    updatedAt: isoAt(now),
    total,
    ...counts,
    capped: items.length > MAX_SAVED_COUNT,
  };
}

/**
 * Read only the four coarse preference keys approved for offline use.
 * Exact geolocation, recent searches, notes, tokens, account data, and custom
 * list names are intentionally outside this function.
 */
export function readOfflinePreferences(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): OfflinePreferenceSummary {
  let interests: unknown = [];
  let homeMunicipality: string | null = null;
  let scope: string | null = null;
  let mode: string | null = null;
  try {
    const raw = storage.getItem("fr:interests:v1");
    interests = raw ? JSON.parse(raw) : [];
    homeMunicipality = storage.getItem("fr:home-muni:v1");
    scope = storage.getItem("fr:scope:v1");
    mode = storage.getItem("fr:mode:v1");
  } catch {
    interests = [];
  }
  return sanitizePreferences({
    updatedAt: isoAt(now),
    homeMunicipality,
    scope,
    mode,
    interests,
  })!;
}

export function mergeOfflineDeviceSnapshot(
  current: OfflineSnapshot | null,
  saved: OfflineSavedSummary,
  preferences: OfflinePreferenceSummary,
  now = Date.now(),
): OfflineSnapshot {
  return {
    ...(current ?? {
      version: OFFLINE_SNAPSHOT_VERSION,
      updatedAt: isoAt(now),
    }),
    version: OFFLINE_SNAPSHOT_VERSION,
    updatedAt: isoAt(now),
    saved,
    preferences,
  };
}

export function mergeOfflineTodaySnapshot(
  current: OfflineSnapshot | null,
  patch: TodaySnapshotPatch,
  now = Date.now(),
): OfflineSnapshot {
  const key = dayKey(patch.dayKey);
  const weather = sanitizeWeather(patch.weather);
  const lead = sanitizeLead(patch.lead);
  const currentToday = current?.today;
  const existing = currentToday?.dayKey === key ? currentToday : undefined;
  const today = key
    ? sanitizeToday({
        updatedAt: isoAt(now),
        dayKey: key,
        weather: weather ?? existing?.weather,
        lead: lead ?? existing?.lead,
      })
    : undefined;
  return {
    ...(current ?? {
      version: OFFLINE_SNAPSHOT_VERSION,
      updatedAt: isoAt(now),
    }),
    version: OFFLINE_SNAPSHOT_VERSION,
    updatedAt: isoAt(now),
    ...(today ? { today } : {}),
  };
}

/** Age-gate each section independently so a fresh save cannot make yesterday's
 * weather appear fresh. The database still contains one bounded record; stale
 * sections simply do not cross the offline-page trust boundary. */
export function offlineSnapshotView(
  value: unknown,
  now = Date.now(),
): OfflineSnapshotView | null {
  const snapshot = sanitizeOfflineSnapshot(value);
  if (!snapshot || ageOf(snapshot.updatedAt, now) > OFFLINE_DEVICE_MAX_AGE_MS) {
    return null;
  }
  const saved =
    snapshot.saved && ageOf(snapshot.saved.updatedAt, now) <= OFFLINE_DEVICE_MAX_AGE_MS
      ? snapshot.saved
      : undefined;
  const preferences =
    snapshot.preferences &&
    ageOf(snapshot.preferences.updatedAt, now) <= OFFLINE_DEVICE_MAX_AGE_MS
      ? snapshot.preferences
      : undefined;
  const today =
    snapshot.today && ageOf(snapshot.today.updatedAt, now) <= OFFLINE_TODAY_MAX_AGE_MS
      ? snapshot.today
      : undefined;
  return {
    updatedAt: snapshot.updatedAt,
    ...(saved ? { saved } : {}),
    ...(preferences ? { preferences } : {}),
    ...(today ? { today } : {}),
  };
}

export function formatOfflineAge(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        db.createObjectStore(OFFLINE_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Offline storage upgrade is blocked"));
    };
  });
}

async function updateOfflineRecord(
  mutate: (current: OfflineSnapshot | null) => OfflineSnapshot,
): Promise<void> {
  const db = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const request = store.get(OFFLINE_RECORD_KEY);
      request.onsuccess = () => {
        const current = sanitizeOfflineSnapshot(request.result);
        const next = sanitizeOfflineSnapshot(mutate(current));
        if (!next) {
          transaction.abort();
          reject(new Error("Offline snapshot failed validation"));
          return;
        }
        store.put(next, OFFLINE_RECORD_KEY);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read offline snapshot"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not update offline snapshot"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline snapshot update was aborted"));
    });
  } finally {
    db.close();
  }
}

export async function persistOfflineDeviceSnapshot(
  items: readonly SavedSummaryInput[],
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): Promise<void> {
  const saved = buildOfflineSavedSummary(items, now);
  const preferences = readOfflinePreferences(storage, now);
  await updateOfflineRecord((current) =>
    mergeOfflineDeviceSnapshot(current, saved, preferences, now),
  );
}

export async function persistOfflineTodaySnapshot(
  patch: TodaySnapshotPatch,
  now = Date.now(),
): Promise<void> {
  await updateOfflineRecord((current) =>
    mergeOfflineTodaySnapshot(current, patch, now),
  );
}

export async function readOfflineSnapshot(
  now = Date.now(),
): Promise<OfflineSnapshotView | null> {
  const db = await openOfflineDatabase();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const request = transaction.objectStore(OFFLINE_STORE_NAME).get(OFFLINE_RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read offline snapshot"));
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not read offline snapshot"));
    });
    return offlineSnapshotView(raw, now);
  } finally {
    db.close();
  }
}
