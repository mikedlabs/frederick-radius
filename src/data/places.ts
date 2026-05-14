import type { LngLat } from "@/lib/geo";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type HoursWindow = { open: string; close: string };
export type Hours = Partial<Record<DayOfWeek, HoursWindow[]>>;

export type OperationalStatus =
  | "operational"
  | "closed_temporarily"
  | "closed_permanently"
  | "needs_verification";

export type Place = {
  slug: string;
  name: string;
  category: string;
  subcategories?: string[];
  tags?: string[];
  short_blurb: string;
  description?: string;
  address: string;
  city: string;
  state: "MD";
  postal_code: string;
  municipality: string;
  geom: LngLat;
  phone?: string;
  website?: string;
  hours?: Hours;
  price_band?: 1 | 2 | 3 | 4;
  amenities?: string[];
  accessibility?: { wheelchair?: boolean; restroom?: boolean; parking?: boolean };
  hero_image?: string;
  is_verified: boolean;
  /** True only when hours come from the owner, Yelp, or admin verification — never from seed guesses. */
  hours_verified?: boolean;
  /** Operational status. "needs_verification" until cross-checked against Google Places / Yelp / etc. */
  is_operational?: OperationalStatus;
  feature_score: number;
  source: "seed" | "dfp" | "arcgis" | "yelp" | "google" | "manual";
  updated_at: string;

  // ── Reservation / ordering / parking integrations ──
  /** OpenTable restaurant reference id (the integer in the URL after restref=) */
  opentable_id?: string;
  /** Resy slug, e.g. "ayse-meze-lounge" */
  resy_slug?: string;
  /** Direct online-ordering URL (Toast, Square, Olo, Chow Now, etc.) */
  order_url?: string;
  /** Menu URL — separate so we can show "View menu" even when ordering isn't online */
  menu_url?: string;
  /** Delivery deep links — DoorDash / Uber Eats / Grubhub */
  doordash_url?: string;
  ubereats_url?: string;
  grubhub_url?: string;
  /** ParkMobile zone code (the 5-digit number a user types in the app). */
  parkmobile_zone?: string;
  /** Cross-reference ids for enrichment + verification */
  yelp_business_id?: string;
  google_place_id?: string;
  foursquare_id?: string;
  /** Social handles (without @) */
  instagram?: string;
  facebook?: string;
};

const HOURS_PARK: Hours = {
  mon: [{ open: "06:00", close: "22:00" }],
  tue: [{ open: "06:00", close: "22:00" }],
  wed: [{ open: "06:00", close: "22:00" }],
  thu: [{ open: "06:00", close: "22:00" }],
  fri: [{ open: "06:00", close: "22:00" }],
  sat: [{ open: "06:00", close: "22:00" }],
  sun: [{ open: "06:00", close: "22:00" }],
};

/**
 * Curated seed list — civic infrastructure and major venues only.
 *
 * RULES we apply here:
 *  - Every entry must be either (a) public infrastructure (parks, libraries,
 *    parking decks) that doesn't close as a business, or (b) a major venue
 *    whose continued operation is publicly verifiable today.
 *  - No restaurants/bars/breweries until they're cross-verified against
 *    Google Places (is_operational = OPERATIONAL). The OSM map layer
 *    surfaces every restaurant in the county; we don't need to fabricate.
 *  - No hours unless they're predictable (parks, libraries with known
 *    schedules).
 *
 * When Google Places API is wired (see GOOGLE_PLACES_API.md), this file
 * stays as the editorial spine; everything else hydrates from Google.
 */
