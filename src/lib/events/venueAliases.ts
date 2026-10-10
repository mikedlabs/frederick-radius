/**
 * Feed venue string → places-client.json slug.
 *
 * Pure data plus a matcher. Do not invent catalog places here: unmatched
 * high-volume venues (Urbana Regional Library, 1440 Taney Avenue,
 * 101 Prospect St) stay unlinked until a human adds a verified entry.
 *
 * Live audit (2026-10-08): library feeds say "Branch Library" while the
 * catalog says "Public Library"; rooms arrive as ", Programming Room (CBA)";
 * Emmitsburg's street is Avenue in one feed and Ave in the catalog.
 */

import { normalizeVenueKey } from "@/lib/events/normalize";

export type EventVenueAlias = {
  /** places-client.json slug. */
  place_id: string;
  aliases: readonly string[];
};

export const EVENT_VENUE_ALIASES: readonly EventVenueAlias[] = [
  {
    place_id: "c-burr-artz-public-library-frederick",
    aliases: [
      "C. Burr Artz Public Library",
      "C. Burr Artz Branch Library",
      "C. Burr Artz Library",
      "C. Burr Artz",
      "110 E Patrick St",
      "110 East Patrick Street",
    ],
  },
  {
    place_id: "walkersville-public-library-walkersville",
    aliases: [
      "Walkersville Public Library",
      "Walkersville Branch Library",
      "Walkersville Library",
      "2 S Glade Rd",
      "2 S Glade Road",
      "2 South Glade Road",
    ],
  },
  {
    place_id: "middletown-public-library-middletown",
    aliases: [
      "Middletown Public Library",
      "Middletown Branch Library",
      "Middletown Library",
      "31 E Green St",
      "31 East Green Street",
    ],
  },
  {
    place_id: "brunswick-branch-library-brunswick",
    aliases: [
      "Brunswick Public Library",
      "Brunswick Branch Library",
      "Brunswick Library",
      "915 N Maple Ave",
      "915 North Maple Avenue",
    ],
  },
  {
    place_id: "thurmont-regional-library-thurmont",
    aliases: [
      "Thurmont Regional Library",
      "Thurmont Public Library",
      "Thurmont Branch Library",
      "Thurmont Library",
      "76 E Moser Rd",
      "76 East Moser Road",
    ],
  },
  {
    place_id: "emmitsburg-branch-library-emmitsburg",
    aliases: [
      "Emmitsburg Public Library",
      "Emmitsburg Branch Library",
      "Emmitsburg Library",
      "300 S Seton Ave",
      "300 South Seton Avenue",
    ],
  },
  {
    place_id: "myersville-community-library-myersville",
    aliases: [
      "Myersville Community Library",
      "Myersville Public Library",
      "Myersville Branch Library",
      "Myersville Library",
      "8 Harp Pl",
      "8 Harp Place",
    ],
  },
  {
    place_id: "edward-f-fry-memorial-library-at-point-of-rocks-brunswick",
    aliases: [
      "Edward F. Fry Memorial Library at Point of Rocks",
      "Edward F Fry Memorial Library at Point of Rocks",
    ],
  },
  {
    place_id: "weinberg-center-for-the-arts-frederick",
    aliases: [
      "Weinberg Center for the Arts",
      "The Weinberg Center for the Arts",
      "Weinberg Center",
      "20 W Patrick St",
      "20 West Patrick Street",
    ],
  },
  {
    place_id: "the-curious-iguana-frederick",
    aliases: ["Curious Iguana", "The Curious Iguana"],
  },
];

const ALIAS_INDEX: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const row of EVENT_VENUE_ALIASES) {
    for (const alias of row.aliases) {
      const key = normalizeVenueKey(alias);
      if (!key) continue;
      const existing = index.get(key);
      if (existing && existing !== row.place_id) {
        throw new Error(
          `Event venue alias ${alias} maps to both ${existing} and ${row.place_id}.`,
        );
      }
      index.set(key, row.place_id);
    }
  }
  return index;
})();

export type EventVenueMatchInput = {
  venue_name?: string | null;
  venue_place_slug?: string | null;
  place_id?: string | null;
};

/**
 * Confident feed-venue → catalog place id. Room/code suffixes and
 * Public/Branch / Ave/Avenue variants are normalized before lookup.
 * Returns null when the venue is unknown or ambiguous (never invents).
 */
export function matchEventVenuePlaceId(
  input: EventVenueMatchInput,
): string | null {
  const already = input.place_id?.trim() || input.venue_place_slug?.trim();
  if (already) return already;

  const venue = input.venue_name?.trim();
  if (!venue) return null;

  const key = normalizeVenueKey(venue);
  if (!key) return null;
  return ALIAS_INDEX.get(key) ?? null;
}
