import { easternParts } from "@/lib/tz";
import { COLLECTION_BY_SLUG } from "@/data/collections";

/**
 * Community notes — the quiet, even-handed local-community layer for the /today
 * masthead. The field guide covers the county's communities the way it covers
 * its markets and First Saturdays: as a single calm, dated line, surfaced on the
 * day it is relevant, linking to a real local resource.
 *
 * Each note triggers on an honest calendar signal (Pride in June; places of
 * worship on Sundays), so no community is singled out and none appears for no
 * reason. The whole layer is governed by ONE topic-neutral preference
 * (getCommunityNotes) and a dismiss, so a user who does not want these notes
 * turns them all off at once. Pure + Eastern-calendar; the component renders it.
 */
export type CommunityNote = {
  id: "pride" | "worship";
  /** True when this note applies on `now` (Eastern). Pure. */
  active: (now: Date) => boolean;
  /** Lower wins when several are active (the rarer rhythm leads the weekly one). */
  priority: number;
  /** How the component draws the mark. */
  icon: "pride-flag" | "worship";
  /** Bold lead phrase. */
  lead: string;
  href: string;
  ctaLabel: string;
};

export const COMMUNITY_NOTES: CommunityNote[] = [
  {
    id: "pride",
    // June, and only when the curated collection actually exists.
    active: (now) => easternParts(now).month === 6 && Boolean(COLLECTION_BY_SLUG["lgbtq-frederick"]),
    priority: 10, // a once-a-year month leads the weekly rhythm
    icon: "pride-flag",
    lead: "Pride Month.",
    href: "/collections/lgbtq-frederick",
    ctaLabel: "Explore LGBTQ+ Frederick",
  },
  {
    id: "worship",
    // Sundays (Eastern). The even-handed peer: places of worship are a real
    // community resource and Sunday is their honest signal.
    active: (now) => easternParts(now).weekday === 0,
    priority: 20,
    icon: "worship",
    lead: "Sunday.",
    href: "/category/worship",
    ctaLabel: "Places of worship",
  },
];

/** The single highest-priority active community note for `now`, or null. Pure. */
export function pickCommunityNote(now: Date): CommunityNote | null {
  let best: CommunityNote | null = null;
  for (const n of COMMUNITY_NOTES) {
    if (!n.active(now)) continue;
    if (!best || n.priority < best.priority) best = n;
  }
  return best;
}
