/**
 * Daypart — the coarse time-of-day bucket that lets /today reorder itself so the
 * most relevant live block leads at 8am vs 9pm (ROADMAP: a home that "looks
 * different at 7am vs sunset"). The sky already shifts by the hour; this is the
 * matching CONTENT shift.
 *
 * Eastern-time (the app is one county), four buckets aligned with the SkyHero
 * hour bands so the words match the picture: morning, midday, evening, late.
 *
 * This is the ONE daypart clock. Today's masthead, its place shelf
 * (daypart-needs), its event program headings, the late-night tomorrow rows,
 * Ask's starters and the Events board's time-of-day filter all read these
 * boundaries. They used to disagree (the masthead flipped to Tonight at 5 PM
 * while the shelf served dinner from 4 PM and the program said "This
 * afternoon" until 5 PM), so the same page named two different moments.
 *
 *   05:00-10:59  morning
 *   11:00-15:59  midday
 *   16:00-20:59  evening
 *   21:00-04:59  late
 */
export type Daypart = "morning" | "midday" | "evening" | "late";

/** The hour a new day begins for people, not for the calendar. Before it,
 * the late daypart is still "tonight"; from it, the morning is "today". */
export const DAY_START_HOUR = 5;

/** Eastern wall-clock hour (0-23) of an instant. */
export function easternHour(now: Date = new Date()): number {
  return (
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(now),
    ) % 24
  );
}

/** The daypart for an Eastern wall-clock hour. Out-of-range hours wrap. */
export function daypartOfHour(easternHourValue: number): Daypart {
  const h = ((easternHourValue % 24) + 24) % 24;
  if (h >= DAY_START_HOUR && h < 11) return "morning";
  if (h >= 11 && h < 16) return "midday";
  if (h >= 16 && h < 21) return "evening";
  return "late";
}

export function daypart(now: Date = new Date()): Daypart {
  return daypartOfHour(easternHour(now));
}

/** True for the two dayparts a person calls "tonight". */
export function isTonightDaypart(part: Daypart): boolean {
  return part === "evening" || part === "late";
}

/**
 * The heading a day program uses for a listing that starts at this Eastern
 * hour. The late daypart spans midnight, so a 10 PM start reads "Late tonight"
 * while a 1 AM start on the same calendar day reads "Overnight".
 */
export function programDaypartLabel(startEasternHour: number): string {
  const h = ((startEasternHour % 24) + 24) % 24;
  switch (daypartOfHour(h)) {
    case "morning":
      return "This morning";
    case "midday":
      return "Midday";
    case "evening":
      return "Tonight";
    case "late":
      return h < DAY_START_HOUR ? "Overnight" : "Late tonight";
  }
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