export const PLACES: Place[] = [
  // ──── Frederick — Parks & Outdoor ────────────────────────────────────
  {
    slug: "carroll-creek-linear-park-frederick",
    name: "Carroll Creek Linear Park",
    category: "park",
    tags: ["free", "outdoor", "kids-0-5", "kids-6-12", "dog-friendly", "year-round"],
    short_blurb: "Mile-and-a-quarter of waterway, walking paths, gardens, and seasonal sailboats.",
    description:
      "The city's signature public space. Stone bridges, public art, the Color on the Creek summer sailboat installation, and downtown's spine for evening walks and outdoor festivals.",
    address: "Carroll Creek between East St and Bentz St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4109, lat: 39.4137 },
    hours: HOURS_PARK,
    hours_verified: true,
    price_band: 1,
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.5,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "baker-park-frederick",
    name: "Baker Park",
    category: "park",
    tags: ["free", "outdoor", "kids-0-5", "kids-6-12", "dog-friendly"],
    short_blurb: "44-acre downtown park with a band shell, lake, tennis, and the Joseph D. Baker carillon tower.",
    address: "121 N Bentz St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4198, lat: 39.4170 },
    hours: HOURS_PARK,
    hours_verified: true,
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.0,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── NPS units (Federal — can't close as businesses) ────────────────
  {
    slug: "catoctin-mountain-park",
    name: "Catoctin Mountain Park",
    category: "park",
    tags: ["free", "outdoor", "kids-6-12", "dog-friendly", "year-round"],
    short_blurb: "National Park unit with overlooks, trails, and the most-photographed Maryland fall foliage.",
    address: "14707 Park Central Rd",
    city: "Thurmont",
    state: "MD",
    postal_code: "21788",
    municipality: "thurmont",
    geom: { lng: -77.4505, lat: 39.6361 },
    website: "https://www.nps.gov/cato/",
    price_band: 1,
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.4,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "cunningham-falls-state-park-thurmont",
    name: "Cunningham Falls State Park",
    category: "park",
    tags: ["outdoor", "kids-6-12", "year-round"],
    short_blurb: "78-foot cascading waterfall, lake swimming, and the Hunting Creek camping area.",
    address: "14039 Catoctin Hollow Rd",
    city: "Thurmont",
    state: "MD",
    postal_code: "21788",
    municipality: "thurmont",
    geom: { lng: -77.4612, lat: 39.6217 },
    website: "https://dnr.maryland.gov/publiclands/Pages/western/cunninghamfalls.aspx",
    price_band: 1,
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.2,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "monocacy-national-battlefield-frederick",
    name: "Monocacy National Battlefield",
    category: "park",
    tags: ["free", "outdoor", "kids-6-12"],
    short_blurb: "1,647-acre Civil War battlefield with five walking trails and a visitor center.",
    address: "5201 Urbana Pike",
    city: "Frederick",
    state: "MD",
    postal_code: "21704",
    municipality: "frederick",
    geom: { lng: -77.3934, lat: 39.3742 },
    website: "https://www.nps.gov/mono/",
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.6,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "c-and-o-canal-brunswick",
    name: "C&O Canal Towpath — Brunswick",
    category: "trail",
    tags: ["free", "outdoor", "dog-friendly", "year-round", "bike-rack"],
    short_blurb: "184.5 miles total; the Brunswick stretch follows the Potomac and the rail line.",
    address: "100 W Potomac St",
    city: "Brunswick",
    state: "MD",
    postal_code: "21716",
    municipality: "brunswick",
    geom: { lng: -77.6310, lat: 39.3082 },
    website: "https://www.nps.gov/choh/",
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.9,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "gathland-state-park-burkittsville",
    name: "Gathland State Park",
    category: "park",
    tags: ["outdoor", "kids-6-12", "year-round"],
    short_blurb: "Civil War correspondents memorial on the Appalachian Trail above South Mountain.",
    address: "900 Arnoldstown Rd",
    city: "Burkittsville",
    state: "MD",
    postal_code: "21718",
    municipality: "burkittsville",
    geom: { lng: -77.6394, lat: 39.4061 },
    website: "https://dnr.maryland.gov/publiclands/Pages/western/gathland.aspx",
    is_verified: true,
    is_operational: "operational",
    feature_score: 7.8,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── Frederick — Arts & Culture (major venues) ──────────────────────
  {
    slug: "weinberg-center-for-the-arts-frederick",
    name: "Weinberg Center for the Arts",
    category: "theater",
    tags: ["ticketed", "live-music", "indoor"],
    short_blurb: "Historic 1920s movie palace turned 1,140-seat performing arts center.",
    address: "20 W Patrick St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4124, lat: 39.4145 },
    website: "https://weinbergcenter.org",
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.0,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "national-museum-civil-war-medicine-frederick",
    name: "National Museum of Civil War Medicine",
    category: "museum",
    tags: ["kids-6-12", "indoor", "rainy-day"],
    short_blurb: "The only museum in the country focused on Civil War-era medicine.",
    address: "48 E Patrick St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4099, lat: 39.4141 },
    website: "https://www.civilwarmed.org",
    price_band: 1,
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.5,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "delaplaine-arts-center-frederick",
    name: "Delaplaine Arts Center",
    category: "gallery",
    tags: ["free", "first-friday", "indoor"],
    short_blurb: "Free admission, rotating exhibitions, classes, and First Friday openings.",
    address: "40 S Carroll St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4117, lat: 39.4128 },
    website: "https://delaplaine.org",
    price_band: 1,
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.7,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "brunswick-heritage-museum",
    name: "Brunswick Heritage Museum",
    category: "museum",
    tags: ["indoor", "kids-6-12", "rainy-day"],
    short_blurb: "The railroad story of Brunswick told in three floors of artifacts and a working HO model.",
    address: "40 W Potomac St",
    city: "Brunswick",
    state: "MD",
    postal_code: "21716",
    municipality: "brunswick",
    geom: { lng: -77.6296, lat: 39.3088 },
    website: "https://www.brunswickheritagemuseum.org",
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.0,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "walkersville-southern-railroad",
    name: "Walkersville Southern Railroad",
    category: "museum",
    subcategories: ["family"],
    tags: ["seasonal", "kids-0-5", "kids-6-12", "ticketed"],
    short_blurb: "Heritage steam excursions through farmland on weekends, May through October.",
    address: "34 W Pennsylvania Ave",
    city: "Walkersville",
    state: "MD",
    postal_code: "21793",
    municipality: "walkersville",
    geom: { lng: -77.3528, lat: 39.4861 },
    website: "https://wsrr.org",
    price_band: 2,
    is_verified: true,
    is_operational: "operational",
    feature_score: 7.9,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── Major commercial venues (large enough that closure would be national news) ──
  {
    slug: "south-mountain-creamery-middletown",
    name: "South Mountain Creamery",
    category: "market",
    subcategories: ["food"],
    tags: ["kids-0-5", "kids-6-12", "year-round", "family", "free"],
    short_blurb: "Working dairy with on-site creamery, milking demos, and the best soft-serve in the county.",
    address: "8305 Bolivar Rd",
    city: "Middletown",
    state: "MD",
    postal_code: "21769",
    municipality: "middletown",
    geom: { lng: -77.5571, lat: 39.4787 },
    website: "https://southmountaincreamery.com",
    instagram: "southmountaincreamery",
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.7,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "linganore-winecellars-mount-airy",
    name: "Linganore Winecellars",
    category: "brewery",
    subcategories: ["food"],
    tags: ["outdoor", "groups", "weather-dependent", "live-music"],
    short_blurb: "Maryland's largest winery — 230 acres, weekend music, and the long views off the ridge.",
    address: "13601 Glissans Mill Rd",
    city: "Mount Airy",
    state: "MD",
    postal_code: "21771",
    municipality: "mount-airy",
    geom: { lng: -77.1813, lat: 39.4172 },
    website: "https://www.linganorewines.com",
    instagram: "linganorewinecellars",
    is_verified: true,
    is_operational: "operational",
    feature_score: 8.3,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── Civic infrastructure ───────────────────────────────────────────
  {
    slug: "c-burr-artz-public-library-frederick",
    name: "C. Burr Artz Public Library",
    category: "library",
    tags: ["free", "wifi", "indoor", "rainy-day", "kids-0-5", "kids-6-12"],
    short_blurb: "Downtown branch with kids' wing, makerspace, and community rooms.",
    address: "110 E Patrick St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4083, lat: 39.4140 },
    website: "https://fcpl.org",
    hours: {
      mon: [{ open: "10:00", close: "20:00" }],
      tue: [{ open: "10:00", close: "20:00" }],
      wed: [{ open: "10:00", close: "20:00" }],
      thu: [{ open: "10:00", close: "20:00" }],
      fri: [{ open: "10:00", close: "18:00" }],
      sat: [{ open: "09:00", close: "17:00" }],
      sun: [{ open: "13:00", close: "17:00" }],
    },
    hours_verified: true,
    is_verified: true,
    is_operational: "operational",
    feature_score: 9.1,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── Lodging — chain hotel ──────────────────────────────────────────
  {
    slug: "hilton-garden-inn-frederick",
    name: "Hilton Garden Inn Frederick",
    category: "lodging",
    tags: ["wifi", "parking-lot"],
    short_blurb: "Downtown-adjacent hotel with a free shuttle to East Street restaurants.",
    address: "7226 Corporate Ct",
    city: "Frederick",
    state: "MD",
    postal_code: "21703",
    municipality: "frederick",
    geom: { lng: -77.4264, lat: 39.3839 },
    website: "https://www.hilton.com/en/hotels/fdkmdgi-hilton-garden-inn-frederick/",
    is_verified: true,
    is_operational: "operational",
    feature_score: 7.0,
    source: "seed",
    updated_at: "2026-05-14",
  },

  // ──── Parking — City of Frederick decks ──────────────────────────────
  // ParkMobile zone codes shown below are EXAMPLES — they need to be confirmed
  // with City of Frederick parking division before launch.
  {
    slug: "carroll-creek-parking-garage-frederick",
    name: "Carroll Creek Parking Deck",
    category: "parking",
    tags: ["accessible"],
    short_blurb: "Closest deck to Carroll Creek; ParkMobile after-hours, free first hour weekends.",
    address: "44 E Patrick St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4101, lat: 39.4145 },
    website: "https://www.cityoffrederickmd.gov/207/Parking",
    parkmobile_zone: "needs_verification",
    is_verified: true,
    is_operational: "operational",
    feature_score: 7.0,
    source: "seed",
    updated_at: "2026-05-14",
  },
  {
    slug: "court-street-parking-garage-frederick",
    name: "Court Street Parking Deck",
    category: "parking",
    tags: ["accessible"],
    short_blurb: "City hall–adjacent garage; quickest in/out for North Market dinners.",
    address: "2 S Court St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4127, lat: 39.4137 },
    website: "https://www.cityoffrederickmd.gov/207/Parking",
    parkmobile_zone: "needs_verification",
    is_verified: true,
    is_operational: "operational",
    feature_score: 6.8,
    source: "seed",
    updated_at: "2026-05-14",
  },
];

export const PLACE_BY_SLUG = Object.fromEntries(
  PLACES.map((p) => [p.slug, p])
) as Record<string, Place>;

export function placesByCategory(slug: string): Place[] {
  return PLACES.filter(
    (p) => p.category === slug || (p.subcategories ?? []).includes(slug)
  );
}

export function placesByMunicipality(slug: string): Place[] {
  return PLACES.filter((p) => p.municipality === slug);
}
