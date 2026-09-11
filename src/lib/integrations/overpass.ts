/**
 * Overpass API — OpenStreetMap business + POI data.
 * Free, no key, attribution required (we credit on the map).
 *
 * We query within a Frederick County bbox for the stable OSM context Radius
 * actually publishes: civic places, parks, public art, parking, and public
 * amenities. Commercial OSM records were retired from the map because their
 * closure state is not trustworthy; continuing to download every shop and
 * office only made the useful public-infrastructure query time out.
 *
 * Returns a normalized OsmPlace[] keyed by OSM id.
 */

import { isKnownClosed } from "./closures";


// Frederick County bbox (south, west, north, east)
export const FREDERICK_COUNTY_BBOX: [number, number, number, number] = [
  39.265, -77.700, 39.745, -77.150,
];

export type OsmPlace = {
  osm_id: string;
  name: string;
  category_slug: string;
  osm_tag: string;
  lng: number;
  lat: number;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  website?: string;
  opening_hours?: string;
  cuisine?: string;
  brand?: string;
  wheelchair?: "yes" | "no" | "limited";
  outdoor_seating?: boolean;
  /** Reference photo URL — set only for field-collected amenities (osm_id
   *  prefixed "field:"), surfaced in the map popup. */
  photo?: string;
  /** Real observation/submission time carried by first-party map records.
   *  OSM responses omit it; community reports use it for freshness. */
  observed_at?: string;
};

type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

export type OsmFetchOutcome = {
  places: OsmPlace[];
  availability: "current" | "empty" | "unavailable";
  attemptedEndpoints: number;
};

type OsmFetchOptions = {
  fetchImpl?: typeof fetch;
  endpoints?: readonly string[];
  endpointTimeoutMs?: number;
};

const QUERY = (bbox: [number, number, number, number]) => `
[out:json][timeout:90];
(
  // One element scan for the stable civic and micro-amenity set. The nwr
  // replaces the old repeated node/way scans that made a modest county query
  // expensive enough to miss the client deadline.
  nwr["amenity"~"^(library|fire_station|police|townhall|courthouse|post_office|university|college|parking|parking_entrance|toilets|drinking_water|waste_basket|dog_waste_bin|recycling|water_point|shower|bench|picnic_table|bicycle_parking|bicycle_repair_station|defibrillator|shelter|bbq|fountain|public_bookcase|telephone|charging_station)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  nwr["office"="government"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  nwr["tourism"~"^(museum|artwork|picnic_site)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  nwr["leisure"~"^(park|playground|garden|dog_park|nature_reserve)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});

  // Alternative tagging used for drinking points without amenity=water.
  node["drinking_water"="yes"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  // Public/free WiFi access points
  node["internet_access"~"^(wlan|yes|free)$"]["internet_access:fee"!~"yes"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
);
out center tags;
`
  // Strip QL line comments BEFORE collapsing newlines. Overpass QL treats
  // "//" as a comment to end-of-line, so flattening first turns the very
  // first "// ..." into a comment that swallows the entire single-lined
  // query and Overpass answers HTTP 400 (reproduced; audit FR-003). Removing
  // each comment on its own line first keeps the query intact.
  .replace(/\/\/[^\n]*/g, "")
  .replace(/\n\s*/g, " ");

