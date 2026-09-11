/**
 * Daypart — the coarse time-of-day bucket that lets /today reorder itself so the
 * most relevant live block leads at 8am vs 9pm (ROADMAP: a home that "looks
 * different at 7am vs sunset"). The sky already shifts by the hour; this is the
 * matching CONTENT shift.
 *
 * Eastern-time (the app is one county), four buckets aligned with the SkyHero
 * hour bands so the words match the picture: morning, midday, evening, late.
 */
export type Daypart = "morning" | "midday" | "evening" | "late";

export function daypart(now: Date = new Date()): Daypart {
  const h =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(now),
    ) % 24;
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "midday";
  if (h >= 16 && h < 21) return "evening";
  return "late";
}

/** Cluster block keys, in the order they should appear for a given daypart.
 *  Each block self-hides when it has nothing, so this is a PRIORITY order, not
 *  a guarantee all four render: it decides which live thing leads when several
 *  are active. Morning leads with markets (they close early); evening leads with
 *  happy hour + tonight's parking; deals sit high midday (the "what's worth
 *  going out for" hours). */
export function clusterOrder(part: Daypart): Array<"happy" | "deals" | "markets" | "parking"> {
  switch (part) {
    case "morning":
      return ["markets", "deals", "happy", "parking"];
    case "midday":
      return ["deals", "markets", "happy", "parking"];
    case "evening":
      return ["happy", "deals", "parking", "markets"];
    case "late":
      return ["happy", "deals", "parking", "markets"];
  }
}

/**
 * Section keys the /today spine can reorder by daypart, in priority order — the
 * same "behave like a local, don't say so" instinct clusterOrder applies inside
 * the On-now band, lifted to the page's two swappable editorial sections.
 *
 *   - "whatsOn" — today's events (the headline answer at night).
 *   - "curated" — "Plan the moment" collections (evergreen; the day-ahead read).
 *
 * Morning/midday lead with the day-ahead plan (events are hours off); evening
 * and late lead with tonight's events and let the evergreen collections yield.
 * Both sections still render every daypart — this only decides which comes
 * first. (The Tomorrow preview and On-now band are ordered by their own gates.)
 */
export type TodaySection = "whatsOn" | "curated";

export function sectionOrder(part: Daypart): TodaySection[] {
  switch (part) {
    case "morning":
    case "midday":
      return ["curated", "whatsOn"];
    case "evening":
    case "late":
      return ["whatsOn", "curated"];
  }
}
