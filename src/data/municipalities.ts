import type { LngLat } from "@/lib/geo";

// Classifications follow the county's own municipal list
// (frederickcountymd.gov/1211, re-checked 2026-07-13): ONE city (Frederick,
// the county seat), ten towns, and ONE village, Rosemont, whose incorporated
// name is "Village of Rosemont" (1953). Note the wrinkle on Brunswick: the
// Maryland State Archives and Wikipedia style it a "city" (it incorporated in
// 1890), but Maryland law doesn't legally distinguish the classes, and both
// the county's list AND local usage treat Frederick as the only city, so we
// mirror that (its own blurb already reads "railroad town"). Burkittsville is
// styled a town (its charter name), even though everyone calls it a village.
export type MunicipalityType = "city" | "town" | "village" | "unincorporated";

export type Municipality = {
  slug: string;
  name: string;
  type: MunicipalityType;
  /** 2020 decennial census count (Urbana: CDP figure). Surfaces render
   *  the raw number with no year, so keep these on the one dated,
   *  defensible source rather than mixing in drifting estimates. */
  population: number;
  centroid: LngLat;
  bbox: [number, number, number, number];
  description: string;
  hero_blurb: string;
  /** One punchy, true line — the town's claim to fame. Distilled from
   *  `description`; kept short enough to ride a town card. */
  fact: string;
  est: number;
};

