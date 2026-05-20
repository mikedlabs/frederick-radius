/**
 * Frederick County history — curated moments and facts.
 *
 * These are real, verifiable events and details about the county and
 * its city. The aim is to give residents pride and visitors texture —
 * not a Wikipedia dump. Each entry is short, the way a museum docent
 * would mention it as you walked past the marker.
 *
 * Sources: National Park Service / Library of Congress / Maryland
 * Historical Trust / Frederick County Public Libraries local-history
 * collection / the markers themselves. Dates rounded only when the
 * exact day isn't fixed in the historical record.
 *
 * Each entry has a `kind` so the page can group them — moment (a
 * dated event), fact (an evergreen detail), or person (someone tied
 * to the county). Tags drive search + a "topic" filter on the page.
 */

export type HistoryKind = "moment" | "fact" | "person";

export type HistoryEntry = {
  slug: string;
  title: string;
  /** Year for moments + people; omitted for evergreen facts. */
  year?: number;
  /** Optional 4-digit display when the day matters (e.g. "Sept 17, 1862"). */
  date_label?: string;
  kind: HistoryKind;
  /** One short paragraph, 1-3 sentences. The way you'd say it aloud. */
  body: string;
  /** Where in the county this happened, for the map-related view. */
  place?: string;
  /** Optional point on the map. */
  geom?: { lng: number; lat: number };
  /** Topic tags for filtering. */
  tags: string[];
  /** Optional further-reading link — only authoritative sources. */
  source_url?: string;
  source_label?: string;
};

