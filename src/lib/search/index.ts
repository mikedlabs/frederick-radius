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
  /** Real route-network minutes when the map has an explicit device fix. */
  travel_minutes?: number;
  /** Mapbox Search Box fallback results exist only for the active map-search
   *  session and must never be persisted into the Radius catalog. */
  temporary?: boolean;
  provider?: "Mapbox";
  mapbox_id?: string;
  /** Plain-text provider attribution carried only for a temporary result. */
  attribution?: string;
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

type MapAction = Omit<QuickAction, "keywords"> & {
  matches: (query: string) => boolean;
};

function normalizeIntentText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(query: string, phrase: string): boolean {
  const normalizedPhrase = normalizeIntentText(phrase);
  return (
    query === normalizedPhrase ||
    query.startsWith(`${normalizedPhrase} `) ||
    query.endsWith(` ${normalizedPhrase}`) ||
    query.includes(` ${normalizedPhrase} `)
  );
}

function containsAnyPhrase(query: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => containsPhrase(query, phrase));
}

function isTrashMapQuery(query: string): boolean {
  if (containsAnyPhrase(query, [
    "trash pickup",
    "trash collection",
    "garbage pickup",
    "garbage collection",
    "recycling schedule",
  ])) return false;
  return containsAnyPhrase(query, [
    "trash",
    "trash can",
    "trash cans",
    "garbage",
    "garbage can",
    "garbage cans",
    "rubbish bin",
    "rubbish bins",
    "waste basket",
    "waste baskets",
  ]);
}

function isWaterMapQuery(query: string): boolean {
  if (containsAnyPhrase(query, [
    "water bill",
    "water bills",
    "water outage",
    "water outages",
    "water level",
    "water levels",
    "river",
    "rivers",
    "creek",
    "creeks",
    "flood",
    "flooding",
  ])) return false;
  return containsAnyPhrase(query, [
    "water",
    "drinking water",
    "water fountain",
    "water fountains",
    "bottle refill",
    "bottle refill station",
    "bottle refill stations",
    "hydration station",
    "hydration stations",
  ]);
}

function isPowerMapQuery(query: string): boolean {
  if (containsAnyPhrase(query, [
    "power outage",
    "power outages",
    "lost power",
    "electric bill",
    "electric bills",
    "utility bill",
    "utility bills",
  ])) return false;
  return containsAnyPhrase(query, [
    "power",
    "power outlet",
    "power outlets",
    "public outlet",
    "public outlets",
    "electrical outlet",
    "electrical outlets",
    "plug in",
    "charge my phone",
    "charge a phone",
    "charge my laptop",
    "charge a laptop",
  ]);
}

function isEvChargingMapQuery(query: string): boolean {
  return (
    query === "ev" ||
    containsAnyPhrase(query, [
      "ev charger",
      "ev chargers",
      "ev charging",
      "electric car charger",
      "electric car chargers",
      "electric vehicle charger",
      "electric vehicle chargers",
      "charging station",
      "charging stations",
    ])
  );
}

function isAtmMapQuery(query: string): boolean {
  return containsAnyPhrase(query, ["atm", "atms", "cash machine", "cash machines"]);
}

function isParkingMapQuery(query: string): boolean {
  if (containsAnyPhrase(query, ["parking", "parkmobile"])) return true;
  if (query === "garage" || query === "garages") return true;
  if (
    containsAnyPhrase(query, ["parking garage", "parking garages"]) ||
    (containsAnyPhrase(query, ["garage", "garages"]) &&
      containsAnyPhrase(query, ["car", "cars", "downtown", "park", "parking"]))
  ) return true;
  return (
    containsPhrase(query, "park") &&
    containsAnyPhrase(query, [
      "car",
      "cars",
      "downtown",
      "street",
      "vehicle",
      "vehicles",
      "where can i park",
      "where do i park",
    ])
  );
}

