/**
 * Flat search adapter for the command palette (SearchOverlay).
 *
 * P0-7: there is now ONE search implementation — `src/lib/search.ts`,
 * which ranks the single canonical public set (publicPlaces) plus
 * events, municipalities, and categories. This module no longer holds a
 * second index or scoring pass; it only maps those ranked hits to flat
 * nav items (title / subtitle / href) for the overlay. The
 * `place:`/`event:` id prefixes stay stable so SearchOverlay's trust
 * resolver keeps working.
 */

import {
  qualifiedSearch,
  search,
  type QualifiedSearchContext,
  type QualifiedSearchMeta,
  type SearchHit,
} from "@/lib/search";
import type { Event } from "@/data/events";
import { OVERLAYS } from "@/lib/overlays";
import { matchCivicPlaces } from "./civicPlaces";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { placeHoursTrust, eventTrust, type TrustSignal } from "@/lib/trust";
import type { PlaceCardData } from "@/lib/loaders/places";

export type SearchResultType =
  | "place"
  | "event"
  | "category"
  | "municipality"
  | "action";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Compact category/municipality hint for badges. */
  badge?: string;
  /**
   * Optional trust signal attached server-side so SearchOverlay does
   * NOT have to call clientPlaceBySlug / EVENT_BY_SLUG client-side to
   * resolve it. Only set for place + event results.
   */
  trust?: TrustSignal;
  /**
   * Optional thumbnail URL. Populated server-side for place and event
   * results so SearchOverlay can render a 32px image instead of the
   * generic round-icon stamp. When absent (category, municipality,
   * action, or a place/event without a hero photo) the overlay falls
   * back to the type's icon. The URL goes straight into <img>; for
   * places it's the proxied Google Places photo, for events the
   * event's hero_image.
   */
  thumbnail?: string;
  /** Place coordinates, so SearchOverlay can show distance when the user has
   *  already granted location (no prompt). Set for place results only. */
  lat?: number;
  lng?: number;
  /** Map search ranks from the current viewport; keep that computed distance
   *  so identical business names can be distinguished before selection. */
  distance_m?: number;
  /** Street-level disambiguation for map search results. */
  address?: string;
};

/**
 * Quick-action results — top-level navigation that surfaces in the
 * search overlay when the user types intent words rather than a place
 * name. Same shape as a regular result so the overlay can render them
 * in the same list; the leading "action:" id prefix lets the trust
 * resolver skip them cleanly.
 *
 * Each row carries the keywords that should trip it: a substring match
 * against the lowercase query. Keywords are kept short and recognizable
 * — typing "tonight" or "plan" should both find the Plan-a-Night door.
 */
type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: readonly string[];
};

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "action:tonight",
    title: "Plan tonight",
    subtitle: "Build an evening plan around current local options.",
    href: "/tonight",
    keywords: ["tonight", "plan", "evening", "night", "dinner", "drinks", "date"],
  },
  {
    id: "action:discover",
    title: "Hidden Frederick",
    subtitle: "See a daily selection of lesser-known local places.",
    href: "/discover",
    keywords: ["discover", "hidden", "gem", "gems", "new", "explore"],
  },
  {
    id: "action:radius",
    title: "What's near me",
    subtitle: "Set a point and a distance.",
    href: "/map?mode=radius",
    keywords: ["near", "nearby", "radius", "around", "close", "walking"],
  },
  {
    id: "action:events",
    title: "Browse all events",
    subtitle: "Find upcoming events by category or town.",
    href: "/events",
    keywords: ["events", "what's on", "calendar", "happening", "concerts", "shows"],
  },
  {
    // Safety door (beta-tester request, Jul 2026): "hospital" in a vet
    // practice's name misleads panicked owners - a vet-shaped query leads
    // with the verified emergency tiers, not a name-match lottery.
    id: "action:emergency-vet",
    title: "Pet emergency care",
    subtitle: "See verified emergency and urgent-care options for pets.",
    href: "/emergency-vet",
    keywords: ["vet", "vets", "veterinarian", "veterinary", "emergency vet", "animal hospital", "pet emergency", "dog emergency", "cat emergency", "pet poison", "urgent care pets"],
  },
  {
    id: "action:map",
    title: "Open the map",
    subtitle: "See Frederick County places on a map.",
    href: "/map",
    keywords: ["map", "where", "view"],
  },
  {
    id: "action:settings",
    title: "Settings",
    subtitle: "Manage your location and other Radius preferences.",
    href: "/settings",
    keywords: ["settings", "preferences", "account", "profile", "personalize"],
  },
];

function matchQuickActions(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return QUICK_ACTIONS.filter((a) =>
    a.keywords.some((k) => k.startsWith(q) || q.startsWith(k) || k.includes(q)),
  ).map((a) => ({
    type: "action" as const,
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    href: a.href,
  }));
}

// Map-layer keywords: typing what a layer SHOWS offers the layer itself.
// Only ready layers are offered — a coming-soon overlay is not an answer.
const LAYER_KEYWORDS: Record<string, string[]> = {
  parks: ["park", "parks", "playground"],
  trails: ["trail", "trails", "hike", "hiking", "appalachian", "towpath"],
  historic: ["historic", "history", "cemetery", "cemeteries"],
  art: ["art", "mural", "murals", "sculpture", "public art"],
  markets: ["market", "markets", "farmers", "farmers market"],
  bridges: ["bridge", "bridges", "covered bridge", "covered bridges"],
};

