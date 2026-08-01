import type { EventWithMeta } from "@/lib/loaders/events";

export const SERVED_EVENT_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1_000;
const SERVED_EVENT_SNAPSHOT_MAX_ROWS = 4_000;

type ServedEventEntry = {
  event: EventWithMeta;
  seenAt: number;
};

type ServedEventSnapshot = {
  entries: Map<string, ServedEventEntry>;
};

type SnapshotGlobal = typeof globalThis & {
  __frederickRadiusServedEventSnapshotV1?: ServedEventSnapshot;
};

function snapshotStore(): ServedEventSnapshot {
  const shared = globalThis as SnapshotGlobal;
  shared.__frederickRadiusServedEventSnapshotV1 ??= {
    entries: new Map(),
  };
  return shared.__frederickRadiusServedEventSnapshotV1;
}

function isRecent(seenAt: number, nowMs: number): boolean {
  const age = nowMs - seenAt;
  return age >= 0 && age <= SERVED_EVENT_SNAPSHOT_MAX_AGE_MS;
}

/**
 * Remember the exact event rows a discovery surface has just published.
 *
 * This is deliberately process-local and short lived. It lets a subsequent
 * detail request reuse an already-loaded board without starting a provider
 * fanout, while the durable archive remains the cross-instance authority.
 */
export function rememberServedEvents(
  events: readonly EventWithMeta[],
  nowMs = Date.now(),
): void {
  const store = snapshotStore();
  for (const [slug, entry] of store.entries) {
    if (!isRecent(entry.seenAt, nowMs)) store.entries.delete(slug);
  }
  for (const event of events) {
    store.entries.set(event.slug, { event, seenAt: nowMs });
  }

  while (store.entries.size > SERVED_EVENT_SNAPSHOT_MAX_ROWS) {
    const oldestSlug = store.entries.keys().next().value;
    if (typeof oldestSlug !== "string") break;
    store.entries.delete(oldestSlug);
  }
}

/** Read only from the board snapshot; this function never performs I/O. */
export function servedEventBySlug(
  slug: string,
  nowMs = Date.now(),
): EventWithMeta | null {
  const entry = snapshotStore().entries.get(slug);
  if (!entry || !isRecent(entry.seenAt, nowMs)) return null;
  return entry.event;
}

export function resetServedEventSnapshotForTests(): void {
  (globalThis as SnapshotGlobal).__frederickRadiusServedEventSnapshotV1 = {
    entries: new Map(),
  };
}