function isTransitMapQuery(query: string): boolean {
  if (containsAnyPhrase(query, ["transit", "bus", "buses", "bus stop", "bus stops", "marc"])) {
    return true;
  }
  return containsAnyPhrase(query, ["train", "trains"]) &&
    containsAnyPhrase(query, ["commute", "public", "route", "routes", "schedule", "schedules", "station", "stations"]);
}

function isLiveBusMapQuery(query: string): boolean {
  return containsAnyPhrase(query, [
    "live bus",
    "live buses",
    "buses now",
    "bus now",
    "where are the buses",
    "where is the bus",
  ]);
}

function isTonightMapQuery(query: string): boolean {
  if (query === "tonight") return true;
  if (!containsPhrase(query, "tonight")) return false;
  if (containsAnyPhrase(query, ["plan tonight", "dinner tonight", "drinks tonight", "date tonight"])) {
    return false;
  }
  return containsAnyPhrase(query, [
    "event",
    "events",
    "happening",
    "happenings",
    "whats on",
    "what is on",
    "things to do",
    "map",
    "near me",
  ]);
}

function isWeekendMapQuery(query: string): boolean {
  if (query === "weekend" || query === "this weekend") return true;
  if (!containsPhrase(query, "weekend")) return false;
  return containsAnyPhrase(query, [
    "event",
    "events",
    "happening",
    "happenings",
    "whats on",
    "what is on",
    "things to do",
    "map",
    "near me",
  ]);
}

/**
 * Direct map answers for resident-shaped utility queries. These lead generic
 * navigation and data matches because the URL opens the requested layer
 * already active; no second trip through Map options is required.
 */