export function mapTagToCategory(tags: Record<string, string>): { category_slug: string; osm_tag: string } | null {
  const a = tags.amenity, s = tags.shop, t = tags.tourism, l = tags.leisure, o = tags.office;
  if (a === "restaurant" || a === "fast_food" || a === "food_court") return { category_slug: "restaurant", osm_tag: "amenity=" + a };
  if (a === "cafe" || a === "ice_cream") return { category_slug: "coffee", osm_tag: "amenity=" + a };
  if (a === "bar" || a === "pub" || a === "nightclub" || a === "biergarten") return { category_slug: "bar", osm_tag: "amenity=" + a };
  if (a === "bakery" || s === "bakery") return { category_slug: "bakery", osm_tag: "amenity=" + (a ?? s) };
  if (a === "cinema" || a === "theatre") return { category_slug: "theater", osm_tag: "amenity=" + a };
  if (a === "library") return { category_slug: "library", osm_tag: "amenity=library" };
  if (a === "fire_station" || a === "police") return { category_slug: "public-safety", osm_tag: "amenity=" + a };
  if (a === "townhall" || a === "courthouse" || a === "post_office" || o === "government") return { category_slug: "government", osm_tag: (a ? "amenity=" + a : "office=government") };
  if (a === "pharmacy") return { category_slug: "pharmacy", osm_tag: "amenity=pharmacy" };
  if (a === "hospital" || a === "clinic" || a === "dentist" || a === "veterinary") return { category_slug: "wellness", osm_tag: "amenity=" + a };
  if (a === "parking" || a === "parking_entrance") return { category_slug: "parking", osm_tag: "amenity=" + a };
  if (a === "place_of_worship") return { category_slug: "worship", osm_tag: "amenity=place_of_worship" };
  if (a === "university" || a === "college") return { category_slug: "civic", osm_tag: "amenity=" + a };
  if (a === "school" || a === "kindergarten" || a === "childcare") return { category_slug: "family", osm_tag: "amenity=" + a };

  if (t === "museum") return { category_slug: "museum", osm_tag: "tourism=museum" };
  if (t === "artwork") return { category_slug: "public-art", osm_tag: "tourism=artwork" };
  if (t === "gallery") return { category_slug: "gallery", osm_tag: "tourism=gallery" };
  if (t === "attraction" || t === "viewpoint" || t === "theme_park" || t === "zoo") return { category_slug: "arts", osm_tag: "tourism=" + t };
  if (t === "hotel" || t === "motel" || t === "guest_house" || t === "hostel") return { category_slug: "lodging", osm_tag: "tourism=" + t };

  if (l === "park" || l === "garden" || l === "nature_reserve" || l === "dog_park") return { category_slug: "park", osm_tag: "leisure=" + l };
  if (l === "playground") return { category_slug: "playground", osm_tag: "leisure=playground" };
  if (l === "sports_centre" || l === "fitness_centre" || l === "pitch" || l === "swimming_pool" || l === "stadium" || l === "track") return { category_slug: "wellness", osm_tag: "leisure=" + l };

  // Public-infrastructure amenities (stable — don't go stale)
  if (a === "toilets") return { category_slug: "restroom", osm_tag: "amenity=toilets" };
  if (a === "charging_station") return { category_slug: "ev-charging", osm_tag: "amenity=charging_station" };
  if ((a === "drinking_water" || a === "water_point" || tags.drinking_water === "yes") && tags.natural !== "spring" && tags.access !== "customers") return { category_slug: "water", osm_tag: a ? "amenity=" + a : "drinking_water=yes" };
  if (a === "waste_basket" && tags.waste === "dog_excrement") return { category_slug: "dog-waste", osm_tag: "amenity=waste_basket,waste=dog_excrement" };
  if (a === "waste_basket") return { category_slug: "trash", osm_tag: "amenity=waste_basket" };
  if (a === "recycling") return { category_slug: "recycling", osm_tag: "amenity=recycling" };
  if (a === "dog_waste_bin") return { category_slug: "dog-waste", osm_tag: "amenity=dog_waste_bin" };
  if (a === "bench") return { category_slug: "bench", osm_tag: "amenity=bench" };
  if (a === "picnic_table" || t === "picnic_site") return { category_slug: "picnic", osm_tag: (a ? "amenity=picnic_table" : "tourism=picnic_site") };
  if (a === "bicycle_parking") return { category_slug: "bike-parking", osm_tag: "amenity=bicycle_parking" };
  if (a === "bicycle_repair_station") return { category_slug: "bike-repair", osm_tag: "amenity=bicycle_repair_station" };
  if (a === "defibrillator") return { category_slug: "defibrillator", osm_tag: "amenity=defibrillator" };
  if (a === "shelter") return { category_slug: "shelter", osm_tag: "amenity=shelter" };
  if (a === "bbq") return { category_slug: "picnic", osm_tag: "amenity=bbq" };
  if (a === "telephone") return { category_slug: "services", osm_tag: "amenity=telephone" };
  if (a === "public_bookcase") return { category_slug: "library", osm_tag: "amenity=public_bookcase" };

  // Reached only when nothing stronger classified it: a node whose point is
  // public/free WiFi (a cafe with wifi is still classified as a cafe above).
  if (tags.internet_access && /^(wlan|yes|free)$/.test(tags.internet_access)) {
    return { category_slug: "wifi", osm_tag: "internet_access=" + tags.internet_access };
  }

  if (s) return { category_slug: "shopping", osm_tag: "shop=" + s };
  if (o) return { category_slug: "services", osm_tag: "office=" + o };
  return null;
}

function joinAddress(tags: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  if (tags["addr:street"]) parts.push(tags["addr:street"]);
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}

// Categories where the data is small public-infra and is allowed to be
// unnamed — we'll generate a label like "Public restroom" from the category.
const UNNAMED_OK = new Set([
  "restroom", "water", "trash", "recycling", "dog-waste", "bench",
  "picnic", "bike-parking", "bike-repair", "defibrillator", "shelter",
  "ev-charging", "public-art",
]);