export const MUNICIPALITIES: Municipality[] = [
  {
    slug: "frederick",
    name: "Downtown Frederick",
    type: "city",
    population: 78_171,
    centroid: { lng: -77.4105, lat: 39.4143 },
    bbox: [-77.460, 39.385, -77.370, 39.450],
    description:
      "The county seat and largest city. Carroll Creek Linear Park, the Spires of Frederick, the Maryland breweries, and a downtown arts district that punches well above its weight.",
    hero_blurb: "Spires, brick, water, and a downtown that walks.",
    fact: "The “City of Clustered Spires.”",
    est: 1745,
  },
  {
    slug: "brunswick",
    name: "Brunswick",
    type: "town",
    population: 7_281,
    centroid: { lng: -77.6280, lat: 39.3134 },
    bbox: [-77.660, 39.295, -77.595, 39.335],
    description:
      "Railroad town on the Potomac with the longest grass-roller-coaster downtown in the county. The MARC line still runs; the C&O Canal Towpath passes through.",
    hero_blurb: "River town. Rail town. Trail town.",
    fact: "A B&O railroad town on the Potomac.",
    est: 1780,
  },
  {
    slug: "thurmont",
    name: "Thurmont",
    type: "town",
    population: 6_762,
    centroid: { lng: -77.4108, lat: 39.6231 },
    bbox: [-77.440, 39.605, -77.380, 39.645],
    description:
      "Gateway to Catoctin Mountain Park and Cunningham Falls. Two main streets, three diners, and one Presidential retreat just over the ridge.",
    hero_blurb: "The gateway town. Catoctin behind it, Maryland in front.",
    fact: "Gateway to Catoctin and Camp David.",
    est: 1751,
  },
  {
    slug: "middletown",
    name: "Middletown",
    type: "town",
    population: 4_628,
    centroid: { lng: -77.5447, lat: 39.4434 },
    bbox: [-77.570, 39.425, -77.520, 39.465],
    description:
      "Middletown Valley between the Catoctin and South Mountain ridges. South Mountain Creamery, Stone House antiques, and a Main Street parade culture.",
    hero_blurb: "A valley between two mountains.",
    fact: "A valley between two mountain ridges.",
    est: 1767,
  },
  {
    slug: "walkersville",
    name: "Walkersville",
    type: "town",
    population: 6_215,
    centroid: { lng: -77.3527, lat: 39.4853 },
    bbox: [-77.380, 39.465, -77.325, 39.510],
    description:
      "Heritage rail town just north of Frederick. The Walkersville Southern Railroad still runs heritage steam excursions on summer weekends.",
    hero_blurb: "Quiet streets, working tracks.",
    fact: "Home to a heritage steam railroad.",
    est: 1882,
  },
  {
    slug: "emmitsburg",
    name: "Emmitsburg",
    type: "town",
    population: 2_886,
    centroid: { lng: -77.3272, lat: 39.7048 },
    bbox: [-77.360, 39.685, -77.295, 39.725],
    description:
      "At the county's northern edge. Mount St. Mary's University, the National Shrine of Saint Elizabeth Ann Seton, and farmland that runs to the Pennsylvania line.",
    hero_blurb: "The mountain, the shrine, the line.",
    fact: "Mount St. Mary's and the Seton Shrine.",
    est: 1785,
  },
  {
    slug: "new-market",
    name: "New Market",
    type: "town",
    population: 1_563,
    centroid: { lng: -77.2769, lat: 39.3792 },
    bbox: [-77.300, 39.360, -77.255, 39.400],
    description:
      "Self-styled \"Antiques Capital of Maryland.\" Twelve blocks of restored 19th-century shopfronts on Main Street, almost all of them dealing in something old.",
    hero_blurb: "Twelve blocks of slower time.",
    fact: "The Antiques Capital of Maryland.",
    est: 1793,
  },
  {
    slug: "mount-airy",
    name: "Mount Airy",
    type: "town",
    population: 9_852,
    // The town straddles the Carroll/Frederick line, and its true center
    // (-77.1547) sits just OUTSIDE the Frederick County polygon (in Carroll),
    // so a county-shape map dropped its dot off the eastern edge. Anchor the
    // centroid on the Frederick-county side of town, where this guide lives.
    centroid: { lng: -77.163, lat: 39.3754 },
    bbox: [-77.180, 39.355, -77.130, 39.400],
    description:
      "Four counties meet under one zip code (Frederick, Carroll, Howard, Montgomery); the town itself straddles the Carroll and Frederick county line. A Main Street revival, two wineries, and the old B&O grade over Parr's Ridge.",
    hero_blurb: "The town at the meeting of four counties.",
    fact: "Where four counties meet.",
    est: 1830,
  },
  {
    slug: "myersville",
    name: "Myersville",
    type: "town",
    population: 1_834,
    centroid: { lng: -77.5680, lat: 39.5079 },
    bbox: [-77.585, 39.495, -77.550, 39.525],
    description:
      "Tucked between the Catoctin ridges. Trout Run, the historic Catoctin Mountain National Pike, and the only town with a regulation lacrosse field per capita that high.",
    hero_blurb: "Small, mountain-folded, close to everything.",
    fact: "Tucked in the Catoctin ridges.",
    est: 1849,
  },
  {
    slug: "woodsboro",
    name: "Woodsboro",
    type: "town",
    population: 1_140,
    centroid: { lng: -77.3138, lat: 39.5301 },
    bbox: [-77.330, 39.515, -77.295, 39.545],
    description:
      "A two-stoplight town with one of the better farm-to-table spots in the county and a creamery just outside the limits. Drive slow on Main Street; the kids walk it.",
    hero_blurb: "A creamery, a Main Street, a stoplight or two.",
    fact: "A two-stoplight farm-and-creamery town.",
    est: 1786,
  },
  {
    slug: "burkittsville",
    name: "Burkittsville",
    // Incorporated municipality (Town of Burkittsville, inc. 1894).
    // Styled a town in its charter and the county's list, though the
    // prose "village" is how everyone, including locals, describes it.
    type: "town",
    population: 142,
    centroid: { lng: -77.6253, lat: 39.3940 },
    bbox: [-77.635, 39.388, -77.615, 39.400],
    description:
      "South Mountain village of about 140 people. Best known beyond its size for a 1999 film that took its name; locals would rather you visit for the Gathland State Park overlooks.",
    hero_blurb: "South Mountain village, tiny and historic.",
    fact: "The “Blair Witch” town, go for Gathland.",
    est: 1824,
  },
  {
    slug: "rosemont",
    name: "Rosemont",
    // Incorporated municipality — the Village of Rosemont (inc. 1953),
    // the county's only chartered village.
    type: "village",
    population: 272,
    // Village of Rosemont, NNE of Brunswick, up the hill from the river
    // (39.3317 N, 77.6242 W; Wikipedia's DMS and GNIS agree). Two earlier
    // centroids were off: the original sat ~2 mi too far west, a first pass
    // still ~1 mi to the SW (and actually NW of Brunswick despite its "NE"
    // note). This is the authoritative point, genuinely NE of Brunswick.
    centroid: { lng: -77.6242, lat: 39.3317 },
    bbox: [-77.633, 39.324, -77.615, 39.339],
    description:
      "A historic village on the Potomac's edge between Brunswick and the C&O Canal. Tree-lined, mostly residential, and one of the quietest places in the county.",
    hero_blurb: "Above the canal, below the ridge.",
    fact: "A quiet village above the C&O Canal.",
    est: 1830,
  },
  {
    // Unincorporated, but one of the most-populous communities in the
    // county — people absolutely identify with it, so it is a
    // first-class place here even though it is a CDP, not a town.
    slug: "urbana",
    name: "Urbana",
    type: "unincorporated",
    population: 13_304,
    // Anchored on Urbana's commercial/civic heart (between the Villages of
    // Urbana market district and the regional library) rather than the CDP's
    // residential-south internal point, so the map dot lands where the town
    // actually gathers (coordinate audit, 2026-07-13).
    centroid: { lng: -77.3500, lat: 39.3300 },
    bbox: [-77.385, 39.300, -77.315, 39.360],
    description:
      "A fast-growing planned community in the county's south, along I-270 and MD-355. Urbana District Park, the regional library, and Sugarloaf Mountain rising just to the southwest.",
    hero_blurb: "The county's southern gateway, under Sugarloaf.",
    fact: "Fast-growing, under Sugarloaf Mountain.",
    est: 1809,
  },
];

export const MUNICIPALITY_BY_SLUG = Object.fromEntries(
  MUNICIPALITIES.map((m) => [m.slug, m])
) as Record<string, Municipality>;