const MAP_ACTIONS: readonly MapAction[] = [
  {
    id: "action:map-atm",
    title: "Find nearby ATMs",
    subtitle: "Search the live map. ATM access is not independently verified.",
    href: "/map?q=ATM",
    matches: isAtmMapQuery,
  },
  {
    id: "action:map-trash",
    title: "Show trash cans on the map",
    subtitle: "Find field-mapped public trash cans.",
    href: "/map?amenity=trash",
    matches: isTrashMapQuery,
  },
  {
    id: "action:map-restrooms",
    title: "Show restrooms on the map",
    subtitle: "Find known public restrooms.",
    href: "/map?amenity=restroom",
    matches: (query) => containsAnyPhrase(query, [
      "restroom",
      "restrooms",
      "bathroom",
      "bathrooms",
      "public toilet",
      "public toilets",
      "washroom",
      "washrooms",
      "loo",
    ]),
  },
  {
    id: "action:map-water",
    title: "Show drinking water on the map",
    subtitle: "Find known public water points.",
    href: "/map?amenity=water",
    matches: isWaterMapQuery,
  },
  {
    id: "action:map-dog-stations",
    title: "Show dog stations on the map",
    subtitle: "Find mapped dog-waste stations and water points.",
    href: "/map?amenity=dog",
    matches: (query) => containsAnyPhrase(query, [
      "dog bag",
      "dog bags",
      "dog station",
      "dog stations",
      "dog waste",
      "pet waste",
      "poop bag",
      "poop bags",
    ]),
  },
  {
    id: "action:map-wifi",
    title: "Show public Wi-Fi on the map",
    subtitle: "Find known public Wi-Fi.",
    href: "/map?amenity=wifi",
    matches: (query) => containsAnyPhrase(query, [
      "wifi",
      "wi fi",
      "public wifi",
      "public wi fi",
      "wireless internet",
    ]),
  },
  {
    id: "action:map-ev",
    title: "Show EV charging on the map",
    subtitle: "Find known electric-vehicle charging points.",
    href: "/map?amenity=ev",
    matches: isEvChargingMapQuery,
  },
  {
    id: "action:map-outlets",
    title: "Show power outlets on the map",
    subtitle: "Find known public outlets for personal devices.",
    href: "/map?amenity=outlet",
    matches: isPowerMapQuery,
  },
  {
    id: "action:map-parking",
    title: "Show parking on the map",
    subtitle: "See downtown garages and other mapped parking.",
    href: "/map?show=parking",
    matches: isParkingMapQuery,
  },
  {
    id: "action:map-live-buses",
    title: "See live buses now",
    subtitle: "Open current TransIT positions with routes and stops.",
    href: "/map?scene=buses-now",
    matches: isLiveBusMapQuery,
  },
  {
    id: "action:map-transit",
    title: "Show transit on the map",
    subtitle: "See bus stops, routes, and MARC stations.",
    href: "/map?show=transit",
    matches: (query) => isTransitMapQuery(query) && !isLiveBusMapQuery(query),
  },
  {
    id: "action:map-radar",
    title: "Show weather radar on the map",
    subtitle: "Open the latest available RainViewer radar layer.",
    href: "/map?show=radar",
    matches: (query) => containsAnyPhrase(query, [
      "radar",
      "weather radar",
      "rain radar",
      "precipitation radar",
    ]),
  },
  {
    id: "action:map-roads",
    title: "Show roads now",
    subtitle: "See current road flow, official reports, and public incidents.",
    href: "/map?scene=roads-now",
    matches: (query) =>
      query === "traffic" ||
      query === "roads" ||
      containsAnyPhrase(query, [
        "road conditions",
        "traffic conditions",
        "road closure",
        "road closures",
        "what are the roads like",
        "roads now",
      ]),
  },
  {
    id: "action:map-outside-now",
    title: "See outdoor conditions now",
    subtitle: "Open parks, paths, and the conditions that affect them.",
    href: "/map?scene=outside-now",
    matches: (query) => containsAnyPhrase(query, [
      "outside now",
      "outdoor conditions",
      "go outside now",
    ]),
  },
  {
    id: "action:map-what-changed",
    title: "See what changed",
    subtitle: "Open mapped projects, civic records, and recent changes.",
    href: "/map?scene=what-changed",
    matches: (query) => containsAnyPhrase(query, [
      "what changed",
      "new projects",
      "recent projects",
      "planning changes",
    ]),
  },
  {
    id: "action:map-within-15",
    title: "See what is within 15 minutes",
    subtitle: "Compare useful places from one starting point.",
    href: "/map?mode=radius&minutes=15",
    matches: (query) => containsAnyPhrase(query, [
      "within 15 minutes",
      "15 minutes away",
      "fifteen minutes away",
      "fifteen minutes from me",
    ]),
  },
  {
    id: "action:map-cameras",
    title: "Show traffic cameras on the map",
    subtitle: "See available Maryland CHART road cameras.",
    href: "/map?show=cameras",
    matches: (query) =>
      query === "camera" ||
      query === "cameras" ||
      containsAnyPhrase(query, [
        "traffic camera",
        "traffic cameras",
        "traffic cam",
        "traffic cams",
        "road camera",
        "road cameras",
        "highway camera",
        "highway cameras",
      ]),
  },
  {
    id: "action:map-incidents",
    title: "Show traffic incidents on the map",
    subtitle: "See available crash, fire, and road incident reports.",
    href: "/map?show=incidents",
    matches: (query) =>
      query === "incident" ||
      query === "incidents" ||
      containsAnyPhrase(query, [
        "traffic incident",
        "traffic incidents",
        "road incident",
        "road incidents",
        "crash",
        "crashes",
        "accident",
        "accidents",
        "scanner incident",
        "scanner incidents",
      ]),
  },
  {
    id: "action:map-parks",
    title: "Show parks on the map",
    subtitle: "See park places from Radius's reviewed place index.",
    href: "/map?intent=outdoor&sub=parks",
    matches: (query) =>
      !isParkingMapQuery(query) &&
      (
        query === "park" ||
        query === "parks" ||
        containsAnyPhrase(query, [
          "public park",
          "public parks",
          "county park",
          "county parks",
          "dog park",
          "playground",
          "playgrounds",
        ])
      ),
  },
  {
    id: "action:map-trails",
    title: "Show trails on the map",
    subtitle: "See mapped trail lines across Frederick County.",
    href: "/map?show=trails",
    matches: (query) => containsAnyPhrase(query, [
      "trail",
      "trails",
      "hike",
      "hiking",
      "appalachian trail",
      "towpath",
    ]),
  },
  {
    id: "action:map-tonight",
    title: "Show tonight on the map",
    subtitle: "See mappable events happening tonight.",
    href: "/map?t=tonight",
    matches: isTonightMapQuery,
  },
  {
    id: "action:map-weekend",
    title: "Show this weekend on the map",
    subtitle: "See mappable events happening this weekend.",
    href: "/map?t=weekend",
    matches: isWeekendMapQuery,
  },
];

