import { BRAND } from "@/lib/brand";

export type Category = {
  slug: string;
  name: string;
  parent?: string;
  icon: string;
  color: string;
  display_order: number;
  blurb: string;
  /**
   * Editorial weight for EVENT surfaces. "draw" = something people come
   * out for (music, food, arts, family, markets); "utility" = civic
   * business people may need but won't browse for fun (council / NAC /
   * commission meetings, hearings, elections). Drives the draw-leads /
   * utility-tucked-away hierarchy on Today, /events, and /map — ONE rule,
   * everywhere. Omitted = "draw" (the common case).
   */
  kind?: "draw" | "utility";
  /**
   * Cross-tree doorways: sub-chips to show on this category's page IN
   * ADDITION to its own children. For hubs whose audience overlaps
   * another branch (Family → Playgrounds lives under outdoors) — a slug
   * can only have one `parent`, but families still need the door.
   */
  see_also?: string[];
};

export const CATEGORIES: Category[] = [
  { slug: "food", name: "Eat & drink", icon: "Utensils", color: BRAND.colors.brick, display_order: 10, blurb: "Restaurants, cafes, bars, and breweries include current hours when available." },
  { slug: "restaurant", name: "Restaurants", parent: "food", icon: "UtensilsCrossed", color: BRAND.colors.brick, display_order: 11, blurb: "The restaurant guide runs from quick meals to special-occasion dining." },
  { slug: "coffee", name: "Coffee", parent: "food", icon: "Coffee", color: "#8B5A2B", display_order: 12, blurb: "Independent cafes and local roasters share the map with reliable quick stops." },
  { slug: "bar", name: "Bars", parent: "food", icon: "Wine", color: "#7E1F1F", display_order: 13, blurb: "The bar list covers cocktail rooms, pubs, taprooms, and neighborhood dives." },
  { slug: "brewery", name: "Breweries", parent: "food", icon: "Beer", color: BRAND.colors.functionalAmber, display_order: 14, blurb: "Independent local breweries appear with their taprooms and beer gardens." },
  { slug: "winery", name: "Wineries", parent: "food", icon: "Grape", color: "#6B2D5A", display_order: 18, blurb: "Frederick County's wine country includes vineyards, tasting rooms, cideries, and meaderies." },
  { slug: "distillery", name: "Distilleries", parent: "food", icon: "FlaskConical", color: "#9A5B2E", display_order: 19, blurb: "Local distilleries pour Maryland spirits in tasting rooms across the county." },
  { slug: "bakery", name: "Bakeries", parent: "food", icon: "Cookie", color: BRAND.colors.functionalAmber, display_order: 15, blurb: "Local bakeries cover bread, pastries, and early-morning favorites." },
  { slug: "pizza", name: "Pizza", parent: "food", icon: "Pizza", color: BRAND.colors.brick, display_order: 16, blurb: "The pizza list runs from quick slices to wood-fired pies." },
  { slug: "ice-cream", name: "Ice cream & treats", parent: "food", icon: "IceCream", color: "#D6739B", display_order: 17, blurb: "Ice cream shops share this section with gelato, frozen custard, snowballs, and candy stores." },
  { slug: "food-truck", name: "Food trucks", parent: "food", icon: "Truck", color: BRAND.colors.brick, display_order: 17.5, blurb: "Recurring stops and larger food-truck events appear when a reliable schedule is available." },

  { slug: "outdoors", name: "Parks & trails", icon: "Trees", color: BRAND.colors.forest, display_order: 20, blurb: "Parks, trails, playgrounds, water access, and scenic overlooks come together here." },
  { slug: "park", name: "Parks", parent: "outdoors", icon: "Trees", color: BRAND.colors.forest, display_order: 21, blurb: "Public parks span Frederick County's municipalities and unincorporated communities." },
  { slug: "trail", name: "Trails", parent: "outdoors", icon: "Mountain", color: BRAND.colors.forest, display_order: 22, blurb: "County trails include wooded hikes, towpaths, and rail-trails." },
  { slug: "playground", name: "Playgrounds", parent: "outdoors", icon: "ToyBrick", color: BRAND.colors.forest, display_order: 23, blurb: "Public playgrounds are mapped for quick nearby trips." },
  { slug: "golf", name: "Golf", parent: "outdoors", icon: "Flag", color: "#2E7D5B", display_order: 24, blurb: "The county's public courses and private clubs are listed together." },
  { slug: "agritourism", name: "Farms & pick-your-own", parent: "outdoors", icon: "Tractor", color: "#6B8E23", display_order: 25, blurb: "Visitor-ready farms include orchards, farm stands, creameries, and seasonal attractions." },

  { slug: "arts", name: "Arts & culture", icon: "Palette", color: BRAND.colors.plum, display_order: 30, blurb: "Galleries, theaters, museums, and performance spaces make up this section." },
  { slug: "museum", name: "Museums", parent: "arts", icon: "Landmark", color: "#5B1E55", display_order: 31, blurb: "Local museums cover Civil War history, civic life, science, and art." },
  { slug: "gallery", name: "Galleries", parent: "arts", icon: "ImageIcon", color: BRAND.colors.plum, display_order: 32, blurb: "Independent galleries and First Friday exhibition spaces appear here." },
  { slug: "theater", name: "Theaters", parent: "arts", icon: "Theater", color: "#5B1E55", display_order: 33, blurb: "Theater listings include stage venues, cinemas, and other performance rooms." },
  { slug: "music", name: "Live music", parent: "arts", icon: "Music", color: BRAND.colors.plum, display_order: 34, blurb: "These venues regularly host live music or seasonal outdoor series." },
  { slug: "public-art", name: "Public art", parent: "arts", icon: "Palette", color: "#9B3F8A", display_order: 35, blurb: "Murals, sculptures, and installations turn up across public spaces." },
  { slug: "tours", name: "Tours & rides", parent: "arts", icon: "BusFront", color: BRAND.colors.plum, display_order: 36, blurb: "Local tours include double-decker rides, heritage rail excursions, and guided walks." },

  { slug: "family", name: "Family", icon: "Baby", color: BRAND.colors.ridge, display_order: 40, blurb: "Places and events appear here when the available source supports a family-friendly claim.", see_also: ["playground"] },
  { slug: "library", name: "Libraries", parent: "family", icon: "Library", color: BRAND.colors.creek, display_order: 41, blurb: "Frederick County Public Libraries branches offer programs and public amenities." },

  { slug: "sports", name: "Sports", icon: "Activity", color: "#0F8A5F", display_order: 45, blurb: "Local teams and spectator events share this section." },

  { slug: "shopping", name: "Shopping", icon: "ShoppingBag", color: BRAND.colors.functionalAmber, display_order: 50, blurb: "Independent shops and Main Street businesses appear throughout the county." },
  { slug: "antiques", name: "Antiques", parent: "shopping", icon: "Lamp", color: "#8B5A2B", display_order: 51, blurb: "New Market anchors the county's antique-shop listings." },
  { slug: "book-store", name: "Book stores", parent: "shopping", icon: "BookOpen", color: "#8B5A2B", display_order: 52, blurb: "Frederick County still has independent booksellers worth seeking out." },
  { slug: "market", name: "Markets", parent: "shopping", icon: "Apple", color: BRAND.colors.forest, display_order: 53, blurb: "Farmers markets and makers markets include current schedules when available." },

  { slug: "wellness", name: "Wellness", icon: "Heart", color: "#A02929", display_order: 60, blurb: "Personal care and everyday wellness businesses are collected here: massage, salons and barbers, spas, yoga and fitness." },
  { slug: "yoga", name: "Yoga & fitness", parent: "wellness", icon: "Activity", color: "#A02929", display_order: 61, blurb: "The list covers yoga studios, gyms, and group classes." },
  { slug: "massage", name: "Massage", parent: "wellness", icon: "HeartPulse", color: "#A02929", display_order: 62, blurb: "Massage therapy and bodywork studios are listed across the county." },
  { slug: "salon", name: "Salon & barber", parent: "wellness", icon: "Scissors", color: "#A02929", display_order: 63, blurb: "Hair salons, barbershops, and nail studios are grouped here." },
  { slug: "spa", name: "Spas", parent: "wellness", icon: "Sparkles", color: "#A02929", display_order: 64, blurb: "Day spas, medspas, and skin-care studios appear in this section." },

  { slug: "civic", name: "Civic & public", icon: "Building2", color: BRAND.colors.creek, display_order: 70, blurb: "Government services, public buildings, and civic infrastructure belong here.", kind: "utility" },
  { slug: "government", name: "Government", parent: "civic", icon: "Building", color: BRAND.colors.creek, display_order: 71, blurb: "City, town, and county government buildings appear with their public services.", kind: "utility" },
  { slug: "public-safety", name: "Public safety", parent: "civic", icon: "ShieldCheck", color: "#A02929", display_order: 72, blurb: "Police, fire, and emergency-service locations are mapped here.", kind: "utility" },
  { slug: "voting", name: "Voting", parent: "civic", icon: "Vote", color: BRAND.colors.creek, display_order: 73, blurb: "Election-day and early-voting centers appear with their published details.", kind: "utility" },
  { slug: "worship", name: "Churches & worship", parent: "civic", icon: "Church", color: "#5B3A8F", display_order: 74, blurb: "Churches, temples, and other houses of worship are included across the county." },

  // The honest catch-all for events that don't fit a sharper bucket —
  // fundraisers, neighborhood gatherings, holiday lighting walks,
  // pancake breakfasts, the everyday community life of the county.
  // Used as the fallback in src/lib/ingest/ical.ts so uncategorized
  // events stop silently being labelled as "Arts & Culture."
  { slug: "community", name: "Community", icon: "Users", color: "#8B6F4E", display_order: 75, blurb: "Civic gatherings, fundraisers, holiday traditions, and neighborhood events land here." },

  { slug: "services", name: "Services", icon: "Wrench", color: "#4A4A48", display_order: 80, blurb: "Pharmacies, hardware stores, postal services, and other practical stops are grouped here." },
  { slug: "pharmacy", name: "Pharmacies", parent: "services", icon: "Pill", color: BRAND.colors.forest, display_order: 81, blurb: "The directory includes independent and chain pharmacies." },
  { slug: "hardware", name: "Hardware", parent: "services", icon: "Hammer", color: "#4A4A48", display_order: 82, blurb: "Hardware, lumber, and home-supply stores appear in this section." },
  { slug: "auto-care", name: "Auto care", parent: "services", icon: "CarFront", color: BRAND.colors.creek, display_order: 83, blurb: "Oil changes, car washes, inspections, maintenance, and repair shops are grouped by the work they perform." },

  { slug: "lodging", name: "Lodging", icon: "Hotel", color: "#5B1E55", display_order: 90, blurb: "Overnight options range from downtown hotels to country inns and farm stays." },

  { slug: "transit", name: "Transit", icon: "Train", color: BRAND.colors.creek, display_order: 95, blurb: "Transit listings cover county buses, MARC rail, and local stations." },
  { slug: "parking", name: "Parking", icon: "ParkingCircle", color: "#4A4A48", display_order: 96, blurb: "Garages, public lots, and street-parking guidance are collected here." },

  // Public-infrastructure amenities (mapped from OpenStreetMap tags; stable)
  { slug: "amenities", name: "Amenities", icon: "PinCircle", color: BRAND.colors.creek, display_order: 100, blurb: "The map brings together restrooms, water, seating, waste stations, and other public infrastructure." },
  { slug: "restroom", name: "Public restrooms", parent: "amenities", icon: "DoorOpen", color: BRAND.colors.creek, display_order: 101, blurb: "Mapped public restrooms include facilities in parks, libraries, and downtown." },
  { slug: "water", name: "Drinking water", parent: "amenities", icon: "Droplets", color: BRAND.colors.creek, display_order: 102, blurb: "Mapped water points include drinking fountains and bottle-filling stations." },
  { slug: "trash", name: "Trash receptacles", parent: "amenities", icon: "Trash2", color: "#4A4A48", display_order: 103, blurb: "Radius and OpenStreetMap contributors have mapped these public trash cans." },
  { slug: "recycling", name: "Recycling drop-offs", parent: "amenities", icon: "Recycle", color: BRAND.colors.forest, display_order: 104, blurb: "Public recycling drop-off locations are shown when mapped." },
  { slug: "dog-waste", name: "Dog waste stations", parent: "amenities", icon: "PawPrint", color: BRAND.colors.forest, display_order: 105, blurb: "Mapped dog stations include bag dispensers and waste bins." },
  { slug: "dog-water", name: "Dog water", parent: "amenities", icon: "PawPrint", color: BRAND.colors.creek, display_order: 105.5, blurb: "Mapped dog-water bowls and fountains appear here." },
  { slug: "outlet", name: "Power outlets", parent: "amenities", icon: "Plug", color: "#4A4A48", display_order: 105.7, blurb: "Public power outlets appear when their location has been mapped." },
  { slug: "wifi", name: "Public WiFi", parent: "amenities", icon: "Wifi", color: BRAND.colors.creek, display_order: 106, blurb: "Libraries, parks, and businesses that advertise free public Wi-Fi are included." },
  { slug: "bench", name: "Benches", parent: "amenities", icon: "Armchair", color: "#7A7975", display_order: 106.5, blurb: "Mapped public seating includes benches along trails and in parks." },
  { slug: "picnic", name: "Picnic areas", parent: "amenities", icon: "Utensils", color: BRAND.colors.forest, display_order: 107, blurb: "Mapped picnic areas include tables, shelters, and grilling spots." },
  { slug: "bike-parking", name: "Bike parking", parent: "amenities", icon: "Bike", color: BRAND.colors.creek, display_order: 108, blurb: "Mapped bike parking includes racks and corrals." },
  { slug: "bike-repair", name: "Bike repair stations", parent: "amenities", icon: "Wrench", color: BRAND.colors.creek, display_order: 109, blurb: "Mapped fix-it stations include public tools and air pumps." },
  { slug: "defibrillator", name: "Defibrillators (AED)", parent: "amenities", icon: "HeartPulse", color: "#A02929", display_order: 110, blurb: "Publicly accessible AED locations appear when they have been mapped." },
  { slug: "shelter", name: "Shelters", parent: "amenities", icon: "Tent", color: "#4A4A48", display_order: 111, blurb: "Mapped shelters include trail shelters and covered waiting areas." },
];

