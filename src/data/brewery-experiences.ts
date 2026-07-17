/**
 * Editorial context for the brewery field guide.
 *
 * This is deliberately separate from the beer catalog. A catalog entry is not
 * proof that a taproom is currently open, so this file avoids blanket operating
 * claims and keeps a checked source beside every short piece of context.
 * Brewery names and logos remain the property of their respective owners.
 */

export const BREWERY_SOURCE_CHECKED_AT = "2026-07-16" as const;

export type BreweryScene =
  | "carroll-creek"
  | "city-taprooms"
  | "destination-stops"
  | "farm-country";

export type BreweryFeature =
  | "food"
  | "byo-food"
  | "outdoor"
  | "dog-friendly"
  | "family-friendly"
  | "live-music"
  | "non-beer"
  | "to-go"
  | "downtown";

export type BreweryExperience = {
  slug: string;
  logoSrc: `/images/beer/logos/${string}.jpg`;
  logoSourceUrl: `https://${string}`;
  logoSourceLabel: string;
  scene: BreweryScene;
  story: string;
  traits: readonly string[];
  /** Only source-checked visit-planning attributes belong here. This powers
   * the taproom board; an omitted feature means "not confirmed", not "no". */
  features: readonly BreweryFeature[];
  sourceUrl: `https://${string}`;
  /** Brewery-controlled or venue-controlled current beer menu. Optional: a
   * missing link is more honest than sending someone to a stale archive. */
  tapListUrl?: `https://${string}`;
  checkedAt: typeof BREWERY_SOURCE_CHECKED_AT;
  statusNote?: string;
};

export type BrewerySceneMeta = {
  label: string;
  description: string;
};

export const BREWERY_SCENE_META: Readonly<
  Record<BreweryScene, BrewerySceneMeta>
> = {
  "carroll-creek": {
    label: "Carroll Creek",
    description: "Creekside rooms close enough to make the setting part of the stop.",
  },
  "city-taprooms": {
    label: "City taprooms",
    description: "Distinct Frederick beer rooms, from a downtown brewpub to small-batch projects.",
  },
  "destination-stops": {
    label: "Destination stops",
    description: "Stops worth building into a longer Frederick County outing.",
  },
  "farm-country": {
    label: "Farm country",
    description: "Barns, fields, estates, and views beyond the center of town.",
  },
};

const VISIT_FREDERICK_BREWERIES =
  "https://www.visitfrederick.org/eat-drink/wine-beer-spirits/breweries/" as const;
const UNTAPPD_LOGO_SOURCE = "Untappd brewery profile";

