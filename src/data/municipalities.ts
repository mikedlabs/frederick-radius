import type { LngLat } from "@/lib/geo";

// "village" was dropped: Maryland has no legal village municipal
// class, so after Burkittsville/Rosemont were corrected to "town"
// (#87) nothing used it. Add it back only if a non-MD use arises.
export type MunicipalityType = "city" | "town" | "unincorporated";

export type Municipality = {
  slug: string;
  name: string;
  type: MunicipalityType;
  population: number;
  centroid: LngLat;
  bbox: [number, number, number, number];
  description: string;
  hero_blurb: string;
  est: number;
};

export const MUNICIPALITIES: Municipality[] = [
  {
    slug: "frederick",
    name: "Downtown Frederick",
    type: "city",
    population: 80_435,
    centroid: { lng: -77.4105, lat: 39.4143 },
    bbox: [-77.460, 39.385, -77.370, 39.450],
    description:
      "The county seat and largest city. Carroll Creek Linear Park, the Spires of Frederick, the Maryland breweries, and a downtown arts district that punches well above its weight.",
    hero_blurb: "Spires, brick, water — and a downtown that walks.",
    est: 1745,
  },
  {
    slug: "brunswick",
    name: "Brunswick",
    type: "city",
    population: 7_281,
    centroid: { lng: -77.6280, lat: 39.3134 },
    bbox: [-77.660, 39.295, -77.595, 39.335],
    description:
      "Railroad town on the Potomac with the longest grass-roller-coaster downtown in the county. The MARC line still runs; the C&O Canal Towpath passes through.",
    hero_blurb: "River town. Rail town. Trail town.",
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
    est: 1793,
  },
  {
    slug: "mount-airy",
    name: "Mount Airy",
    type: "town",
    population: 9_852,
    centroid: { lng: -77.1547, lat: 39.3754 },
    bbox: [-77.180, 39.355, -77.130, 39.400],
    description:
      "Four counties meet under one zip code (Frederick, Carroll, Howard, Montgomery). A Main Street revival, two wineries on the ridge, and the highest elevation in the county.",
    hero_blurb: "The town at the meeting of four counties.",
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
    est: 1786,
  },
  {
    slug: "burkittsville",
    name: "Burkittsville",
    // Incorporated municipality (Town of Burkittsville, inc. 1894).
    // Maryland has no legal "village" class — it is a town.
    type: "town",
    population: 153,
    centroid: { lng: -77.6253, lat: 39.3940 },
    bbox: [-77.635, 39.388, -77.615, 39.400],
    description:
      "South Mountain village of just over 150 people. Best known beyond its size for a 1999 film that took its name; locals would rather you visit for the Gathland State Park overlooks.",
    hero_blurb: "South Mountain village, 153 strong.",
    est: 1824,
  },
  {
    slug: "rosemont",
    name: "Rosemont",
    // Incorporated municipality (Town of Rosemont, inc. 1953).
    type: "town",
    population: 280,
    centroid: { lng: -77.6608, lat: 39.3261 },
    bbox: [-77.670, 39.320, -77.650, 39.335],
    description:
      "A historic village on the Potomac's edge between Brunswick and the C&O Canal. Tree-lined, mostly residential, and one of the quietest places in the county.",
    hero_blurb: "Above the canal, below the ridge.",
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
    centroid: { lng: -77.3514, lat: 39.3259 },
    bbox: [-77.385, 39.300, -77.315, 39.360],
    description:
      "A fast-growing planned community in the county's south, along I-270 and MD-355. Urbana District Park, the regional library, and Sugarloaf Mountain rising just to the southwest.",
    hero_blurb: "The county's southern gateway, under Sugarloaf.",
    est: 1809,
  },
];

export const MUNICIPALITY_BY_SLUG = Object.fromEntries(
  MUNICIPALITIES.map((m) => [m.slug, m])
) as Record<string, Municipality>;
