/**
 * Authoritative category correction from Google's primaryType.
 *
 * The DFP scrape miscategorized a large share of places (a coffee shop
 * filed under "shopping", a hotel that isn't in "lodging", Gravel &
 * Grind, Visitation Hotel, …). No name heuristic can catch these —
 * but Google knows exactly what each place is. The full enrichment now
 * captures primaryType; this maps that to our taxonomy so the category
 * is corrected from the source of truth, the same proven pattern as
 * the Google-coordinate pin fix.
 *
 * CONSERVATIVE BY DESIGN: only confident, specific Google types map.
 * Vague ones ("point_of_interest", "establishment", bare "store",
 * "food") return null so the existing (often curated) category is
 * kept — we never trade a known-good category for a vague guess.
 * Pure + unit-tested.
 */

// Google Places API (New) primaryType  →  our category slug.
const MAP: Record<string, string> = {
  // Food & drink
  coffee_shop: "coffee",
  cafe: "coffee",
  tea_house: "coffee",
  bakery: "bakery",
  pizza_restaurant: "pizza",
  bar: "bar",
  pub: "bar",
  wine_bar: "bar",
  night_club: "bar",
  restaurant: "restaurant",
  fine_dining_restaurant: "restaurant",
  fast_food_restaurant: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  diner: "restaurant",
  breakfast_restaurant: "restaurant",
  brunch_restaurant: "restaurant",
  steak_house: "restaurant",
  seafood_restaurant: "restaurant",
  sandwich_shop: "restaurant",
  hamburger_restaurant: "restaurant",
  barbecue_restaurant: "restaurant",
  italian_restaurant: "restaurant",
  mexican_restaurant: "restaurant",
  chinese_restaurant: "restaurant",
  japanese_restaurant: "restaurant",
  thai_restaurant: "restaurant",
  indian_restaurant: "restaurant",
  mediterranean_restaurant: "restaurant",
  american_restaurant: "restaurant",
  ramen_restaurant: "restaurant",
  sushi_restaurant: "restaurant",
  vegetarian_restaurant: "restaurant",
  ice_cream_shop: "restaurant",
  dessert_shop: "restaurant",
  donut_shop: "bakery",
  // Lodging
  lodging: "lodging",
  hotel: "lodging",
  motel: "lodging",
  resort_hotel: "lodging",
  bed_and_breakfast: "lodging",
  inn: "lodging",
  guest_house: "lodging",
  extended_stay_hotel: "lodging",
  // Worship
  church: "worship",
  place_of_worship: "worship",
  hindu_temple: "worship",
  mosque: "worship",
  synagogue: "worship",
  // Outdoors
  park: "park",
  national_park: "park",
  state_park: "park",
  dog_park: "park",
  hiking_area: "trail",
  playground: "playground",
  // Arts & culture
  museum: "museum",
  art_gallery: "gallery",
  performing_arts_theater: "theater",
  movie_theater: "theater",
  concert_hall: "music",
  // Family / civic / services
  library: "library",
  book_store: "book-store",
  antique_store: "antiques",
  school: "family",
  preschool: "family",
  primary_school: "family",
  secondary_school: "family",
  city_hall: "government",
  local_government_office: "government",
  courthouse: "government",
  post_office: "government",
  police: "public-safety",
  fire_station: "public-safety",
  pharmacy: "pharmacy",
  drugstore: "pharmacy",
  hardware_store: "hardware",
  // Shopping
  clothing_store: "shopping",
  shoe_store: "shopping",
  jewelry_store: "shopping",
  gift_shop: "shopping",
  shopping_mall: "shopping",
  department_store: "shopping",
  furniture_store: "shopping",
  home_goods_store: "shopping",
  // Markets
  grocery_store: "market",
  supermarket: "market",
  farm: "market",
  market: "market",
  // Wellness
  gym: "wellness",
  fitness_center: "wellness",
  yoga_studio: "yoga",
  spa: "wellness",
  wellness_center: "wellness",
  // Transit / parking
  transit_station: "transit",
  train_station: "transit",
  bus_station: "transit",
  subway_station: "transit",
  light_rail_station: "transit",
  parking: "parking",
  parking_garage: "parking",
  parking_lot: "parking",

  // Audit-driven additions: Google gave a clear type for ~560 places
  // the corrector had no mapping for, so they sat in vague buckets.
  // These map only the unambiguous ones (the genuinely vague —
  // "service", "store", "premise", "point_of_interest", "manufacturer"
  // — are deliberately still NOT here, same null-on-vague rule).
  // Health & body → wellness (the taxonomy's health umbrella)
  medical_clinic: "wellness",
  medical_center: "wellness",
  health: "wellness",
  doctor: "wellness",
  dentist: "wellness",
  dental_clinic: "wellness",
  general_hospital: "wellness",
  hospital: "wellness",
  physiotherapist: "wellness",
  chiropractor: "wellness",
  hair_salon: "wellness",
  beauty_salon: "wellness",
  barber_shop: "wellness",
  nail_salon: "wellness",
  massage: "wellness",
  tanning_studio: "wellness",
  // Community → civic
  association_or_organization: "civic",
  non_profit_organization: "civic",
  community_center: "civic",
  // Practical → services
  bank: "services",
  car_repair: "services",
  car_wash: "services",
  laundry: "services",
  // Retail → shopping
  liquor_store: "shopping",
  convenience_store: "shopping",
  discount_store: "shopping",
  electronics_store: "shopping",
  pet_store: "shopping",
  sporting_goods_store: "shopping",
};

/**
 * Our category slug for a Google primaryType, or null when there is
 * no confident mapping (vague/unknown type → keep existing category).
 */
export function categoryFromPrimaryType(
  primaryType: string | undefined | null,
): string | null {
  if (!primaryType) return null;
  return MAP[primaryType.trim().toLowerCase()] ?? null;
}
