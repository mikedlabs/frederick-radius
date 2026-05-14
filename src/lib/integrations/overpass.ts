/**
 * Overpass API — OpenStreetMap business + POI data.
 * Free, no key, attribution required (we credit on the map).
 *
 * We query within a Frederick County bbox for:
 *  - amenity (food, drink, civic, transit, lodging, services)
 *  - shop (retail of every kind)
 *  - tourism (museums, galleries, viewpoints, attractions)
 *  - leisure (parks, playgrounds, sports)
 *  - office (professional services)
 *
 * Returns a normalized OsmPlace[] keyed by OSM id.
 */

const OVERPASS = "https://overpass-api.de/api/interpreter";

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

const QUERY = (bbox: [number, number, number, number]) => `
[out:json][timeout:60];
(
  node["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten|nightclub|ice_cream|bakery|cinema|theatre|library|community_centre|fire_station|police|townhall|courthouse|post_office|pharmacy|hospital|clinic|dentist|veterinary|fuel|bank|atm|car_wash|car_rental|bicycle_rental|charging_station|parking|parking_entrance|place_of_worship|school|university|college|kindergarten|childcare|bbq|fountain|drinking_water|toilets|bench|shelter)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  node["shop"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  node["tourism"~"^(museum|gallery|attraction|viewpoint|artwork|hotel|motel|guest_house|hostel|information|picnic_site|theme_park|zoo)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  node["leisure"~"^(park|playground|sports_centre|fitness_centre|pitch|swimming_pool|garden|dog_park|nature_reserve|stadium|track|marina)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  node["office"~"^(government|nonprofit|company|coworking|estate_agent|insurance|lawyer|accountant)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});

  way["amenity"~"^(restaurant|cafe|bar|pub|cinema|theatre|library|community_centre|fire_station|police|townhall|courthouse|post_office|pharmacy|hospital|university|college|school|place_of_worship|parking)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  way["shop"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  way["tourism"~"^(museum|gallery|attraction|viewpoint|hotel|motel|guest_house|theme_park|zoo)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
  way["leisure"~"^(park|playground|sports_centre|swimming_pool|garden|nature_reserve|stadium)$"](${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]});
);
out center tags;
`.replace(/\n\s*/g, " ");

function mapTagToCategory(tags: Record<string, string>): { category_slug: string; osm_tag: string } | null {
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
  if (a === "place_of_worship") return { category_slug: "civic", osm_tag: "amenity=place_of_worship" };
  if (a === "university" || a === "college") return { category_slug: "civic", osm_tag: "amenity=" + a };
  if (a === "school" || a === "kindergarten" || a === "childcare") return { category_slug: "family", osm_tag: "amenity=" + a };

  if (t === "museum") return { category_slug: "museum", osm_tag: "tourism=museum" };
  if (t === "gallery" || t === "artwork") return { category_slug: "gallery", osm_tag: "tourism=" + t };
  if (t === "attraction" || t === "viewpoint" || t === "theme_park" || t === "zoo") return { category_slug: "arts", osm_tag: "tourism=" + t };
  if (t === "hotel" || t === "motel" || t === "guest_house" || t === "hostel") return { category_slug: "lodging", osm_tag: "tourism=" + t };

  if (l === "park" || l === "garden" || l === "nature_reserve" || l === "dog_park") return { category_slug: "park", osm_tag: "leisure=" + l };
  if (l === "playground") return { category_slug: "playground", osm_tag: "leisure=playground" };
  if (l === "sports_centre" || l === "fitness_centre" || l === "pitch" || l === "swimming_pool" || l === "stadium" || l === "track") return { category_slug: "wellness", osm_tag: "leisure=" + l };

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

export async function fetchOsmFrederick(): Promise<OsmPlace[]> {
  const body = `data=${encodeURIComponent(QUERY(FREDERICK_COUNTY_BBOX))}`;

  let data: OverpassResponse | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body,
      });
      if (!res.ok) continue;
      data = (await res.json()) as OverpassResponse;
      break;
    } catch {
      continue;
    }
  }
  if (!data) return [];

  try {
    const out: OsmPlace[] = [];
    const seen = new Set<string>();

    for (const el of data.elements) {
      const name = el.tags?.name?.trim();
      if (!name) continue;
      if (SKIP_NAMES.has(name)) continue;

      const tags = el.tags ?? {};
      const mapped = mapTagToCategory(tags);
      if (!mapped) continue;

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
  } catch {
    return [];
  }
}