const UNNAMED_LABELS: Record<string, string> = {
  "restroom": "Public restroom",
  "ev-charging": "EV charging station",
  "public-art": "Public art",
  "water": "Drinking water",
  "trash": "Trash receptacle",
  "recycling": "Recycling drop-off",
  "dog-waste": "Dog waste station",
  "bench": "Bench",
  "picnic": "Picnic area",
  "bike-parking": "Bike parking",
  "bike-repair": "Bike repair station",
  "defibrillator": "Defibrillator (AED)",
  "shelter": "Shelter",
};

const SKIP_NAMES = new Set([
  // Massive chains we don't want to dominate the map
  "McDonald's", "Subway", "Burger King", "Starbucks", "Wendy's", "KFC",
  "Taco Bell", "Dunkin'", "Dunkin' Donuts", "Chipotle", "Sheetz",
]);

// Try multiple Overpass endpoints — they're load-balanced volunteer infra.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const OVERPASS_PRIMARY_TIMEOUT_MS = 12_000;
const OVERPASS_FALLBACK_TIMEOUT_MS = 8_000;

function normalizeOverpassResponse(data: OverpassResponse): OsmPlace[] {
  const out: OsmPlace[] = [];
  const seen = new Set<string>();

  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const mapped = mapTagToCategory(tags);
    if (!mapped) continue;

    const rawName = tags.name?.trim();
    let name = rawName;
    if (!name) {
      if (!UNNAMED_OK.has(mapped.category_slug)) continue;
      name = UNNAMED_LABELS[mapped.category_slug] ?? mapped.category_slug;
    }
    if (SKIP_NAMES.has(name)) continue;
    if (isKnownClosed(name)) continue;

    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lng = el.type === "node" ? el.lon : el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const key = `${name}-${Math.round(lat * 1000)}-${Math.round(lng * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      osm_id: `${el.type}/${el.id}`,
      name,
      category_slug: mapped.category_slug,
      osm_tag: mapped.osm_tag,
      lng,
      lat,
      address: joinAddress(tags),
      city: tags["addr:city"],
      postal_code: tags["addr:postcode"],
      phone: tags.phone ?? tags["contact:phone"],
      website: tags.website ?? tags["contact:website"],
      opening_hours: tags.opening_hours,
      cuisine: tags.cuisine,
      brand: tags.brand,
      wheelchair: tags.wheelchair as OsmPlace["wheelchair"],
      outdoor_seating: tags.outdoor_seating === "yes",
    });
  }

  return out;
}

/**
 * Fetch the county OSM layer while preserving the difference between a real
 * empty response and an upstream outage. Each volunteer endpoint owns its
 * timeout. Reusing one AbortSignal here makes every backup request fail as
 * soon as the first host consumes the shared deadline.
 */
export async function fetchOsmFrederickOutcome(
  options: OsmFetchOptions = {},
): Promise<OsmFetchOutcome> {
  const body = `data=${encodeURIComponent(QUERY(FREDERICK_COUNTY_BBOX))}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;

  let attemptedEndpoints = 0;
  let sawValidEmptyResponse = false;
  for (const endpoint of endpoints) {
    attemptedEndpoints += 1;
    try {
      const endpointTimeoutMs = options.endpointTimeoutMs
        ?? (attemptedEndpoints === 1
          ? OVERPASS_PRIMARY_TIMEOUT_MS
          : OVERPASS_FALLBACK_TIMEOUT_MS);
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          // The primary public mirror rejects anonymous programmatic POSTs
          // with HTTP 406. Identify this read-only civic client per Overpass
          // usage guidance so the healthy endpoint is actually usable.
          "User-Agent": "FrederickRadius/1.0 (https://frederickradius.app)",
        },
        body,
        // A fresh signal is load-bearing: once an AbortSignal fires it can
        // never be reused, including by the next fallback endpoint.
        signal: AbortSignal.timeout(endpointTimeoutMs),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<OverpassResponse>;
      if (!Array.isArray(data.elements)) continue;
      const places = normalizeOverpassResponse(data as OverpassResponse);
      if (places.length > 0) {
        return { places, availability: "current", attemptedEndpoints };
      }
      // An empty response can be real, but the full county query should not
      // make a second healthy mirror irrelevant. Try the remaining mirrors
      // and carry the honest empty state only when every mirror agrees/fails.
      sawValidEmptyResponse = true;
    } catch {
      continue;
    }
  }

  return {
    places: [],
    availability: sawValidEmptyResponse ? "empty" : "unavailable",
    attemptedEndpoints,
  };
}

/** Legacy fail-soft array API used by callers that do not need provenance. */
export async function fetchOsmFrederick(): Promise<OsmPlace[]> {
  return (await fetchOsmFrederickOutcome()).places;
}
