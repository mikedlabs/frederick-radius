import { EVENTS } from "@/data/events";
import { venueEventsAsCards } from "@/lib/loaders/venueEvents";

/**
 * "Live downtown" — the front-door marquee for the three flagship
 * music/stage programs a local actually plans their week around:
 * Alive @ Five (the Carroll Creek summer concert series), the Weinberg
 * (the historic downtown theater), and the SilverVox Film + Music
 * Festival. All three are REAL, dated rows pulled from data we already
 * hold — the per-show Alive lineup (src/data/events.ts) and the scraped
 * Weinberg lineup (venue-events.json) — never fabricated. SilverVox is a
 * fixed, verified festival window (Jun 18–21, 2026) with an external
 * home, so it ships as a single dated row until it has an in-app page.
 *
 * Selection is by real time: the soonest upcoming show per program, so
 * the marquee always reads "what's next downtown", not a static poster.
 * Computed on the server; the client component formats the dates against
 * the viewer's real clock so ISR staleness never mislabels "tonight".
 */
export type LiveShow = {
  /** Stable key for React + analytics. */
  key: string;
  /** The program name — "Alive @ Five", "The Weinberg", "SilverVox Fest". */
  series: string;
  /** The act / headline draw for the next date. */
  act: string;
  /** ISO start of the next date. */
  startsAt: string;
  /** ISO end — set for multi-day runs (SilverVox) so the chip reads a range. */
  endsAt?: string;
  /** Where it happens. */
  venue: string;
  /** Detail route (internal) or official page (external). */
  href: string;
  /** External links open in a new tab and get a provenance affordance. */
  external?: boolean;
  /** One quiet line of know-before-you-go ("$5 · 21+", "Film + music"). */
  note?: string;
};

const HOUR = 3_600_000;

/** The next upcoming Alive @ Five date, with its booked band. */
function nextAliveAtFive(now: Date): LiveShow | null {
  const t = now.getTime();
  const next = EVENTS.filter(
    (e) => e.title.startsWith("Alive @ Five") && Date.parse(e.starts_at) >= t - HOUR,
  ).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  if (!next) return null;
  // Title is "Alive @ Five · <band>" or "Alive @ Five — Opening Night · <band>".
  const band = next.title.split("·").pop()?.trim() || "Live music";
  return {
    key: "alive-at-five",
    series: "Alive @ Five",
    act: band,
    startsAt: next.starts_at,
    venue: "Carroll Creek Amphitheater",
    href: `/events/${next.slug}`,
    note: "$5 · 21+ · outdoor happy hour",
  };
}

/** The next upcoming show on the Weinberg stage. */
function nextWeinberg(now: Date): LiveShow | null {
  const next = venueEventsAsCards(now).find((c) =>
    /weinberg/i.test(c.venue_name) || c.venue_place_slug?.includes("weinberg"),
  );
  if (!next) return null;
  return {
    key: "weinberg",
    series: "The Weinberg",
    act: next.title,
    startsAt: next.starts_at,
    venue: "Weinberg Center for the Arts",
    href: `/events/${next.slug}`,
    note: next.is_free ? "Free · historic theater" : "Tickets · historic theater",
  };
}

/**
 * SilverVox Film + Music Festival — Jun 18–21, 2026, nine downtown
 * venues anchored by the Weinberg and New Spire. Verified via
 * silvervoxfest.com; a single fixed row that drops off the marquee once
 * the run ends.
 */
function silverVox(now: Date): LiveShow | null {
  const endsAt = "2026-06-21T23:00:00-04:00";
  if (now.getTime() > Date.parse(endsAt)) return null;
  return {
    key: "silvervox",
    series: "SilverVox Fest",
    act: "Cults · 100+ films · live sets",
    startsAt: "2026-06-18T10:00:00-04:00",
    endsAt,
    venue: "Weinberg & 8 downtown venues",
    href: "https://silvervoxfest.com/",
    external: true,
    note: "Film + music · 4 days",
  };
}

/**
 * The marquee set. Alive @ Five anchors the rail when it's in season —
 * it's the free weekly flagship and the source of the sunset palette, so
 * it earns the lead card; the rest follow soonest-first. Empty rows (a
 * finished season, a quiet Weinberg week) drop out cleanly so the rail
 * never shows a dead card.
 */
export function liveDowntownShows(now: Date = new Date()): LiveShow[] {
  const alive = nextAliveAtFive(now);
  const rest = [nextWeinberg(now), silverVox(now)]
    .filter((s): s is LiveShow => s !== null)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return alive ? [alive, ...rest] : rest;
}