function matchMapActions(query: string): SearchResult[] {
  const q = normalizeIntentText(query);
  if (!q) return [];
  return MAP_ACTIONS.filter((action) => action.matches(q)).map((action) => ({
    type: "action" as const,
    id: action.id,
    title: action.title,
    subtitle: action.subtitle,
    href: action.href,
  }));
}

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
  const q = normalizeIntentText(query);
  if (!q) return [];
  return QUICK_ACTIONS.filter((a) =>
    a.keywords.some((keyword) => {
      const k = normalizeIntentText(keyword);
      // Two- and three-character utility nouns are complete requests, not
      // fragments. Without this guard, ER matched `dinner` and EV matched
      // `events` / `evening`, putting planning cards above emergency and
      // charging answers.
      if (q.length <= 3) return k === q;
      return k.startsWith(q) || q.startsWith(k) || containsPhrase(k, q);
    }),
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
  const q = normalizeIntentText(query);
  if (q.length < 3) return [];
  return OVERLAYS.filter(
    (o) =>
      o.ready &&
      // "Where can I park downtown?" is a parking request, not a request
      // for green space. A word-boundary match fixes the old parking→parks
      // substring collision; the intent guard also covers the verb "park."
      !(o.key === "parks" && isParkingMapQuery(q)) &&
      (LAYER_KEYWORDS[o.key] ?? []).some((keyword) => {
        const k = normalizeIntentText(keyword);
        return k.startsWith(q) || containsPhrase(q, k);
      }),
  ).map((o) => ({
    type: "action" as const,
    id: `layer:${o.key}`,
    title: `Show ${o.label.toLowerCase()} on the map`,
    subtitle: o.sources,
    href: `/map?mode=browse&layers=${o.key}`,
  }));
}

function canonicalSearchQuery(query: string): string {
  const q = normalizeIntentText(query);
  if (!isParkingMapQuery(q) || !containsPhrase(q, "park")) return query;
  // The canonical ranker correctly understands the noun "parking," while
  // the verb "park" otherwise overweights park names. Preserve every other
  // word (including near-me/downtown qualifiers) and disambiguate only that
  // one token.
  return query.replace(/\bpark\b/gi, "parking");
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
  const mapActions = matchMapActions(query).slice(0, 2);
  // Direct map answers lead generic doors and ranked records. Quick actions
  // follow them and stay capped at the head; the rest of the limit goes to
  // real ranked hits.
  const actions = matchQuickActions(query).slice(0, 2);
  // Map layers ride after quick actions: "farmers market" should offer
  // the overlay alongside the market places themselves.
  const layers = matchLayers(query).slice(0, 1);
  const head = [...mapActions, ...actions, ...layers];
  const headHrefs = new Set(head.map((a) => a.href));
  // Registry pages and quick actions overlap on purpose (both are doors);
  // never render the same door twice.
  const hits = search(canonicalSearchQuery(query), Math.max(1, limit - head.length), eventPool)
    .map(hitToResult)
    .filter((r) => !headHrefs.has(r.href));
  return [...head, ...hits];
}

