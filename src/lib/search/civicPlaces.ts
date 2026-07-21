import type { SearchResult } from "./index";
import fireStations from "@/data/fire-stations.json";

/**
 * Fire & rescue companies in search. They're the one county-GIS layer with NO
 * place records behind it (parks and libraries are already findable as places,
 * so surfacing those here only duplicated them). A search for a company name
 * ("Independent Hose") or "fire station" now finds it and opens the map with
 * the Fire stations layer revealed (/map?at=...&show=firestations, or the layer
 * alone for the generic query). Additive: rides the existing "action"
 * presentation; see searchIndex for placement.
 */

type Fire = { station: string; name: string; town: string; lng: number; lat: number };

const STATIONS = fireStations as Fire[];

// The generic ask ("fire station", "firehouse") wants the whole layer, not one
// arbitrary company — offer to reveal them all, like a map-layer result.
const GENERIC = /\bfire (?:stations?|compan(?:y|ies)|house|houses|dept|department)\b|firehouses?|firefighter/;

/**
 * Fire companies matching the query (specific name/town/number), best first,
 * or a single "show all" layer result for the generic ask. Empty otherwise.
 * Caller caps and de-dupes.
 */
export function matchCivicPlaces(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (q.length < 3) return [];

  if (GENERIC.test(q)) {
    return [
      {
        type: "action" as const,
        id: "civic:firestations",
        title: "Show fire stations on the map",
        subtitle: "Frederick County fire & rescue companies",
        href: "/map?show=firestations",
      },
    ];
  }

  // Match a company by its proper name, town, or station number — NOT the
  // generic words, so this only fires on a real, specific ask.
  const scored = STATIONS.map((s) => {
    const hay = `${s.name} ${s.town} ${s.station}`.toLowerCase();
    const idx = hay.indexOf(q);
    if (idx < 0) return null;
    const boundary = idx === 0 || hay[idx - 1] === " ";
    return { s, rank: boundary ? 0 : 1 };
  }).filter((x): x is { s: Fire; rank: number } => x !== null);
  scored.sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name));

  return scored.map(({ s }) => ({
    type: "action" as const,
    id: `civic:${s.lat},${s.lng}`,
    title: `Station ${s.station}: ${s.name}`,
    subtitle: `Fire & rescue · ${s.town}`,
    href: `/map?at=${s.lat},${s.lng}&show=firestations`,
    lat: s.lat,
    lng: s.lng,
  }));
}