function matchLayers(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (q.length < 3) return [];
  return OVERLAYS.filter(
    (o) =>
      o.ready &&
      (LAYER_KEYWORDS[o.key] ?? []).some((k) => k.startsWith(q) || q.includes(k)),
  ).map((o) => ({
    type: "action" as const,
    id: `layer:${o.key}`,
    title: `Show ${o.label.toLowerCase()} on the map`,
    subtitle: o.sources,
    href: `/map?mode=browse&layers=${o.key}`,
  }));
}

function hitToResult(h: SearchHit): SearchResult {
  if (h.type === "place") {
    // SearchHit.place is typed as Place but populated from clientPlaces()
    // which returns PlaceCardData (Place + open_status). Cast so we can
    // read open_status without widening the SearchHit type.
    const p = h.place as PlaceCardData;
    const cat = CATEGORY_BY_SLUG[p.category];
    const muni = MUNICIPALITY_BY_SLUG[p.municipality];
    return {
      type: "place",
      id: `place:${p.slug}`,
      title: p.name,
      subtitle: `${cat?.name ?? p.category} · ${muni?.name ?? p.municipality}`,
      href: `/places/${p.slug}`,
      badge: cat?.name,
      trust: p.open_status ? placeHoursTrust(p.open_status) : undefined,
      // First photo from the place's Google photo pipeline. Already
      // resolved to a proxied or Blob URL in decoratePlace, so the
      // overlay can render it directly without further work.
      thumbnail: p.google_photo_url,
      lat: p.geom?.lat,
      lng: p.geom?.lng,
      distance_m: p.distance_m,
      address: p.address,
    };
  }
  if (h.type === "event") {
    const e = h.event;
    return {
      type: "event",
      id: `event:${e.slug}`,
      title: e.title,
      subtitle: `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`,
      href: `/events/${e.slug}`,
      badge: e.category,
      trust: eventTrust(e),
      thumbnail: e.hero_image,
    };
  }
  if (h.type === "category") {
    const c = h.category;
    return {
      type: "category",
      id: `category:${c.slug}`,
      title: c.name,
      subtitle: c.blurb ?? "Browse this category.",
      href: `/category/${c.slug}`,
    };
  }
  if (h.type === "page") {
    // App guides/tools ride the existing "action" presentation (arrow
    // icon, Actions group) — to the user they're the same thing: a door.
    const g = h.page;
    return {
      type: "action",
      id: `page:${g.href}`,
      title: g.title,
      subtitle: g.blurb,
      href: g.href,
    };
  }
  const m = h.municipality;
  return {
    type: "municipality",
    id: `municipality:${m.slug}`,
    title: m.name,
    subtitle: m.hero_blurb ?? `This ${m.type ?? "municipality"} has a 2020 population of ${m.population?.toLocaleString() ?? "an unknown number"}.`,
    href: `/m/${m.slug}`,
  };
}

export function searchIndex(
  query: string,
  limit = 12,
  eventPool?: readonly Event[],
): SearchResult[] {
  // Quick actions lead the list — when a user types "tonight" they
  // probably want the /tonight surface itself, not a place named
  // Tonight Foo. They're cheap to compute (a few keyword checks) and
  // capped at the head; the rest of the limit goes to real ranked hits.
  const actions = matchQuickActions(query).slice(0, 2);
  // Map layers ride after quick actions: "farmers market" should offer
  // the overlay alongside the market places themselves.
  const layers = matchLayers(query).slice(0, 1);
  // Fire companies ride the head: they have no place records behind them, so a
  // "fire station" / company-name search should surface them, not lose to a
  // fuzzy place match. Capped tight.
  const civic = matchCivicPlaces(query).slice(0, 2);
  const head = [...actions, ...layers, ...civic];
  const headHrefs = new Set(head.map((a) => a.href));
  // Registry pages and quick actions overlap on purpose (both are doors);
  // never render the same door twice.
  const hits = search(query, Math.max(1, limit - head.length), eventPool)
    .map(hitToResult)
    .filter((r) => !headHrefs.has(r.href));
  return [...head, ...hits];
}

function searchHead(query: string): SearchResult[] {
  return [
    ...matchQuickActions(query).slice(0, 2),
    ...matchLayers(query).slice(0, 1),
    ...matchCivicPlaces(query).slice(0, 2),
  ];
}

function dedupeByHref(results: SearchResult[], limit: number): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];
  for (const result of results) {
    if (seen.has(result.href)) continue;
    seen.add(result.href);
    unique.push(result);
    if (unique.length === limit) break;
  }
  return unique;
}

export type QualifiedSearchIndexResult = {
  results: SearchResult[];
  meta: QualifiedSearchMeta;
};

/** Search adapter for natural-language qualifiers. Recognized constraints are
 * applied to the result set; they are never reduced to decorative copy. */
export function qualifiedSearchIndex(
  query: string,
  limit = 12,
  eventPool?: readonly Event[],
  context: QualifiedSearchContext = {},
): QualifiedSearchIndexResult {
  const head = searchHead(query);
  const qualified = qualifiedSearch(query, limit + head.length, eventPool, context);
  const ranked = qualified.hits.map(hitToResult);
  // Natural-language constraints own the first decision: “coffee near me”
  // must lead with the nearest qualified coffee, not a generic map door. For
  // ordinary named searches, purpose-built actions can still lead as before.
  // In both cases, layer and civic heads remain discoverable and URL-level
  // duplicates are removed after the two sources are merged.
  const merged = qualified.meta.qualifiers.constrained
    ? ranked.length > 0
      ? [ranked[0], ...head, ...ranked.slice(1)]
      : head
    : [...head, ...ranked];
  return {
    results: dedupeByHref(merged, limit),
    meta: qualified.meta,
  };
}
