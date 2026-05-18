/**
 * SCAFFOLD transform: City of Frederick parking deck occupancy.
 *
 * The live endpoint and licensing are unconfirmed (data/sources.yaml,
 * pending_review). This is a defensive scaffold: it normalizes the
 * common deck / available / capacity model to snake_case JSON, derives
 * the missing one of available/occupied from capacity when exactly one
 * side is known, and leaves anything it cannot derive null. It never
 * fabricates a count. It must be revalidated against the real feed
 * before the row is activated.
 */

import { isoDate, toNumber, type TransformResult } from "../pipeline/lib/normalize";
import type { CofParkingOccupancyRaw } from "../pipeline/schemas_ts/cof_parking_occupancy";

const SLUG: Record<string, string> = {
  "court street": "court-street",
  "carroll creek": "carroll-creek",
  "west patrick": "west-patrick",
  "west patrick street": "west-patrick",
};

function slugify(name: string): string {
  const key = name.trim().toLowerCase();
  return SLUG[key] ?? key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function transform(raw: CofParkingOccupancyRaw): TransformResult {
  const decks = (raw.decks ?? []).map((d) => {
    const capacity = toNumber(d.capacity);
    let available = toNumber(d.available);
    let occupied = toNumber(d.occupied);
    if (capacity !== null) {
      if (available === null && occupied !== null) available = capacity - occupied;
      if (occupied === null && available !== null) occupied = capacity - available;
    }
    const pct =
      capacity && occupied !== null ? Math.round((occupied / capacity) * 100) : null;
    return {
      name: d.name,
      slug: slugify(d.name),
      available,
      occupied,
      capacity,
      percent_full: pct,
      status: d.status ?? null,
      updated: isoDate(d.updated) ?? null,
    };
  });

  return {
    format: "json",
    data: {
      source: "cof_parking_occupancy",
      as_of: isoDate(raw.as_of) ?? null,
      decks,
    },
  };
}
