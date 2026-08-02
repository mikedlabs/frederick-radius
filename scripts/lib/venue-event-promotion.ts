export type VenueCollectionStatus = "complete" | "unchanged" | "failed";

type CrossVenueEvent = {
  venue_slug: string;
  title?: string;
  starts_at?: string;
};

const NEW_SPIRE_SLUG = "new-spire";
const WEINBERG_CENTER_SLUG = "weinberg-center";

function exactPublishedEventKey(event: CrossVenueEvent): string | null {
  if (
    typeof event.title !== "string"
    || !event.title.trim()
    || typeof event.starts_at !== "string"
    || !event.starts_at.trim()
  ) {
    return null;
  }
  const title = event.title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
  // The two Weinberg-owned pages emit the same local ISO minute with and
  // without `:00` seconds. Normalize only zero seconds; do not parse dates or
  // fuzz titles, because either would risk combining genuinely different
  // performances.
  const startsAt = event.starts_at
    .trim()
    .replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):00(?:\.0+)?((?:Z|[+-]\d{2}:?\d{2})?)$/,
      "$1$2",
    );
  return `${title}\u0000${startsAt}`;
}

/**
 * New Spire is managed by the Weinberg Center, whose broad performances page
 * also republishes some New Spire listings. Suppress only exact normalized
 * title + start matches from that known parent/child pair. All other venues,
 * titles, and performance times pass through untouched.
 */
export function suppressKnownCrossVenueDuplicates<
  T extends CrossVenueEvent,
>(events: readonly T[]): { events: T[]; suppressed: number } {
  const newSpireKeys = new Set(
    events
      .filter((event) => event.venue_slug === NEW_SPIRE_SLUG)
      .map(exactPublishedEventKey)
      .filter((key): key is string => key !== null),
  );
  let suppressed = 0;
  const kept = events.filter((event) => {
    if (event.venue_slug !== WEINBERG_CENTER_SLUG) return true;
    const key = exactPublishedEventKey(event);
    if (key === null || !newSpireKeys.has(key)) return true;
    suppressed += 1;
    return false;
  });
  return { events: kept, suppressed };
}

/**
 * Build the public venue-event artifact without destroying the collected
 * source inventory. The unsuppressed inventory must be persisted separately:
 * a duplicate hidden today can become the only valid listing on a later run
 * when the preferred source removes its copy while the parent source is
 * unchanged.
 */
export function buildRecoverableVenuePublication<
  T extends CrossVenueEvent,
>(events: readonly T[]): {
  sourceInventory: T[];
  publishedEvents: T[];
  suppressed: number;
} {
  const sourceInventory = [...events];
  const { events: publishedEvents, suppressed } =
    suppressKnownCrossVenueDuplicates(sourceInventory);
  return { sourceInventory, publishedEvents, suppressed };
}

/**
 * Promote one venue's collected inventory into the shared event map.
 *
 * A complete source read is authoritative for that venue, including a valid
 * empty result, so its previous rows are removed before the new inventory is
 * inserted. Failed and unchanged reads deliberately leave the last-known-good
 * inventory alone; unchanged-row freshness is updated by the caller because
 * it also needs the latest provenance URL.
 */
export function promoteVenueInventory<T extends { venue_slug: string }>(input: {
  inventory: Map<string, T>;
  venueSlug: string;
  status: VenueCollectionStatus;
  rows: readonly T[];
  keyOf: (row: T) => string;
}): { added: number; removed: number } {
  const { inventory, venueSlug, status, rows, keyOf } = input;
  if (status !== "complete") return { added: 0, removed: 0 };

  const previousKeys = new Set<string>();
  for (const [key, row] of inventory) {
    if (row.venue_slug !== venueSlug) continue;
    previousKeys.add(key);
    inventory.delete(key);
  }

  let added = 0;
  const nextKeys = new Set<string>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!previousKeys.has(key) && !nextKeys.has(key)) added += 1;
    nextKeys.add(key);
    inventory.set(key, row);
  }

  return {
    added,
    removed: [...previousKeys].filter((key) => !nextKeys.has(key)).length,
  };
}
