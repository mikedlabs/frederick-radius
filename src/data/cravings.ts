/**
 * Cravings — the "I want ___ right now" vocabulary.
 *
 * The simplest possible intent: a person standing on the sidewalk says one
 * noun ("ice cream", "coffee") and wants the nearest OPEN one, now. These
 * are NOT the full category taxonomy — they're the handful of in-the-moment
 * wants worth a one-tap answer, each mapped to a matcher (a category, or a
 * name pattern when the catalog has no clean category, e.g. ice cream lives
 * under `restaurant`). Pure + client-safe: no loader, no server imports.
 */

export type CravingMatchable = {
  category: string;
  name: string;
  subcategories?: string[];
  /** Source-backed catalog fields used by shared evidence matchers. */
  primary_type?: string;
  short_blurb?: string;
};

/** A sub-filter within a craving's results — "find more specific things"
 *  (Food → Pizza / Food trucks, Parks → Trails / Playgrounds). Each narrows
 *  the already-matched set; the chip row only renders when a craving defines
 *  them, so single-answer cravings (Coffee, Grocery) stay clean. */
export type CravingFacet = {
  key: string;
  label: string;
  match: (p: CravingMatchable) => boolean;
};

export type Craving = {
  key: string;
  /** Verb-free noun the way a person says it walking down the street. */
  label: string;
  /** lucide icon name — resolved by the tile via a small map (keeps this
   *  data file free of React imports). */
  icon:
    | "Coffee"
    | "IceCream"
    | "Utensils"
    | "Cookie"
    | "Beer"
    | "Trees"
    | "ShoppingBag"
    | "ShoppingCart"
    | "Palette"
    | "Music"
    | "FerrisWheel"
    | "Wine"
    | "BedDouble"
    | "Sparkles"
    | "Flag"
    | "Tractor"
    | "Film"
    | "Waves"
    | "Scissors"
    | "Martini"
    | "Grape";
  /** Category token used only for the tile tint, reusing the palette the
   *  rest of the app already keys off. */
  color: string;
  match: (p: CravingMatchable) => boolean;
  /** Optional sub-filters surfaced as chips on the results page. */
  facets?: CravingFacet[];
  /** When true, the results page derives its sub-filter chips DYNAMICALLY from
   *  the cuisines actually present in the matched set (Mexican, Asian, BBQ,
   *  Seafood, …) instead of a fixed `facets` list — so Food can be narrowed by
   *  what's really nearby. Mutually exclusive with `facets`. */
  cuisineFacets?: boolean;
  /** This category is always AVAILABLE (e.g. lodging) — "open now" doesn't
   *  apply, so the open-now gate must never hide it. Without this, a hotel
   *  with no verified front-desk hours (open_status unknown) gets filtered
   *  out of the open-only Stay view entirely. */
  alwaysOpen?: boolean;
  /** How verified hours influence an answer for this kind of place. */
  availability?: "required" | "bonus" | "not-applicable";
};

// Brand names with no descriptor (Dairy Queen / DQ) are matched explicitly —
// "Queen"/"Treat" alone would false-positive, so only the full brand + the \bdq\b
// word-boundary token are added.
const ICE_CREAM = /ice ?cream|creamery|gelato|scoop|frozen custard|froyo|frozen yogurt|soft serve|dairy ?queen|\bdq\b/i;
const PIZZA = /pizza|pizzeria/i;
const PLAYGROUND_EVIDENCE = /\bplaygrounds?\b|\btot[\s-]?lots?\b/i;

/**
 * Canonical pizza evidence — ONE matcher for every pizza entry point
 * (/category/pizza, the Today "cat:pizza" want answer, the map's
 * Eat & drink → Pizza facet). Google's primary_type files most of the
 * county's pizzerias under plain "restaurant" or "italian_restaurant"
 * (Rocky's Pizza, Tuscany's Pizzeria, Pasquale's Italian Pizza) and Pizza
 * Hut under "pizza_delivery", so strict category matching alone hid about
 * a quarter of the catalog's actual pizza places (owner report, Jul 2026).
 * Evidence accepted, all of it real fields: the corrected category, a
 * curated "pizza" subcategory (places-overrides.json), a pizza/pizzeria
 * NAME, or a pizza_* Google type. Deliberately NO blurb sniffing — a
 * restaurant whose description merely mentions pizza is not a pizzeria.
 */