function searchHead(query: string): SearchResult[] {
  return [
    ...matchMapActions(query).slice(0, 2),
    ...matchQuickActions(query).slice(0, 2),
    ...matchLayers(query).slice(0, 1),
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

const MAP_ACTIONS_THAT_FULLY_ANSWER_THE_QUERY = new Set([
  "action:map-atm",
  "action:map-trash",
  "action:map-restrooms",
  "action:map-water",
  "action:map-dog-stations",
  "action:map-wifi",
  "action:map-ev",
  "action:map-outlets",
  "action:map-radar",
  "action:map-roads",
  "action:map-cameras",
  "action:map-incidents",
  "action:map-transit",
  "action:map-live-buses",
  "action:map-outside-now",
  "action:map-what-changed",
  "action:map-within-15",
]);

const MAP_ACTIONS_INDEPENDENT_OF_LIVE_EVENTS = new Set([
  "action:map-atm",
  "action:map-trash",
  "action:map-restrooms",
  "action:map-water",
  "action:map-dog-stations",
  "action:map-wifi",
  "action:map-ev",
  "action:map-outlets",
  "action:map-parking",
  "action:map-transit",
  "action:map-live-buses",
  "action:map-outside-now",
  "action:map-what-changed",
  "action:map-within-15",
  "action:map-radar",
  "action:map-roads",
  "action:map-cameras",
  "action:map-incidents",
  "action:map-parks",
  "action:map-trails",
]);

/**
 * True when the query is completely handled by deterministic map controls
 * whose result cannot improve by waiting for the live event corpus.
 *
 * Requiring every matching map action to be event-independent protects mixed
 * requests such as "parks and events tonight": those still receive current
 * event enrichment instead of taking the utility fast path.
 */
export function isLiveEventIndependentMapActionQuery(query: string): boolean {
  const actions = matchMapActions(query);
  return actions.length > 0 && actions.every((action) =>
    MAP_ACTIONS_INDEPENDENT_OF_LIVE_EVENTS.has(action.id),
  );
}

/** Search adapter for natural-language qualifiers. Recognized constraints are
 * applied to the result set; they are never reduced to decorative copy. */
export function qualifiedSearchIndex(
  query: string,
  limit = 12,
  eventPool?: readonly Event[],
  context: QualifiedSearchContext = {},
): QualifiedSearchIndexResult {
  const head = searchHead(query);
  const qualified = qualifiedSearch(
    canonicalSearchQuery(query),
    limit + head.length,
    eventPool,
    context,
  );
  const deterministicUtilityAction = head.some((result) =>
    MAP_ACTIONS_THAT_FULLY_ANSWER_THE_QUERY.has(result.id),
  );
  const ranked = qualified.hits
    .map(hitToResult)
    // A live amenity layer is the answer. A nearby business whose name shares
    // one loose token is not a useful second choice and made the flagship
    // search overlay look random after a correct first row. Keep guide/page
    // doors, but do not proximity-fill these utility requests with places.
    .filter(
      (result) =>
        !deterministicUtilityAction || result.type !== "place",
    );
  const hasDeterministicMapAction = head.some((result) =>
    result.id.startsWith("action:map-"),
  );
  // Natural-language constraints own the first decision: “coffee near me”
  // must lead with the nearest qualified coffee, not a generic map door. For
  // an explicit layer/amenity request, the deterministic map answer still
  // leads because it executes the full request instead of guessing one
  // record. In all cases, URL-level duplicates are removed after merging.
  const supportiveMapAction = hasDeterministicMapAction && !deterministicUtilityAction;
  const firstPlaceIndex = supportiveMapAction
    ? ranked.findIndex((result) => result.type === "place")
    : -1;
  const merged = firstPlaceIndex >= 0
    ? [
        head[0],
        ranked[firstPlaceIndex],
        ...head.slice(1),
        ...ranked.filter((_, index) => index !== firstPlaceIndex),
      ]
    : qualified.meta.qualifiers.constrained && !hasDeterministicMapAction
      ? ranked.length > 0
        ? [ranked[0], ...head, ...ranked.slice(1)]
        : head
      : [...head, ...ranked];
  return {
    results: dedupeByHref(merged, limit),
    meta: qualified.meta,
  };
}