export const HISTORY: HistoryEntry[] = [
  // ── Big moments ──
  {
    slug: "frederick-county-established",
    title: "Frederick County is born",
    year: 1748,
    kind: "moment",
    body: "The Maryland General Assembly carves Frederick County out of Prince George's County. At the time it's so large it stretches all the way to the Ohio River — Allegany, Garrett, Washington and Montgomery counties will later split off from it.",
    place: "Frederick",
    tags: ["founding", "government"],
  },
  {
    slug: "hessian-barracks",
    title: "The Hessian Barracks go up",
    year: 1777,
    kind: "moment",
    body: "Stone barracks are built to house Hessian soldiers captured at the Battle of Saratoga. They later quarter Continental Army troops, prisoners of war from the War of 1812, and Civil War recruits — one of the oldest military structures in continuous government use in the country.",
    place: "Hessian Barracks, Frederick",
    geom: { lng: -77.4106, lat: 39.4119 },
    tags: ["military", "revolution", "buildings"],
  },
  {
    slug: "mount-st-marys-founded",
    title: "Mount St. Mary's opens",
    year: 1808,
    kind: "moment",
    body: "Father John DuBois founds Mount St. Mary's University on the slope of Saint Mary's Mountain in Emmitsburg. It's the second-oldest Catholic university in the United States and the cradle of seven future bishops in its first 50 years.",
    place: "Emmitsburg",
    geom: { lng: -77.3252, lat: 39.6735 },
    tags: ["education", "religion"],
    source_url: "https://msmary.edu/about/history.html",
    source_label: "Mt. St. Mary's University",
  },
  {
    slug: "barbara-fritchie-flag",
    title: "Barbara Fritchie's flag",
    year: 1862,
    date_label: "September 1862",
    kind: "moment",
    body: 'When Stonewall Jackson\'s Confederate troops march through Frederick, 95-year-old Barbara Fritchie reportedly waves the Union flag from her window. John Greenleaf Whittier turns it into a poem ("Shoot if you must, this old gray head") that becomes one of the most famous American verses of the war.',
    place: "Barbara Fritchie House, Frederick",
    geom: { lng: -77.4180, lat: 39.4145 },
    tags: ["civil-war", "people", "literature"],
  },
  {
    slug: "battle-of-monocacy",
    title: "The Battle that Saved Washington",
    year: 1864,
    date_label: "July 9, 1864",
    kind: "moment",
    body: "On 7,000 acres just south of Frederick, Union Major General Lew Wallace's 5,800 men hold Confederate General Jubal Early's 14,000-strong army long enough for reinforcements to reach Washington, D.C. Wallace loses the battle but Washington is saved.",
    place: "Monocacy National Battlefield",
    geom: { lng: -77.3964, lat: 39.3676 },
    tags: ["civil-war", "battle"],
    source_url: "https://www.nps.gov/mono/",
    source_label: "National Park Service",
  },
  {
    slug: "ransom-of-frederick",
    title: "The $200,000 Ransom",
    year: 1864,
    date_label: "July 9, 1864",
    kind: "moment",
    body: "Hours before the Battle of Monocacy, Confederate General Jubal Early demands $200,000 from the city of Frederick or he'll burn it down. The city pays. It takes Frederick 87 years to retire the debt — paid off in 1951.",
    place: "Downtown Frederick",
    tags: ["civil-war", "money"],
  },
  {
    slug: "camp-david-established",
    title: "Camp David is created",
    year: 1942,
    kind: "moment",
    body: "Franklin Roosevelt establishes a presidential retreat in Catoctin Mountain Park, originally calling it Shangri-La. Dwight Eisenhower renames it for his grandson David. The first foreign leader to visit is Winston Churchill — every president since has used it.",
    place: "Catoctin Mountain Park, Thurmont",
    geom: { lng: -77.4486, lat: 39.6491 },
    tags: ["military", "presidents"],
    source_url: "https://www.nps.gov/cato/learn/historyculture/camp-david.htm",
    source_label: "National Park Service",
  },
  {
    slug: "carroll-creek-park",
    title: "Carroll Creek is reborn",
    year: 1976,
    kind: "moment",
    body: "After a 1976 flood devastates downtown Frederick, the city begins a multi-decade project to channel Carroll Creek through a linear park. Today its bridges, fountains and seasonal sailing-paper-boats race draw a million visitors a year through what used to be a forgotten back-of-town stream.",
    place: "Carroll Creek Linear Park",
    geom: { lng: -77.4093, lat: 39.4128 },
    tags: ["downtown", "parks"],
  },

  // ── People ──
  {
    slug: "francis-scott-key",
    title: "Francis Scott Key",
    year: 1779,
    kind: "person",
    body: "Born in nearby Carroll County, raised partly in Frederick, Key practiced law downtown and is buried in Mount Olivet Cemetery. He wrote the Star-Spangled Banner in 1814 watching the British shell Fort McHenry — but his Frederick law office still stands.",
    place: "Mount Olivet Cemetery, Frederick",
    geom: { lng: -77.4071, lat: 39.4012 },
    tags: ["people", "literature"],
  },
  {
    slug: "roger-brooke-taney",
    title: "Roger B. Taney",
    year: 1777,
    kind: "person",
    body: "The fifth Chief Justice of the United States lived and practiced law in Frederick. His house on South Bentz Street is now a museum. Taney wrote the Dred Scott decision — one of the most consequential and contested rulings in American history.",
    place: "Roger B. Taney House, Frederick",
    geom: { lng: -77.4170, lat: 39.4109 },
    tags: ["people", "law"],
  },
  {
    slug: "glenn-l-martin",
    title: "Glenn L. Martin, aircraft pioneer",
    year: 1886,
    kind: "person",
    body: "Born in Macksburg, Iowa but raised in Liberty (then Frederick County), Glenn L. Martin founded what would become Lockheed Martin. He taught Donald Douglas and William Boeing the airplane business — three of America's biggest aerospace names trace back through him.",
    tags: ["people", "industry"],
  },

  // ── Facts ──
  {
    slug: "clustered-spires",
    title: "The Clustered Spires",
    kind: "fact",
    body: "Frederick is nicknamed the City of Clustered Spires after John Greenleaf Whittier's 1864 poem about Barbara Fritchie. From any hill east of downtown you can count five church towers — the original cluster, all built before 1855.",
    place: "Downtown Frederick",
    tags: ["downtown", "architecture"],
  },
  {
    slug: "schifferstadt",
    title: "Schifferstadt: oldest house in town",
    kind: "fact",
    body: "Joseph Brunner, an immigrant from Schifferstadt in the Rhineland, finished this stone farmhouse in 1758 — 18 years before the Declaration of Independence. It's one of the oldest surviving German colonial homes in America and still has its original square nails.",
    place: "Schifferstadt, Frederick",
    geom: { lng: -77.4253, lat: 39.4192 },
    tags: ["buildings", "german-heritage"],
  },
  {
    slug: "co-canal",
    title: "The C&O Canal",
    kind: "fact",
    body: "The Chesapeake & Ohio Canal runs 184.5 miles from Georgetown to Cumberland and skirts the southern edge of Frederick County through Brunswick. Construction began in 1828 the same day the B&O Railroad broke ground a few miles away — the canal lost the race to the river.",
    place: "Brunswick",
    geom: { lng: -77.6325, lat: 39.3137 },
    tags: ["industry", "outdoors"],
    source_url: "https://www.nps.gov/choh/",
    source_label: "National Park Service",
  },
  {
    slug: "new-market-antiques",
    title: "Antiques Capital of Maryland",
    kind: "fact",
    body: "The town of New Market — population about 600 — was officially designated the Antiques Capital of Maryland by the General Assembly in 1985. Its single Main Street has packed nearly 40 antique shops into less than a mile.",
    place: "New Market",
    geom: { lng: -77.2767, lat: 39.3784 },
    tags: ["shopping", "small-town"],
  },
  {
    slug: "brunswick-railroad",
    title: "Brunswick: a railroad town",
    kind: "fact",
    body: "In the 1890s the Brunswick rail yard was the largest east of the Mississippi — over a mile of track, 13,000 cars handled daily. The town built itself around the railroad, and the Brunswick Heritage Museum still tells its story with the original B&O dispatcher's tower.",
    place: "Brunswick Heritage Museum",
    geom: { lng: -77.6276, lat: 39.3140 },
    tags: ["industry", "small-town"],
  },
  {
    slug: "national-pike",
    title: "The National Pike",
    kind: "fact",
    body: "What is now US Route 40 was originally the National Road, the first federally funded highway in the country (1811–1837). It connected Cumberland, Maryland to Wheeling, West Virginia and ran straight through Frederick. The route follows roughly the same path today.",
    tags: ["roads", "industry"],
  },
  {
    slug: "catoctin-mountain-park",
    title: "Catoctin Mountain Park",
    kind: "fact",
    body: "One of the few US national parks created from CCC reforestation work in the 1930s — the mountain had been clear-cut for charcoal to feed the Catoctin Furnace iron works (which made cannonballs for the Continental Army). The Civilian Conservation Corps planted the trees you walk under today.",
    place: "Thurmont",
    geom: { lng: -77.4486, lat: 39.6491 },
    tags: ["outdoors", "ccc"],
    source_url: "https://www.nps.gov/cato/",
    source_label: "National Park Service",
  },
  {
    slug: "nci-frederick",
    title: "NCI Frederick: cancer research",
    kind: "fact",
    body: "The National Cancer Institute's only federally owned research campus is on Fort Detrick in Frederick. Over 2,000 scientists work here — much of the early HIV/AIDS research and the cryo-EM facility that helped sequence the SARS-CoV-2 spike protein were done on this campus.",
    place: "Fort Detrick, Frederick",
    geom: { lng: -77.4292, lat: 39.4391 },
    tags: ["science", "industry"],
  },
];

export const HISTORY_BY_SLUG: Record<string, HistoryEntry> = Object.fromEntries(
  HISTORY.map((h) => [h.slug, h]),
);

/** Topic facets pulled from tags, for the page filter row. */
export function historyTopics(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of HISTORY) {
    for (const t of h.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