export function isPizzaPlace(p: {
  category: string;
  name: string;
  subcategories?: string[];
  primary_type?: string;
}): boolean {
  return (
    p.category === "pizza" ||
    (p.subcategories ?? []).includes("pizza") ||
    PIZZA.test(p.name) ||
    (p.primary_type ?? "").startsWith("pizza_")
  );
}

/**
 * Canonical playground evidence.
 *
 * Most playgrounds in the catalog are parent parks rather than standalone
 * `playground` rows. Their official/source-backed summary is often the only
 * structured evidence we have ("...a playground..." or "...tot lot...").
 * Keep this deliberately narrow: category, curated subcategory, Google type,
 * name, or the source-backed short blurb. Generic park/kid tags and free-form
 * descriptions do not qualify.
 */
export function isPlaygroundPlace(p: {
  category: string;
  name: string;
  subcategories?: string[];
  primary_type?: string;
  short_blurb?: string;
}): boolean {
  const primaryType = (p.primary_type ?? "").toLowerCase();
  return (
    p.category === "playground" ||
    (p.subcategories ?? []).includes("playground") ||
    primaryType === "playground" ||
    primaryType.startsWith("playground_") ||
    PLAYGROUND_EVIDENCE.test(p.name) ||
    PLAYGROUND_EVIDENCE.test(p.short_blurb ?? "")
  );
}
const GROCERY = /grocer|supermarket|safeway|giant\b|weis|aldi|lidl|food lion|mom.?s organic|wegmans|harris teeter|common market|costco|h\s*mart|megamart|mega ?mart/i;
// Family fun is matched by ACTIVITY name, not the `family` category — that
// category is a junk bucket (mostly schools, daycares, PTAs, a driving school,
// art studios). We want the genuinely-fun outings: arcades, escape rooms,
// bowling, mini golf, the zoo, the science lab, skate parks. Scanned across ALL
// categories so a fun spot miscategorized elsewhere (a skatepark filed under
// "park") still surfaces.
const FAMILY_FUN =
  /\b(arcade|pinball|escape room|escape this|mini ?golf|miniature golf|bowling|lanes\b|zoo|petting (zoo|farm)|wildlife preserve|aquarium|trampoline|tramp ?park|go.?kart|go.?cart|laser ?tag|skating|skate ?park|roller ?rink|ice ?rink|adventure park|fun ?(center|land|zone)|amusement|water ?park|splash ?pad|spray ?(ground|park)|carousel|science (center|lab)|discovery (center|museum)|children.?s museum|paintball|axe ?throwing|putt|raceway|speedway|pottery|paint.?your.?own|ceramics|climbing|bouldering|gymnastics|tumbling|jump\b|bounce|indoor play|play ?(cafe|place|zone))\b/i;
// Exclude the schooling/childcare/medical/admin noise the `family` bucket is
// full of — "Escape This" is fun, "Gregs Driving School" and "Kids Care
// Pediatrics" are not. (Medical terms added so broadening the fun matcher above
// with kid words can't pull in a pediatrics/dental/therapy practice.)
const FAMILY_FUN_JUNK =
  /\b(school|elementary|middle|high school|academy|universit|college|early learning|daycare|day care|preschool|pre-?k|\bpta\b|admission|montessori|children.?s center|learning center|recovery|church|ministry|driving|pediatric|dental|orthodont|clinic|medical|therapy|hospital)\b/i;
