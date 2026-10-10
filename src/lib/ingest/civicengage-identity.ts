/**
 * CivicEngage event identity: the numeric EID shared by iCal UID and
 * Calendar.aspx?EID= links. Combined All-calendar RSS has the EID and no
 * catID. Per-catID iCal feeds have both. Match them so a row can carry
 * its catID without writing a second copy.
 */
export type CivicEngageCatIdIndex = Map<string, number[]>;

export type CivicEngageFeedEvents<T extends { uid: string; sourceUrl?: string }> = {
  catID: number;
  events: readonly T[];
};

export type CivicEngageAssignedEvent<T> = {
  event: T;
  catID: number | null;
  /** Numeric catID when membership is unique; null when feeds disagree. */
  category: string | null;
};

const EID_QUERY_RE = /[?&]EID=(\d+)/i;
const NUMERIC_ID_RE = /^(\d+)$/;

export function civicEngageICalUrl(domain: string, catID: number): string {
  return `https://${domain}/Common/Modules/iCalendar/iCalendar.aspx?catID=${catID}&feed=calendar`;
}

export function civicEngageCategoryToken(catID: number): string {
  return String(catID);
}

/**
 * Prefer the official Calendar.aspx EID, then a numeric UID, then a
 * numeric mailbox local-part (`22352@frederickcountymd.gov`).
 */
export function civicEngageEventId(input: {
  uid?: string | null;
  url?: string | null;
}): string | null {
  const fromUrl = input.url?.match(EID_QUERY_RE)?.[1];
  if (fromUrl) return fromUrl;

  const uid = input.uid?.trim() ?? "";
  if (!uid) return null;
  if (NUMERIC_ID_RE.test(uid)) return uid;

  const local = uid.split("@", 1)[0] ?? "";
  const trailing = local.match(/(\d+)$/)?.[1];
  return trailing ?? null;
}

export function eventIdsFromICalBody(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(/^UID:(.+)$/gm)) {
    const id = civicEngageEventId({ uid: match[1].trim() });
    if (id) ids.add(id);
  }
  for (const match of text.matchAll(/[?&]EID=(\d+)/gi)) {
    ids.add(match[1]);
  }
  return [...ids];
}

/**
 * First configured catID wins the list order. A later feed that repeats
 * the same EID is recorded so ingest can refuse a conflicting label.
 */
export function buildCivicEngageCatIdIndex(
  feeds: ReadonlyArray<{ catID: number; eventIds: readonly string[] }>,
): CivicEngageCatIdIndex {
  const index: CivicEngageCatIdIndex = new Map();
  for (const feed of feeds) {
    for (const eventId of feed.eventIds) {
      const seen = index.get(eventId);
      if (!seen) {
        index.set(eventId, [feed.catID]);
      } else if (!seen.includes(feed.catID)) {
        seen.push(feed.catID);
      }
    }
  }
  return index;
}

export function resolveCivicEngageCatId(
  index: CivicEngageCatIdIndex,
  input: { uid?: string | null; url?: string | null },
  onConflict: "null" | "first" = "null",
): number | null {
  const eventId = civicEngageEventId(input);
  if (!eventId) return null;
  const catIDs = index.get(eventId);
  if (!catIDs || catIDs.length === 0) return null;
  if (catIDs.length === 1 || onConflict === "first") return catIDs[0];
  return null;
}

/**
 * One row per UID, in configured catID order. Category is the numeric
 * catID only when every feed that published the UID agrees.
 */
export function assignCivicEngageCategories<
  T extends { uid: string; sourceUrl?: string },
>(
  feeds: ReadonlyArray<CivicEngageFeedEvents<T>>,
): { events: CivicEngageAssignedEvent<T>[]; duplicates: number } {
  const byUid = new Map<
    string,
    { event: T; catIDs: Set<number> }
  >();
  let duplicates = 0;

  for (const feed of feeds) {
    for (const event of feed.events) {
      const existing = byUid.get(event.uid);
      if (existing) {
        duplicates += 1;
        existing.catIDs.add(feed.catID);
      } else {
        byUid.set(event.uid, {
          event,
          catIDs: new Set([feed.catID]),
        });
      }
    }
  }

  return {
    events: [...byUid.values()].map(({ event, catIDs }) => {
      const catID = catIDs.size === 1 ? [...catIDs][0] : null;
      return {
        event,
        catID,
        category: catID == null ? null : civicEngageCategoryToken(catID),
      };
    }),
    duplicates,
  };
}

export function applyCivicEngageCatIds<T extends { url?: string }>(
  events: T[],
  index: CivicEngageCatIdIndex,
): Array<T & { civicengage_catid?: number }> {
  return events.map((event) => {
    const catID = resolveCivicEngageCatId(
      index,
      { url: event.url },
      "first",
    );
    return catID == null ? event : { ...event, civicengage_catid: catID };
  });
}

const INDEX_FEED_TIMEOUT_MS = 8_000;
const INDEX_FEED_CONCURRENCY = 2;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runWorker(),
    ),
  );
  return results;
}

/**
 * Build an EID → catID index from the per-catID iCal feeds. Fail-soft:
 * a missing feed is omitted, never invented.
 */
export async function fetchCivicEngageCatIdIndex(
  domain: string,
  catids: readonly number[],
  options: {
    fetchImpl?: typeof fetch;
    userAgent?: string;
    timeoutMs?: number;
    deadlineMs?: number;
  } = {},
): Promise<CivicEngageCatIdIndex> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? INDEX_FEED_TIMEOUT_MS;
  const userAgent =
    options.userAgent ??
    "FrederickRadius/1.0 (+https://frederickradius.app; civic event index)";
  const deadlineAt =
    options.deadlineMs != null ? Date.now() + options.deadlineMs : null;

  const feeds = await mapWithConcurrency(catids, INDEX_FEED_CONCURRENCY, async (catID) => {
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      return { catID, eventIds: [] as string[] };
    }
    const remaining = deadlineAt == null ? timeoutMs : Math.max(0, deadlineAt - Date.now());
    const feedTimeout = Math.min(timeoutMs, remaining || timeoutMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), feedTimeout);
    try {
      const response = await fetchImpl(civicEngageICalUrl(domain, catID), {
        headers: { "User-Agent": userAgent },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!response.ok) return { catID, eventIds: [] as string[] };
      return { catID, eventIds: eventIdsFromICalBody(await response.text()) };
    } catch {
      return { catID, eventIds: [] as string[] };
    } finally {
      clearTimeout(timer);
    }
  });

  return buildCivicEngageCatIdIndex(feeds.filter((feed) => feed.eventIds.length > 0));
}