export const CATEGORY_BY_SLUG = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c])
) as Record<string, Category>;

export const TOP_CATEGORIES = CATEGORIES.filter((c) => !c.parent);

/**
 * Amenity categories (restrooms, Wi-Fi, benches, drinking water, …) are
 * MAP LAYERS, not place directories: their /category/<slug> pages resolve to
 * zero ranked places and read as dead ends (and, listed in the sitemap, as
 * thin indexed pages — audit DQ-016). Their real home is /amenities + the map
 * amenity tray. This predicate is the single source of truth for "this
 * category is an amenity layer, not a browsable directory," used to redirect
 * the page and keep those routes out of the sitemap.
 */
export function isAmenityCategory(slug: string): boolean {
  const c = CATEGORY_BY_SLUG[slug];
  return c?.slug === "amenities" || c?.parent === "amenities";
}

/**
 * Taxonomy labels that describe real Radius content but are not place
 * directories. Route them to the surface that can actually answer the intent
 * instead of rendering an indexed zero-result page.
 */
export const CATEGORY_ROUTE_OVERRIDES: Readonly<Record<string, string>> = {
  "food-truck": "/food-trucks",
  "public-art": "/map?mode=browse&layers=art",
  sports: "/events?intent=sports",
  community: "/events?intent=community",
  hardware: "/category/services",
  voting: "/contacts",
};