// Wineries / vineyards / cideries / meaderies — matched by PRODUCTION terms
// (the county's ~15 are filed under "brewery"), NOT bare "wine" which would
// catch wine shops, wine bars, and beer-&-wine convenience stores.
const WINERY = /\b(winery|wineries|vineyard|vineyards|winecellars|cider|cidery|meadery)\b/i;
// Retail bottle shops — liquor / wine & spirits / beer & wine stores (a "buy a
// bottle" intent, distinct from bars/breweries/wineries you drink AT). Telltale
// names, so name-matched; production venues are excluded by category + WINERY.
const LIQUOR = /\b(liquors?|spirits|package store|wine ?(&|and) ?spirits|beer ?(&|and) ?wine|bottle shop|wine ?shop)\b/i;
// Movie theaters (cinemas) — distinct from the performing-arts "theater"
// category they're filed under. Name-matched: the county's are Warehouse
// Cinemas + Regal Westview.
const MOVIES = /\b(cinemas?|cineplex|imax|movie ?theat(er|re)?|drive.?in theat|regal westview)\b/i;
// Public pools / swimming (mostly filed under wellness/playground). Excludes
// pool halls, billiards, whirlpools.
const POOL = /\b(swimming pool|swim club|aquatic|community pool|municipal pool|natatorium|\bpool\b)\b/i;
const POOL_JUNK = /\b(hall|billiard|table|car ?pool|whirlpool|gene pool|consulting|supply|supplies|service)\b/i;
// Salons / barbers / nail shops — the grooming intent (filed under "services"),
// distinct from the wellness self-care set.
const SALON = /\b(salon|barber|barbershop|nails?|nail bar|blow ?dry|blowout)\b/i;
// Wellness DESTINATIONS — yoga, spa, massage, fitness, the self-care set — NOT
// the medical/clinical practices the "wellness" category is bloated with (it
// holds ~150 dialysis/sleep/dental/psychotherapy/MD entries). Matched by name
// across categories (a yoga studio filed under "yoga" or a salon-spa under
// "services" still surfaces), then the CLINICAL gate strips out the medical
// practices that merely share a "wellness/holistic/therapy" word. Tested
// against the live dataset: yields ~84 genuine destinations, zero clinics.
const WELLNESS =
  /\b(yoga|pilates|barre|day ?spa|med ?spa|medspa|spa\b|massage|bodywork|crossfit|cross ?fit|gym\b|fitness|spin studio|cyclebar|cycle bar|sauna|cryo|float (spa|center|therapy|studio|tank)|aesthetic|esthetic|skincare|skin care|tanning|reiki|acupunctur|chiropract|martial arts|taekwondo|jiu.?jitsu|karate|kickbox|dance (studio|academy|center|company)|wellness|holistic|meditation|sound bath|kettlebell)\b/i;
const WELLNESS_CLINICAL =
  /\b(physician|dentist|dental|orthodont|endodont|psychiatr|psycholog|psychotherap|counsel|behavioral|physical therap|occupational therap|speech therap|dialysis|sleep (disorder|center|medicine)|cancer|oncolog|primary care|urgent care|hospital|surgery|surgical|rehab|addiction|recovery center|nurse practitioner|crnp|family medicine|internal medicine|pediatric|cardiolog|dermatolog|nephrolog|neurolog|urolog|radiolog|imaging center|infusion|diagnostic|medical (center|group|associates|clinic)|health (system|partners|services)|veterinar|nursing|hospice|family nurse)/i;

