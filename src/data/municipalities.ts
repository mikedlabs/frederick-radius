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
    // This scope covers the full municipality, including west-side shopping
    // centers. Calling it "Downtown" made distant results look incorrectly
    // scoped; true downtown discovery is handled by location/radius context.
    // "Frederick City" (owner call 2026-07-21): in a guide named for the
    // COUNTY, a bare "Frederick" chip read ambiguously — city vs county.
    // The postal city on addresses stays "Frederick" (place.city), and the
    // passport stamp keeps the short title (stamps.ts special-cases it).
    name: "Frederick City",
    type: "city",
    population: 78_171,
    centroid: { lng: -77.4105, lat: 39.4143 },
    bbox: [-77.460, 39.385, -77.370, 39.450],
    description:
      "Frederick is the county seat and the county's largest city. Carroll Creek Linear Park runs through downtown near the city's historic buildings and clustered church spires.",
    hero_blurb: "Carroll Creek Linear Park runs through downtown Frederick.",
    fact: "Frederick is known as the City of Clustered Spires.",
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
      "Brunswick sits on the Potomac River and grew around the B&O Railroad. Its MARC station is near the C&O Canal Towpath.",
    hero_blurb: "Brunswick's MARC station is near the Potomac River and C&O Canal Towpath.",
    fact: "Brunswick grew as a B&O Railroad town on the Potomac River.",
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
      "Thurmont is near Catoctin Mountain Park and Cunningham Falls State Park. Camp David is within Catoctin Mountain Park.",
    hero_blurb: "Thurmont is a gateway to Catoctin Mountain Park.",
    fact: "Catoctin Mountain Park and Cunningham Falls State Park are nearby.",
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
      "Middletown lies in the Middletown Valley between Catoctin Mountain and South Mountain. Its historic Main Street follows US 40 Alternate.",
    hero_blurb: "Middletown sits between Catoctin Mountain and South Mountain.",
    fact: "The town lies in the Middletown Valley.",
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
      "Walkersville is north of Frederick along MD 194. The Walkersville Southern Railroad operates excursion trains from its station in town.",
    hero_blurb: "The Walkersville Southern Railroad operates excursions from town.",
    fact: "Walkersville is home to the Walkersville Southern Railroad.",
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
      "Emmitsburg sits near the Pennsylvania state line. It is home to Mount St. Mary's University and the National Shrine of Saint Elizabeth Ann Seton.",
    hero_blurb: "Emmitsburg is home to Mount St. Mary's University and the Seton Shrine.",
    fact: "The National Shrine of Saint Elizabeth Ann Seton is in Emmitsburg.",
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
      "New Market's historic Main Street follows the Historic National Road and includes several antique shops.",
    hero_blurb: "New Market's historic Main Street is known for antique shops.",
    fact: "The Historic National Road runs through downtown New Market.",
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
      "Mount Airy straddles the Frederick and Carroll county line at Parr's Ridge. Its historic Main Street developed alongside the B&O Railroad.",
    hero_blurb: "Mount Airy straddles Frederick and Carroll counties.",
    fact: "The town sits on Parr's Ridge at the Frederick and Carroll county line.",
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
      "Myersville is an incorporated town near Catoctin Mountain and the Appalachian Trail. It was incorporated in 1904.",
    hero_blurb: "Myersville sits near Catoctin Mountain and the Appalachian Trail.",
    fact: "Myersville was incorporated in 1904.",
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
      "Woodsboro is an incorporated town in north-central Frederick County. Its 102-acre public park includes a disc golf course.",
    hero_blurb: "Woodsboro has a 102-acre public park.",
    fact: "Woodsboro was incorporated in 1929.",
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
      "Burkittsville was established in 1824 near South Mountain. Its Main Street preserves buildings from the town's early history.",
    hero_blurb: "Burkittsville's historic Main Street sits near South Mountain.",
    fact: "Burkittsville was established in 1824.",
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
      "The Village of Rosemont is an incorporated community immediately northeast of Brunswick. It was incorporated in 1953.",
    hero_blurb: "Rosemont is an incorporated village northeast of Brunswick.",
    fact: "Rosemont is Frederick County's only incorporated village.",
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
      "Urbana is an unincorporated community along MD 355 near I-270. It is home to Urbana Regional Library and Urbana District Park.",
    hero_blurb: "Urbana is a community along MD 355 near I-270.",
    fact: "Urbana is an unincorporated community near I-270.",
    est: 1809,
  },
];

// Municipality slugs arrive through URLs, cookies, local storage, and public
// API bodies. A null-prototype dictionary prevents Object's inherited keys
// from being accepted as real Frederick County places.
export const MUNICIPALITY_BY_SLUG: Record<string, Municipality> = Object.assign(
  Object.create(null) as Record<string, Municipality>,
  Object.fromEntries(MUNICIPALITIES.map((m) => [m.slug, m])),
);

/** Validate an untrusted municipality slug before reading or storing it. */
export function isMunicipalitySlug(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(MUNICIPALITY_BY_SLUG, value);
}