export function categoryRouteOverride(slug: string): string | undefined {
  return CATEGORY_ROUTE_OVERRIDES[slug];
}

/**
 * Resolve a category slug to its editorial kind, inheriting from the
 * parent when the leaf doesn't set it (so "government" → civic's
 * "utility" even though only "civic" is tagged). Unknown / blank slugs
 * resolve to "draw" — the safe default — so the keyword layer in
 * lib/event-kind.ts, not the taxonomy, is what catches mistagged
 * utility events.
 */
export function categoryKind(slug: string | undefined): "draw" | "utility" {
  if (!slug) return "draw";
  const c = CATEGORY_BY_SLUG[slug];
  if (!c) return "draw";
  if (c.kind) return c.kind;
  if (c.parent) return CATEGORY_BY_SLUG[c.parent]?.kind ?? "draw";
  return "draw";
}

/**
 * Decorative accent palette — the calmer, field-guide-adjacent hues used
 * for vibe chips, plan presets, poster fallbacks, and map paint (softer
 * than the full-saturation CATEGORIES colors, which stay the taxonomy's
 * own identity).
 *
 * ONE source of truth (design review P2-2): these hues were re-typed as
 * raw hex across a dozen-plus components and libs, and the slate had
 * drifted — #2F5470 is the PRE-brand-deck value of `--app-cool` (#285D73).
 * Mapbox GL paint cannot read CSS custom properties, so map layers import
 * from here too. If you need one of these hues, import it; never re-type
 * the hex.
 */
export const ACCENTS = {
  /** Brick — food/eat accents and selected transit points. */
  terracotta: BRAND.colors.brick,
  /** Carroll Creek slate — civic/calm. Same value as `--app-cool`. */
  slate: BRAND.colors.creek,
  /** Arts & music plum. */
  plum: BRAND.colors.plum,
  /** Catoctin green — parks/outdoors (matches the outdoors category color). */
  catoctin: BRAND.colors.forest,
  /** Amber is retained only for live, caution, traffic, or sunlight states. */
  amber: BRAND.colors.amber,
  /** Ridge separates family/active information without leaning on yellow. */
  family: BRAND.colors.ridge,
} as const;
