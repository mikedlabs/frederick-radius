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

import { search, type SearchHit } from "@/lib/search";
import { OVERLAYS } from "@/lib/overlays";
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
    subtitle: "Dinner, drinks, then somewhere to land late.",
    href: "/tonight",
    keywords: ["tonight", "plan", "evening", "night", "dinner", "drinks", "date"],
  },
  {
    id: "action:discover",
    title: "Hidden Frederick",
    subtitle: "A daily sweep of lesser-known places.",
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
    subtitle: "Live, upcoming, by category, by town.",
    href: "/events",
    keywords: ["events", "what's on", "calendar", "happening", "concerts", "shows"],
  },
  {
    id: "action:map",
    title: "Open the map",
    subtitle: "Everything visible at a glance.",
    href: "/map",
    keywords: ["map", "where", "view"],
  },
  {
    id: "action:settings",
    title: "Settings",
    subtitle: "Persona, your spot, interests, notifications.",
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
      subtitle: c.blurb ?? "Browse this category",
      href: `/category/${c.slug}`,
    };
  }
  const m = h.municipality;
  return {
    type: "municipality",
    id: `municipality:${m.slug}`,
    title: m.name,
    subtitle: m.hero_blurb ?? `${m.type ?? "Municipality"} · pop. ${m.population?.toLocaleString() ?? "?"}`,
    href: `/m/${m.slug}`,
  };
}

export function searchIndex(query: string, limit = 12): SearchResult[] {
  // Quick actions lead the list — when a user types "tonight" they
  // probably want the /tonight surface itself, not a place named
  // Tonight Foo. They're cheap to compute (a few keyword checks) and
  // capped at the head; the rest of the limit goes to real ranked hits.
  const actions = matchQuickActions(query).slice(0, 2);
  // Map layers ride after quick actions: "farmers market" should offer
  // the overlay alongside the market places themselves.
  const layers = matchLayers(query).slice(0, 1);
  const head = [...actions, ...layers];
  const hits = search(query, Math.max(1, limit - head.length)).map(hitToResult);
  return [...head, ...hits];
}
