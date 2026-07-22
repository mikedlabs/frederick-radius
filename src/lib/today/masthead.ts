/**
 * The /today masthead is time-aware: its title and one-line frame change
 * with the Eastern daypart, so the page's identity matches the reorder the
 * page already performs (the "evening gear" in the /today route flips the
 * lead from the day ahead to tonight at 17:00). Before this, the title read
 * a static "Today in Frederick" at every hour, so the adaptive behavior was
 * invisible and the front door felt generic.
 *
 * Pure + unit-tested. The route computes the Eastern hour and calls this;
 * the page ISRs every 300s, so a daypart boundary rolls the masthead within
 * minutes. Boundaries are pinned to the app's existing daypart model — 17:00
 * is "evening" everywhere in the codebase (eventDaypart, the evening gear),
 * so "Tonight" leads here at the same instant the sections reorder.
 */

export type TodayFrame = {
  /** The page's daypart-aware h1. */
  title: string;
  /** One honest sentence framing what the page leads with now. */
  sub: string;
};

/**
 * Map an Eastern wall-clock hour (0-23) to the masthead frame.
 *
 *   05:00-11:59  morning   — the day ahead
 *   12:00-16:59  afternoon — what's still ahead today
 *   17:00-20:59  evening   — what's on tonight (matches the evening gear)
 *   21:00-04:59  late      — winding down; tomorrow is on deck
 */
export function todayFrame(easternHour: number): TodayFrame {
  const h = ((easternHour % 24) + 24) % 24;
  if (h >= 5 && h < 12) {
    return {
      title: "This morning in Frederick",
      sub: "See what is open and what is coming up.",
    };
  }
  if (h >= 12 && h < 17) {
    return {
      title: "This afternoon in Frederick",
      sub: "See what is open and what is still ahead.",
    };
  }
  if (h >= 17 && h < 21) {
    return {
      title: "Tonight in Frederick",
      sub: "See what is happening and what is still open.",
    };
  }
  return {
    title: "Late in Frederick",
    sub: "See what is still open before the night winds down.",
  };
}
