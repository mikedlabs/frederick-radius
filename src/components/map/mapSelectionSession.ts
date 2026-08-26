import {
  parseMapSelectionHistorySnapshot,
  type MapSelectionHistorySnapshot,
} from "./mapSelectionHistory";

export const MAP_SELECTION_TOKEN_PARAM = "selection";
export const MAP_SELECTION_SESSION_TTL_MS = 10 * 60 * 1000;
export const MAP_SELECTION_SESSION_MAX_ENTRIES = 12;
export const MAP_SELECTION_SESSION_MAX_PAYLOAD_CHARS = 64 * 1024;

const STORAGE_PREFIX = "fr_map_selection_v1:";
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

type StoredSelection = {
  version: 1;
  storedAt: number;
  snapshot: MapSelectionHistorySnapshot;
};

const memoryStore = new Map<string, StoredSelection>();

function storageKey(token: string): string {
  return `${STORAGE_PREFIX}${token}`;
}

export function isMapSelectionToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseStoredSelection(
  value: unknown,
  now: number,
): StoredSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.storedAt !== "number" ||
    !Number.isFinite(candidate.storedAt) ||
    candidate.storedAt > now + 60_000 ||
    now - candidate.storedAt > MAP_SELECTION_SESSION_TTL_MS
  ) {
    return null;
  }
  const snapshot = parseMapSelectionHistorySnapshot(candidate.snapshot);
  return snapshot
    ? { version: 1, storedAt: candidate.storedAt, snapshot }
    : null;
}

function parseStoredJson(raw: string | null, now: number): StoredSelection | null {
  if (!raw || raw.length > MAP_SELECTION_SESSION_MAX_PAYLOAD_CHARS) return null;
  try {
    return parseStoredSelection(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

function cleanupMemory(now: number): void {
  for (const [token, record] of memoryStore) {
    if (!parseStoredSelection(record, now)) memoryStore.delete(token);
  }
  const oldestFirst = [...memoryStore.entries()].sort(
    ([, left], [, right]) => left.storedAt - right.storedAt,
  );
  while (oldestFirst.length >= MAP_SELECTION_SESSION_MAX_ENTRIES) {
    const oldest = oldestFirst.shift();
    if (oldest) memoryStore.delete(oldest[0]);
  }
}

function cleanupSession(store: Storage, now: number): void {
  const entries: Array<{ key: string; storedAt: number }> = [];
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const token = key.slice(STORAGE_PREFIX.length);
    const record = isMapSelectionToken(token)
      ? parseStoredJson(store.getItem(key), now)
      : null;
    if (!record) {
      store.removeItem(key);
      continue;
    }
    entries.push({ key, storedAt: record.storedAt });
  }
  entries.sort((left, right) => left.storedAt - right.storedAt);
  while (entries.length >= MAP_SELECTION_SESSION_MAX_ENTRIES) {
    const oldest = entries.shift();
    if (oldest) store.removeItem(oldest.key);
  }
}

function createToken(): string | null {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) return null;
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Keep non-entity map results inside this tab for a short time. Only the
 * opaque token is shareable; provider names, labels, and coordinates never
 * enter the URL and are discarded automatically.
 */
export function writeMapSelectionSession(
  snapshot: MapSelectionHistorySnapshot,
  now = Date.now(),
): string | null {
  const parsed = parseMapSelectionHistorySnapshot(snapshot);
  const token = createToken();
  if (!parsed || !token) return null;

  const record: StoredSelection = {
    version: 1,
    storedAt: now,
    snapshot: parsed,
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(record);
  } catch {
    return null;
  }
  if (serialized.length > MAP_SELECTION_SESSION_MAX_PAYLOAD_CHARS) return null;
  const storedRecord = parseStoredJson(serialized, now);
  if (!storedRecord) return null;

  const store = sessionStore();
  if (store) {
    try {
      cleanupSession(store, now);
      store.setItem(storageKey(token), serialized);
      return token;
    } catch {
      // Privacy modes and full storage quotas still get a bounded in-memory
      // journey for the lifetime of the mounted app.
    }
  }

  cleanupMemory(now);
  memoryStore.set(token, storedRecord);
  return token;
}

export function readMapSelectionSession(
  token: unknown,
  now = Date.now(),
): MapSelectionHistorySnapshot | null {
  if (!isMapSelectionToken(token)) return null;
  const store = sessionStore();
  if (store) {
    try {
      const key = storageKey(token);
      const raw = store.getItem(key);
      if (raw !== null) {
        const parsed = parseStoredJson(raw, now);
        if (parsed) return parsed.snapshot;
        store.removeItem(key);
        return null;
      }
    } catch {
      // Fall through to memory for browsers that revoke storage mid-session.
    }
  }

  const parsed = parseStoredSelection(memoryStore.get(token), now);
  if (!parsed) {
    memoryStore.delete(token);
    return null;
  }
  return parsed.snapshot;
}

/** Test and explicit lifecycle seam; normal records expire without a timer. */
export function clearMapSelectionSessionStore(): void {
  memoryStore.clear();
  const store = sessionStore();
  if (!store) return;
  try {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) store.removeItem(key);
    }
  } catch {
    // Clearing a blocked store is already complete from Radius' perspective.
  }
}