export const BREWERY_EXPERIENCES: readonly BreweryExperience[] = [
  {
    slug: "olde-mother-brewing-frederick",
    logoSrc: "/images/beer/logos/olde-mother-brewing-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos/brewery-118447_67040.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "A downtown brewery whose house catalog moves from crisp lagers to hop-forward and dark beer.",
    traits: ["downtown", "varied beer styles"],
    features: ["downtown", "live-music"],
    sourceUrl: "https://oldemother.com/",
    tapListUrl: "https://oldemother.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "attaboy-beer-frederick",
    logoSrc: "/images/beer/logos/attaboy-beer-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-322120_22ffc_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "carroll-creek",
    story: "A creekside-adjacent brewery with a garden and a regular food-truck setup.",
    traits: ["Carroll Creek", "beer garden", "food trucks"],
    features: ["food", "outdoor", "dog-friendly", "non-beer"],
    sourceUrl: "https://www.attaboybeer.com/",
    tapListUrl: "https://www.attaboybeer.com/on-tap",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "steinhardt-brewing-company-frederick",
    logoSrc: "/images/beer/logos/steinhardt-brewing-company-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-191760_07c57_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "carroll-creek",
    story: "A Carroll Creek brewery associated with Belgian-inspired beer and the Union Mills building.",
    traits: ["Carroll Creek", "Belgian-inspired beer"],
    features: ["food", "outdoor", "dog-friendly", "non-beer"],
    sourceUrl: "https://www.steinhardtbrewing.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "rockwell-brewery-frederick",
    logoSrc: "/images/beer/logos/rockwell-brewery-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-328472_ce93f_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "destination-stops",
    story: "A Frederick brewery with a broad catalog and a taproom identified by the brewery as Riverside.",
    traits: ["Riverside taproom", "varied beer styles"],
    features: ["food", "live-music", "non-beer"],
    sourceUrl: "https://www.rockwellbrewery.com/",
    tapListUrl: "https://www.rockwellbrewery.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "monocacy-brewing-frederick",
    logoSrc: "/images/beer/logos/monocacy-brewing-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos/brewery-30322_d9062.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "A Frederick brewery housed in a former ice-cream plant, with a broad house-beer catalog.",
    traits: ["historic industrial setting", "varied beer styles"],
    features: ["food"],
    sourceUrl: "https://monocacybrewing.com/",
    tapListUrl: "https://untappd.com/v/monocacy-brewing/342895",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "brewers-alley-frederick",
    logoSrc: "/images/beer/logos/brewers-alley-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos/brewery-brewersalley_2413.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "The downtown brewpub revived Frederick's historic Brewer's Alley name in 1996.",
    traits: ["downtown", "brewpub", "food on site"],
    features: ["food", "downtown"],
    sourceUrl: "https://brewers-alley.com/",
    tapListUrl: "https://brewers-alley.com/brewhouse/our-beer/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "sandbox-brewhouse-frederick",
    logoSrc: "/images/beer/logos/sandbox-brewhouse-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-573114_358d7_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "A small-batch Frederick brewhouse with a rotating, experimental catalog.",
    traits: ["small-batch beer", "rotating lineup"],
    features: ["outdoor", "dog-friendly", "family-friendly", "live-music", "non-beer"],
    sourceUrl: "https://www.sandboxbrewhouse.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "rak-brewing-co-frederick",
    logoSrc: "/images/beer/logos/rak-brewing-co-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-552081_9f7d9_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "carroll-creek",
    story: "A Carroll Creek brewery whose name and identity center on Random Acts of Kindness.",
    traits: ["Carroll Creek", "community-minded identity"],
    features: ["food", "live-music", "non-beer"],
    sourceUrl: "https://www.rakbrewing.com/",
    tapListUrl: "https://www.rakbrewing.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "smoketown-brewing-brunswick",
    logoSrc: "/images/beer/logos/smoketown-brewing-brunswick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos/brewery-233317_29740.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "destination-stops",
    story: "A Brunswick brewery associated with a restored 1948 fire station.",
    traits: ["Brunswick", "historic fire-station setting"],
    features: ["food", "outdoor", "dog-friendly", "family-friendly", "live-music", "non-beer"],
    sourceUrl: "https://www.smoketownbrewing.com/",
    tapListUrl: "https://www.smoketownbrewing.com/menu?menu=good-eats",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "midnight-run-brewing",
    logoSrc: "/images/beer/logos/midnight-run-brewing.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-51493_09901_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "A Frederick brewery whose catalog spans hop-forward beer, Belgian styles, and dark ales.",
    traits: ["hop-forward beer", "Belgian-style beer"],
    features: ["byo-food", "dog-friendly", "to-go"],
    sourceUrl: "https://www.midnightrunbrewing.com/",
    tapListUrl: "https://docs.google.com/document/d/1RyA3lCrP632aZ0JP767C9Pfku9gIQa2Onij6qAmjmO4/edit",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "prospect-point-brewing-frederick",
    logoSrc: "/images/beer/logos/prospect-point-brewing-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-430856_a0516_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "farm-country",
    story: "A farm brewery west of the city with outdoor space and views toward the Catoctins.",
    traits: ["farm setting", "outdoor space", "Catoctin views"],
    features: ["food", "outdoor", "dog-friendly", "family-friendly", "live-music"],
    sourceUrl: "https://www.prospectpointbrewing.com/",
    tapListUrl: "https://www.prospectpointbrewing.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "brudr-bier-co-frederick",
    logoSrc: "/images/beer/logos/brudr-bier-co-frederick.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-575990_67911_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "city-taprooms",
    story: "A Frederick beer project centered on German-style lagers and ales.",
    traits: ["German-style beer"],
    features: [],
    sourceUrl: "https://untappd.com/w/bra-dr-bier-co/575990",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
    statusNote: "A current taproom location and public access could not be confirmed from a primary source. Check before planning a visit.",
  },
  {
    slug: "springfield-manor-thurmont",
    logoSrc: "/images/beer/logos/springfield-manor-thurmont.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-359313_70ee7_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "farm-country",
    story: "A Thurmont estate where brewery, winery, and distillery offerings share one destination.",
    traits: ["estate setting", "beer, wine, and spirits"],
    features: ["outdoor", "non-beer"],
    sourceUrl: VISIT_FREDERICK_BREWERIES,
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "freys-farm-mount-airy",
    logoSrc: "/images/beer/logos/freys-farm-mount-airy.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-33289_8c688_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "farm-country",
    story: "A Mount Airy farm brewery pouring from a historic bank-barn setting.",
    traits: ["working farm", "historic bank barn"],
    features: ["outdoor"],
    sourceUrl: "https://freys.farm/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "liquidity-aleworks-mount-airy",
    logoSrc: "/images/beer/logos/liquidity-aleworks-mount-airy.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-524847_f25cb_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "destination-stops",
    story: "A Mount Airy beer stop with a catalog spanning crisp lagers, IPAs, and darker ales.",
    traits: ["Mount Airy", "varied beer styles"],
    features: ["dog-friendly", "family-friendly"],
    sourceUrl: "https://www.liquidityaleworks.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "milkhouse-brewery-mt-airy",
    logoSrc: "/images/beer/logos/milkhouse-brewery-mt-airy.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos_hd/brewery-58251_593a3_hd.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "farm-country",
    story: "A farm brewery at Stillpoint Farm, tied closely to its own fields and hopyard.",
    traits: ["working farm", "farm brewery", "hopyard"],
    features: ["food", "byo-food", "outdoor", "dog-friendly", "family-friendly", "live-music", "non-beer", "to-go"],
    sourceUrl: "https://www.milkhousebrewery.com/faqs/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
  },
  {
    slug: "red-shedman-farm-brewery-and-hop-yard-mount-airy",
    logoSrc: "/images/beer/logos/red-shedman-farm-brewery-and-hop-yard-mount-airy.jpg",
    logoSourceUrl: "https://assets.untappd.com/site/brewery_logos/brewery-163561_6f1df.jpeg",
    logoSourceLabel: UNTAPPD_LOGO_SOURCE,
    scene: "farm-country",
    story: "A Mount Airy farm-brewery identity built around its hop-yard setting.",
    traits: ["farm setting", "hop yard"],
    features: [],
    sourceUrl: "https://redshedman.com/",
    checkedAt: BREWERY_SOURCE_CHECKED_AT,
    statusNote: "Current directory coverage and access details are inconsistent. Check the brewery directly before visiting.",
  },
] as const;

export const BREWERY_EXPERIENCE_BY_SLUG: Readonly<
  Record<string, BreweryExperience>
> = Object.fromEntries(
  BREWERY_EXPERIENCES.map((experience) => [experience.slug, experience]),
);