// Order = intent strength, not raw inventory. Food leads (the single most
// universal "I want," ~210 places); then the going-out wants (Coffee, Drinks),
// the treats (Sweets, Ice cream), Parks, then Live music pulled up next to the
// outdoors/culture cluster (it's a distinctive county draw, not a basement
// afterthought), then the errand + culture tail. Happy hour is prepended and
// "More…" appended in CravingStrip, so this is the middle of that grid.
export const CRAVINGS: Craving[] = [
  {
    key: "food",
    label: "Food",
    icon: "Utensils",
    color: "var(--app-accent)",
    // Pizza folded in — a pizzeria is still "I want food," so it's not its
    // own tile; Food answers it via the canonical pizza matcher.
    match: (p) =>
      p.category === "restaurant" ||
      p.category === "food-truck" ||
      isPizzaPlace(p),
    // Food narrows by CUISINE, derived from what's actually nearby (Mexican,
    // Asian, BBQ, Seafood, Pizza, Burgers, …) — far richer than a fixed
    // sit-down/pizza/truck split, and it pulls from the whole county.
    cuisineFacets: true,
  },
  {
    key: "coffee",
    label: "Coffee",
    icon: "Coffee",
    color: "var(--app-brand)",
    match: (p) => p.category === "coffee",
  },
  {
    key: "drinks",
    label: "Drinks",
    // Martini, not Beer: Drinks (bars/cocktails/distilleries) shared the
    // beer mug with the Breweries tile — two different doors, one icon.
    icon: "Martini",
    color: "var(--app-positive)",
    match: (p) => p.category === "bar" || p.category === "brewery" || p.category === "distillery",
    facets: [
      { key: "brewery", label: "Breweries", match: (p) => p.category === "brewery" },
      { key: "bar", label: "Bars", match: (p) => p.category === "bar" },
      // Distilleries split out of "brewery" into their own category — surface
      // them here so the craft-spirits scene (8 places) isn't stranded.
      { key: "distillery", label: "Distilleries", match: (p) => p.category === "distillery" },
    ],
  },
  {
    // Frederick is wine country — the Wine Trail's vineyards, cideries + a
    // meadery (Linganore, Black Ankle, Loew, Elk Run, Springfield Manor,
    // Catoctin Breeze, Orchid Cellar, Willow Oaks Cider…). Now their own
    // `winery` category (split out of "brewery"); the name test stays as a
    // fallback for any straggler still mis-filed under brewery.
    key: "wineries",
    label: "Wineries",
    // Grape, not Wine: Wineries shared the glass with the Wine & liquor
    // shop tile.
    icon: "Grape",
    color: "var(--app-brand-press)",
    match: (p) => p.category === "winery" || WINERY.test(p.name),
  },
  {
    // Beer breweries — the county's taprooms (Brewer's Alley, Monocacy,
    // Attaboy, Rockwell, Olde Mother, Smoketown, Milkhouse, Sandbox…). Filed
    // under the "brewery" category in the data; we exclude the WINERY name
    // matches because cideries / vineyards / meaderies also live under
    // "brewery" but have their own Wineries tile. A dedicated one-tap door
    // distinct from the broad "Drinks" tile (which still spans bars + brewery).
    key: "breweries",
    label: "Breweries",
    icon: "Beer",
    color: "var(--app-brand-2)",
    match: (p) => p.category === "brewery" && !WINERY.test(p.name),
  },
  {
    // Retail bottle shops — "I want to BUY a bottle", distinct from the bars and
    // breweries you drink at. Name-matched (telltale names), with production
    // venues excluded so a winery/brewery/distillery never lands here.
    key: "liquor",
    label: "Wine & liquor",
    icon: "Wine",
    color: "var(--app-brand-press)",
    match: (p) =>
      LIQUOR.test(p.name) &&
      !WINERY.test(p.name) &&
      p.category !== "winery" &&
      p.category !== "brewery" &&
      p.category !== "distillery",
  },
  {
    key: "ice-cream",
    label: "Ice cream",
    icon: "IceCream",
    color: "var(--app-cool)",
    // Name-matched, but never an outdoors place: "Creamery Park" contains
    // "creamery" yet is a park, not dessert. Ice cream is a food/treat venue.
    match: (p) =>
      p.category === "ice-cream" ||
      (ICE_CREAM.test(p.name) &&
        p.category !== "park" &&
        p.category !== "trail" &&
        p.category !== "playground" &&
        p.category !== "outdoors"),
  },
  {
    key: "outside",
    label: "Parks",
    icon: "Trees",
    color: "var(--app-positive)",
    availability: "not-applicable",
    match: (p) =>
      p.category === "park" ||
      p.category === "trail" ||
      p.category === "playground" ||
      p.category === "outdoors",
    facets: [
      { key: "park", label: "Parks", match: (p) => p.category === "park" },
      { key: "trail", label: "Trails", match: (p) => p.category === "trail" || p.category === "outdoors" },
      { key: "playground", label: "Playgrounds", match: isPlaygroundPlace },
      { key: "dog", label: "Dog parks", match: (p) => /\b(dog park|bark park)\b/i.test(p.name) },
    ],
  },
  {
    // The county's public + championship + country-club courses (Whiskey Creek,
    // Maryland National, Musket Ridge, Worthington Manor, Clustered Spires,
    // Holly Hills, Maple Run). Golf was invisible in browse until now —
    // reachable only by direct URL or search. Its own one-tap door.
    key: "golf",
    label: "Golf",
    icon: "Flag",
    color: "var(--app-brand-2)",
    availability: "bonus",
    match: (p) => p.category === "golf",
  },
  {
    // Frederick is farm country — orchards, pick-your-own, farm stands,
    // creameries, corn mazes, petting farms. A seasonal day-out that was
    // scattered across market/family/restaurant until the agritourism category.
    key: "farms",
    label: "Farms & PYO",
    icon: "Tractor",
    color: "var(--app-positive)",
    availability: "bonus",
    match: (p) => p.category === "agritourism",
  },
  {
    // The formal music halls + stages (Weinberg, Sky Stage, New Spire, the
    // amphitheater). The brewery/bar live-music venues are categorized by
    // what they sell, so they answer via Drinks + the events feed, not here
    // — but "I want live music" deserves its own one-tap door given the
    // county's stages. ~24 places in the `music` category.
    key: "music",
    label: "Live music",
    icon: "Music",
    color: "var(--app-accent)",
    availability: "bonus",
    match: (p) =>
      p.category === "music" ||
      /\bamphitheat(er|re)|music hall|sky stage|bandshell\b/i.test(p.name),
  },
  {
    // ~299 places (shopping 225 + market 61 + book-store 13) — the biggest
    // answerable cluster after the non-craving worship/wellness. Mirrors the
    // map's WithinReach "Shops" matcher so /today and /map never disagree.
    key: "shops",
    label: "Shops",
    icon: "ShoppingBag",
    color: "var(--app-cool)",
    match: (p) =>
      p.category === "shopping" ||
      p.category === "market" ||
      p.category === "book-store",
    facets: [
      { key: "shopping", label: "Shops", match: (p) => p.category === "shopping" },
      // Thrift / vintage / consignment (incl. the few "antiques" rows) — a real
      // local draw otherwise buried in the 200-place shopping bucket.
      { key: "thrift", label: "Thrift & vintage", match: (p) => p.category === "antiques" || /\b(thrift|vintage|consignment|retro|resale|second.?hand)\b/i.test(p.name) },
      // Home & décor / furniture / candles.
      { key: "home", label: "Home & décor", match: (p) => p.category === "shopping" && /\b(home|d[eé]cor|furniture|furnishing|candle|interiors?)\b/i.test(p.name) },
      { key: "market", label: "Markets", match: (p) => p.category === "market" },
      { key: "book-store", label: "Books", match: (p) => p.category === "book-store" },
    ],
  },
  {
    // Grocery stores by name (Common Market, Weis, Safeway, MOM's, Food
    // Lion, Giant, Aldi, Lidl) — distinct from Shops' broad market/retail.
    key: "grocery",
    label: "Grocery",
    icon: "ShoppingCart",
    color: "var(--app-positive)",
    // Curated multi-role markets can carry `grocery` as an additional
    // category even when their public name is simply "Trout's Market" or
    // "Jubilee Foods" and does not hit the national-chain name regex.
    match: (p) => p.category === "grocery" || GROCERY.test(p.name),
  },
  {
    // ~64 places (gallery 31 + museum 20 + theater 13). Plum token (not
    // WithinReach's raw hex) and distinct from food's accent + shops' cool.
    key: "art",
    label: "Art",
    icon: "Palette",
    color: "var(--app-accent)",
    availability: "bonus",
    match: (p) =>
      p.category === "gallery" ||
      p.category === "museum" ||
      p.category === "theater",
    facets: [
      { key: "gallery", label: "Galleries", match: (p) => p.category === "gallery" },
      { key: "museum", label: "Museums", match: (p) => p.category === "museum" },
      { key: "theater", label: "Theaters", match: (p) => p.category === "theater" },
    ],
  },
  {
    // Genuinely fun family outings — comprehensive across the county, surfaced
    // two ways: (1) the curated `family-fun` subcategory TAG (the verified
    // venues we add — trampoline parks, climbing, the ice rink, fun centers,
    // the petting farm, escape rooms, pottery studios, skate parks…); (2) an
    // activity-NAME match (arcades, bowling, mini golf, the zoo, the science
    // lab). NOT the raw `family` category (a junk bucket of schools/daycares)
    // and NOT every `playground` row (the data has generic "Playground" OSM
    // dots) — both are filtered out, so the tab stays real fun, not noise.
    key: "family",
    label: "Family fun",
    icon: "FerrisWheel",
    color: "var(--app-cool)",
    availability: "bonus",
    match: (p) =>
      Boolean(p.subcategories?.includes("family-fun")) ||
      (FAMILY_FUN.test(p.name) && !FAMILY_FUN_JUNK.test(p.name)),
  },
  {
    // Movie theaters (cinemas) — a top "what to do tonight" intent that was
    // buried inside the performing-arts "theater" category.
    key: "movies",
    label: "Movies",
    icon: "Film",
    color: "var(--app-accent)",
    availability: "not-applicable",
    match: (p) => MOVIES.test(p.name),
  },
  {
    // Public pools + swimming — a summer staple, scattered across wellness /
    // playground; name-matched across categories, pool halls excluded.
    key: "pools",
    // "Pools & swimming" clipped to "Pools & swimmi…" in the compact
    // picker cell; one word says the same thing.
    label: "Pools",
    icon: "Waves",
    color: "var(--app-cool)",
    availability: "bonus",
    match: (p) => POOL.test(p.name) && !POOL_JUNK.test(p.name),
  },
  {
    // Salons, barbers, nail shops — the grooming intent (filed under
    // "services"), distinct from the wellness self-care set.
    key: "salon",
    label: "Salons & barbers",
    icon: "Scissors",
    color: "var(--app-brand-2)",
    match: (p) => SALON.test(p.name),
  },
  {
    // Wellness DESTINATIONS — yoga, spa, massage, fitness, martial arts, the
    // self-care set. Matched by name across categories with the clinical gate,
    // so a tap never surfaces a dialysis center, dentist, or psychotherapy
    // practice from the over-broad "wellness" category bucket.
    key: "wellness",
    label: "Wellness",
    icon: "Sparkles",
    color: "var(--app-brand-2)",
    match: (p) => WELLNESS.test(p.name) && !WELLNESS_CLINICAL.test(p.name),
    // Narrow the broad wellness answer to what people actually search for.
    // Name-based (studios live under both the `yoga` and `wellness`
    // categories, so a category filter would miss half); `\bbarre\b` can't
    // catch "barrel" (a distillery), which the boundary guards.
    facets: [
      { key: "yoga", label: "Yoga & Pilates", match: (p) => /\b(yoga|pilates|barre|reformer)\b/i.test(p.name) },
      { key: "spa", label: "Spa & massage", match: (p) => /\b(spa|massage|bodywork|facial|skincare|skin care|sauna|float|cryo|reiki|sound bath|medspa|med ?spa|day ?spa|aesthetic|esthetic)\b/i.test(p.name) },
      { key: "gym", label: "Gym & fitness", match: (p) => /\b(gym|fitness|crossfit|cross ?fit|cyclebar|cycle bar|spin studio|kettlebell|hotworx|f45|orangetheory|martial arts|kickbox|jiu.?jitsu|karate|taekwondo)\b/i.test(p.name) },
    ],
  },
  {
    // Lodging — the county's hotels, inns, and B&Bs (37 places). For a
    // visitor deciding where to stay the night, or a local booking a room
    // for out-of-town guests.
    key: "stay",
    label: "Stay",
    icon: "BedDouble",
    color: "var(--app-cool)",
    availability: "not-applicable",
    match: (p) => p.category === "lodging",
    // A hotel/inn is always available to book — "open now" is the wrong gate,
    // and most lodging carries no verified front-desk hours. Treat lodging as
    // always available so a no-hours hotel (e.g. the Visitation Hotel) is never
    // hidden from the open-only Stay view.
    alwaysOpen: true,
  },
];

