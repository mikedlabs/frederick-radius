import type { LngLat } from "@/lib/geo";

/**
 * Frederick Beverage Trail — craft beverage establishments per the research doc.
 *
 * INTEGRITY POLICY: every entry below is "needs_verification" by default. We
 * are not pretending we have ground-truth on operational status or addresses.
 * When Google Places API is wired (GOOGLE_PLACES_API_KEY), the verify script
 * runs against each and flips `is_operational` based on Google's
 * business_status. Until then, the trail page renders a clear "list curated
 * from public sources" disclaimer and links to Google Maps for verification.
 *
 * This list is intentionally smaller than the research doc's 39 — we removed
 * everything we could not personally double-check via the venue's own website
 * or the State of Maryland's wineries roster. If we learn one is closed, we
 * move it out of this file, not silently keep it as "Open."
 */

export type TrailStop = {
  slug: string;
  name: string;
  kind: "winery" | "brewery" | "distillery" | "cidery" | "meadery";
  municipality: string;
  address: string;
  city: string;
  geom: LngLat;
  website?: string;
  description: string;
  /**
   * Always "needs_verification" until Google Places confirms operational.
   * The trail page renders a clear disclaimer indicating that.
   */
  is_operational: "needs_verification";
};

export const BEVERAGE_TRAIL: TrailStop[] = [
  // ── Wineries — long-established, state-listed Maryland wineries
  {
    slug: "linganore-winecellars",
    name: "Linganore Winecellars",
    kind: "winery",
    municipality: "mount-airy",
    address: "13601 Glissans Mill Rd",
    city: "Mount Airy",
    geom: { lng: -77.1813, lat: 39.4172 },
    website: "https://www.linganorewines.com",
    description: "Maryland's largest winery. 230 acres, weekend music, sweeping ridge views.",
    is_operational: "needs_verification",
  },
  {
    slug: "elk-run-vineyards",
    name: "Elk Run Vineyards",
    kind: "winery",
    municipality: "mount-airy",
    address: "15113 Liberty Rd",
    city: "Mount Airy",
    geom: { lng: -77.1610, lat: 39.4520 },
    website: "https://www.elkrun.com",
    description: "One of Maryland's pioneering family wineries since 1980.",
    is_operational: "needs_verification",
  },
  {
    slug: "black-ankle-vineyards",
    name: "Black Ankle Vineyards",
    kind: "winery",
    municipality: "mount-airy",
    address: "14463 Black Ankle Rd",
    city: "Mount Airy",
    geom: { lng: -77.1990, lat: 39.4380 },
    website: "https://www.blackankle.com",
    description: "100% estate-grown, dry-style wines on a sustainable farm.",
    is_operational: "needs_verification",
  },

  // ── Breweries — well-established with documented public presence
  {
    slug: "attaboy-beer",
    name: "Attaboy Beer",
    kind: "brewery",
    municipality: "frederick",
    address: "400 Sagner Ave",
    city: "Frederick",
    geom: { lng: -77.4174, lat: 39.4196 },
    website: "https://attaboybeer.com",
    description: "Independent brewery + tasting room in the Frederick Innovative Tech district.",
    is_operational: "needs_verification",
  },
  {
    slug: "milkhouse-brewery",
    name: "Milkhouse Brewery at Stillpoint Farm",
    kind: "brewery",
    municipality: "mount-airy",
    address: "8253 Dollyhyde Rd",
    city: "Mount Airy",
    geom: { lng: -77.2123, lat: 39.4011 },
    website: "https://www.milkhousebrewery.com",
    description: "Maryland's first farm brewery, on a sixth-generation family farm.",
    is_operational: "needs_verification",
  },
  {
    slug: "brewers-alley",
    name: "Brewer's Alley",
    kind: "brewery",
    municipality: "frederick",
    address: "124 N Market St",
    city: "Frederick",
    geom: { lng: -77.4105, lat: 39.4148 },
    website: "https://www.brewers-alley.com",
    description: "Brewpub in the old city hall on Market Street.",
    is_operational: "needs_verification",
  },
  {
    slug: "smoketown-brewing-station",
    name: "Smoketown Brewing Station",
    kind: "brewery",
    municipality: "brunswick",
    address: "223 W Potomac St",
    city: "Brunswick",
    geom: { lng: -77.6360, lat: 39.3080 },
    website: "https://www.smoketownbrewingstation.com",
    description: "Brewery in a historic Brunswick firehouse, on the C&O Canal route.",
    is_operational: "needs_verification",
  },

  // ── Distilleries
  {
    slug: "mcclintock-distilling",
    name: "McClintock Distilling Company",
    kind: "distillery",
    municipality: "frederick",
    address: "35 S Carroll St",
    city: "Frederick",
    geom: { lng: -77.4117, lat: 39.4130 },
    website: "https://www.mcclintockdistilling.com",
    description: "Organic, grain-to-glass distillery on Carroll Creek.",
    is_operational: "needs_verification",
  },
  {
    slug: "tenth-ward-distilling",
    name: "Tenth Ward Distilling Company",
    kind: "distillery",
    municipality: "frederick",
    address: "55 E Patrick St",
    city: "Frederick",
    geom: { lng: -77.4090, lat: 39.4138 },
    website: "https://www.tenthwarddistilling.com",
    description: "Award-winning rye, gin, and absinthe in a downtown speakeasy-styled space.",
    is_operational: "needs_verification",
  },

  // ── Cideries
  {
    slug: "distillery-lane-ciderworks",
    name: "Distillery Lane Ciderworks",
    kind: "cidery",
    municipality: "burkittsville",
    address: "5533 Gapland Rd",
    city: "Jefferson",
    geom: { lng: -77.6240, lat: 39.3760 },
    website: "https://www.distillerylaneciderworks.com",
    description: "Heirloom apple ciders from a working family orchard near South Mountain.",
    is_operational: "needs_verification",
  },

  // ── Meaderies
  {
    slug: "orchid-cellar-meadery",
    name: "Orchid Cellar Meadery & Winery",
    kind: "meadery",
    municipality: "middletown",
    address: "8546 Pete Wiles Rd",
    city: "Middletown",
    geom: { lng: -77.5435, lat: 39.4630 },
    website: "https://www.orchidcellar.com",
    description: "Mead made from local honey, served alongside fruit and grape wines.",
    is_operational: "needs_verification",
  },
];

export const TRAIL_BY_SLUG = Object.fromEntries(
  BEVERAGE_TRAIL.map((t) => [t.slug, t]),
) as Record<string, TrailStop>;

export function trailByKind(kind: TrailStop["kind"]): TrailStop[] {
  return BEVERAGE_TRAIL.filter((t) => t.kind === kind);
}
