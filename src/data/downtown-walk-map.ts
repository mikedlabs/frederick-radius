/** Selected OpenStreetMap features around the downtown walk, retrieved Nov 24,
 * 2026. © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright
 * North is up. This local equirectangular projection uses the same scale for
 * the street/creek geometry and the four reviewed site footprints. */
export const WALK_VIEW = { width: 360, height: 240 };
export const projectWalkSite = (lng: number, lat: number) => ({
  x: (lng + 77.40945) * 85000,
  y: (39.41299 - lat) * 110000,
});

// OSM ways for South Carroll, East All Saints and South East streets.
// 11555243, 11561123, 48682289, 103615703, 368623644, 399678770, 447604180, 486999840, 486999842, 490229800, 490229803, 1318026483, 1581415390.
export const walkStreets = [
  "M137.8 -10L136 6.1L134.8 16L134.4 21.2",
  "M121 134.7L113.9 134.2L62.9 131L50.7 130.2L29.5 128.9L-10 126.3",
  "M295.5 147.2L284.1 146.6L280.4 146.4L252.8 144.9L241 144L206.4 140.6L197.3 139.8L185.5 138.9L180.3 138.6L130.7 135.4L121 134.7",
  "M134.4 21.2L132.1 42.1",
  "M287.8 250L288.2 229.2L289.6 199.7",
  "M109 250L113.9 204L116.2 181.5L117.7 162.4L120.1 142.1L121 134.7",
  "M121 134.7L122.6 125.6L127.4 81.7L130.1 57.6L132.1 42.1",
  "M311.2 37.6L308.7 46.6L307 63.2L306.9 79.8",
  "M306.9 79.8L313.4 66.5L318.2 46.3L321 36.4",
  "M296 143.3L306.9 79.8",
  "M293.9 161.1L295.5 147.2",
  "M289.6 199.7L293.9 161.1",
  "M295.5 147.2L296 143.3",
];
// Carroll Creek, https://www.openstreetmap.org/way/1552586076
export const walkCreek = "M-10 23.6L14 24.9L207.6 36.5L234 38L260.5 37.9L279.2 36.7L299.9 34.7L321 31.4L338.3 27.7L370 20.5";

// Positions are footprint bounding-box centers, never an entrance or an exact
// walking path. Offsets separate the touch labels from nearby site centers.
export const walkSites = {
  "east-all-saints-garage": {
    osmWay: "151766247", lng: -77.4074680, lat: 39.4119843,
    label: "Garage", dx: -31, dy: 5, side: "left",
    footprint: "M140.2 127.7L142.5 94.4L147.2 94.7L147.3 91.7L147.5 89.9L190.5 92.8L190.3 96L196.7 96.4L196.4 101L196.3 103.2L194.8 124.7L194.4 131.3L186.6 130.8L185.5 130.7L182 130.5L145.1 128L140.2 127.7Z",
  },
  "visitor-center": {
    osmWay: "177916159", lng: -77.4064104, lat: 39.4110140,
    label: "Visitor Center", dx: 16, dy: -15, side: "left",
    footprint: "M248.9 202.1L247.4 215.8L247.2 217.2L245.7 230.9L253.4 231.7L261.2 232.6L262.4 221.7L265.1 221.8L267.6 221.2L269.1 220.6L269.3 219.2L269.4 219.3L269.7 219.3L271 204.5L248.9 202.1Z",
  },
  "delaplaine": {
    osmWay: "178348790", lng: -77.4073279, lat: 39.4123432,
    label: "Delaplaine", dx: 29, dy: 0, side: "right",
    footprint: "M170.2 61.7L184.6 63.9L184.3 66.3L196.4 67.9L194.9 80L182.5 78.4L182.3 80.6L164.3 78.3L165.4 71.6L168.9 71.6L169.3 68.9L170.2 61.7Z",
  },
  "carroll-creek": {
    osmWay: "486999837", lng: -77.4078847, lat: 39.4126983,
    label: "Bridge", dx: -22, dy: 8, side: "left",
    footprint: "M126.3 20.8L124 41.2L126.8 41.7L132.1 42.1L137 42.2L139.9 43.5L142.1 22L140.1 21.8L134.4 21.2L129.2 20.7L126.3 20.8Z",
  },
} as const;

export type WalkSiteId = keyof typeof walkSites;