export const CRAVING_BY_KEY: Record<string, Craving> = Object.fromEntries(
  CRAVINGS.map((c) => [c.key, c]),
);

/** Corrected primary category plus every additional taxonomy tag. A place may
 * legitimately answer more than one intent (restaurant + coffee, market +
 * grocery); forcing one primary bucket was the source of Today/Nearby drift. */
function categoryViews(p: CravingMatchable): CravingMatchable[] {
  const categories = [...new Set([p.category, ...(p.subcategories ?? [])].filter(Boolean))];
  return categories.map((category) => ({ ...p, category }));
}

/** Canonical craving eligibility used by Today, Nearby, Ask, and Search. */
export function matchesCraving(craving: Craving, p: CravingMatchable): boolean {
  return categoryViews(p).some((view) => craving.match(view));
}

/** Canonical facet eligibility over the same multi-category views. */
export function matchesCravingFacet(facet: CravingFacet, p: CravingMatchable): boolean {
  return categoryViews(p).some((view) => facet.match(view));
}

export type Moment = {
  /** Eastern-clock hour, 0–23. */
  hour: number;
  weekend: boolean;
  /** Rain/storm in the current-hour forecast — pulls indoor wants up, Parks down. */
  wet: boolean;
};

/**
 * Reorder the cravings for the moment, so the fast lane LEADS with what a
 * person most likely wants right now — the same instinct the meal tile already
 * follows, applied to the whole grid. Coffee in the morning, drinks + live
 * music in the evening, Parks/Family fun/Art on a weekend; when it's wet,
 * indoor wants rise and Parks sinks. A pure, deterministic re-sort of the SAME
 * set (nothing added or hidden) — the base intent order from CRAVINGS breaks
 * ties via a stable sort, so a quiet hour still reads as the canonical grid.
 */
