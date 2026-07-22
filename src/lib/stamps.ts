import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * Passport stamps — the earned layer of /my-radius.
 *
 * Every stamp is derived from signals the user actually generated on this
 * device (saves, been-here marks, margin notes, tapped beers, brewery
 * passport visits). Nothing is fabricated, nothing is time-gated, nothing
 * needs a server: the derivation is a pure function so it can be unit
 * tested, and the COMPONENT records first-earned dates in localStorage so
 * a stamp keeps the day it was actually earned (re-deriving later never
 * moves an old stamp's date).
 *
 * Aesthetic contract: these render as field-guide cancellation stamps
 * (the national-park kind), not game badges — see
 * src/components/saved/Passport.tsx.
 */

export type StampTone = "brand" | "forest" | "gold";

export type StampDef = {
  key: string;
  /** Rim text, short and uppercase-friendly (it bends around the arc). */
  title: string;
  /** Second rim line (bottom arc). */
  sub: string;
  tone: StampTone;
  /** Plain sentence for the "next up" hint row. */
  hint: string;
};

export type StampProgress = { done: number; need: number };

export type StampState = {
  def: StampDef;
  earned: boolean;
  progress: StampProgress;
};

export type StampInput = {
  /** All saved refs (any type), with their saved_at ISO stamps. */
  saved: { type: string; id: string; saved_at: string }[];
  /** Been-here place slugs. */
  visited: string[];
  /** Count of margin notes written. */
  notesCount: number;
  /** Brewery-passport visit count (fr:beer-passport). */
  breweryVisits: number;
  /** slug → municipality slug, for hydrated places only. */
  townOf: (slug: string) => string | undefined;
};

/** Milestone stamps, in display order. Thresholds are deliberately honest
 *  and reachable — the first three can be earned in one good afternoon. */
export const MILESTONES: (StampDef & { need: number })[] = [
  { key: "first-mark", title: "First mark", sub: "The guide begins", tone: "brand", need: 1, hint: "Save your first place." },
  { key: "the-dozen", title: "The dozen", sub: "A real shortlist", tone: "brand", need: 12, hint: "Save twelve places." },
  { key: "boots-on", title: "Boots on", sub: "Been there", tone: "brand", need: 1, hint: "Mark a place as visited." },
  { key: "ten-boots", title: "Ten boots", sub: "Out in the county", tone: "brand", need: 10, hint: "Mark ten places visited." },
  { key: "margin-writer", title: "Margin writer", sub: "Notes in the guide", tone: "brand", need: 3, hint: "Write three margin notes." },
  { key: "on-tap", title: "On tap", sub: "First pour saved", tone: "gold", need: 1, hint: "Save a beer to My taps." },
  { key: "flight-six", title: "Flight six", sub: "A full flight", tone: "gold", need: 6, hint: "Save six beers." },
  { key: "brewery-trail", title: "Brewery trail", sub: "Five taprooms", tone: "gold", need: 5, hint: "Stamp five breweries in the beer passport." },
  { key: "calendar-keeper", title: "Calendar keeper", sub: "Plans on the wall", tone: "brand", need: 3, hint: "Save three events." },
  { key: "four-seasons", title: "Four seasons", sub: "A regular", tone: "gold", need: 4, hint: "Use the guide across four different months." },
];

/** One town stamp per municipality, earned by saving OR visiting a place
 *  there. The full set closes with the gold Full County stamp. */
export function townDefs(): StampDef[] {
  return MUNICIPALITIES.map((m) => ({
    key: `town-${m.slug}`,
    title: m.slug === "frederick" ? "Frederick" : m.name,
    sub: "Frederick Co.",
    tone: "forest" as const,
    hint: `Save or visit a place in ${m.slug === "frederick" ? "Frederick" : m.name}.`,
  }));
}

export const FULL_COUNTY: StampDef = {
  key: "full-county",
  title: "Full county",
  sub: "Every town",
  tone: "gold",
  hint: "Earn every town stamp.",
};

function distinctMonths(saved: StampInput["saved"]): number {
  const months = new Set<string>();
  for (const r of saved) {
    const m = /^(\d{4}-\d{2})/.exec(r.saved_at ?? "");
    if (m) months.add(m[1]);
  }
  return months.size;
}

/** Pure derivation: signals in, full stamp states out (defs order). */
export function deriveStamps(input: StampInput): StampState[] {
  const savedPlaces = input.saved.filter((r) => r.type === "place");
  const savedBeers = input.saved.filter((r) => r.type === "beer");
  const savedEvents = input.saved.filter((r) => r.type === "event");
  const visitedSet = new Set(input.visited);

  const counts: Record<string, number> = {
    // The copy says \"Save your first place\", so an event/beer save must not
    // award this stamp while place progress still reads 0 of 12.
    "first-mark": savedPlaces.length,
    "the-dozen": savedPlaces.length,
    "boots-on": input.visited.length,
    "ten-boots": input.visited.length,
    "margin-writer": input.notesCount,
    "on-tap": savedBeers.length,
    "flight-six": savedBeers.length,
    "brewery-trail": input.breweryVisits,
    "calendar-keeper": savedEvents.length,
    "four-seasons": distinctMonths(input.saved),
  };

  const out: StampState[] = MILESTONES.map((def) => {
    const done = counts[def.key] ?? 0;
    return {
      def,
      earned: done >= def.need,
      progress: { done: Math.min(done, def.need), need: def.need },
    };
  });

  // Town stamps: a slug counts through save OR been-here; towns resolve
  // only for hydrated places, so an unhydrated save simply doesn't count
  // yet (never a wrong stamp).
  const townsHit = new Set<string>();
  const slugs = new Set<string>([...savedPlaces.map((r) => r.id), ...visitedSet]);
  for (const slug of slugs) {
    const town = input.townOf(slug);
    if (town) townsHit.add(town);
  }
  const towns = townDefs();
  for (const def of towns) {
    const slug = def.key.slice("town-".length);
    const earned = townsHit.has(slug);
    out.push({ def, earned, progress: { done: earned ? 1 : 0, need: 1 } });
  }

  out.push({
    def: FULL_COUNTY,
    earned: townsHit.size >= towns.length,
    progress: { done: Math.min(townsHit.size, towns.length), need: towns.length },
  });

  return out;
}