export function orderCravingsForMoment(cravings: Craving[], { hour, weekend, wet }: Moment): Craving[] {
  const morning = hour >= 5 && hour < 11;
  const midday = hour >= 11 && hour < 16;
  const evening = hour >= 16 && hour < 22;
  const late = hour >= 22 || hour < 5;
  const boost = (key: string): number => {
    let b = 0;
    if (morning && key === "coffee") b += 3;
    if (midday && key === "food") b += 3;
    if (midday && key === "coffee") b += 1;
    if (evening && (key === "drinks" || key === "breweries" || key === "music")) b += 3;
    if (evening && (key === "food" || key === "ice-cream")) b += 1;
    if (late && (key === "drinks" || key === "food")) b += 2;
    if (weekend && (key === "outside" || key === "family" || key === "art" || key === "music" || key === "wineries")) b += 2;
    if (wet) {
      if (key === "outside") b -= 4;
      if (["coffee", "food", "art", "family", "breweries", "drinks"].includes(key)) b += 2;
    }
    return b;
  };
  return cravings
    .map((c, i) => ({ c, i, b: boost(c.key) }))
    .sort((x, y) => y.b - x.b || x.i - y.i)
    .map((x) => x.c);
}

/** True if a place is eligible for ANY craving — used server-side to slim
 *  the /now payload to just the craving-answering places. */
export function isCravingPlace(p: CravingMatchable): boolean {
  return CRAVINGS.some((c) => matchesCraving(c, p));
}
