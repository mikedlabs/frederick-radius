import { LIGHT, type Flavor } from "@protomaps/basemaps";

/**
 * The Frederick Radius basemap flavor — the brand palette applied to the
 * Protomaps light theme (task #36 spike, owner-approved 2026-08-05).
 *
 * Raw hex on purpose: this is MAP STYLING CONFIG consumed by MapLibre, not
 * app UI — the --app-* token rule governs CSS surfaces. The hues themselves
 * are the canonical brand values plus tints mixed from them:
 *   Cream #F4EEE2 (ground) · Ink #221C15 (labels) · Catoctin Forest #315A43
 *   (parks/woods/terrain, per the palette's terrain assignment) · Creek
 *   #285D73 (water, the civic/map hue) · warm neutrals for the road ladder.
 *
 * Design intent: the county reads as cream paper with green terrain and
 * creek-blue water; roads are quiet warm neutrals so the app's own pins,
 * layers, and routes (Brick, Amber) sit ON the map instead of fighting it.
 */
export const FREDERICK_FLAVOR: Flavor = {
  ...LIGHT,

  // Ground: Cream paper, slightly deepened beyond the county so land reads.
  background: "#EAE3D4",
  earth: "#F4EEE2",

  // Water: Creek, tinted for a ground fill but unmistakably blue-green.
  water: "#A9C6D2",
  ocean_label: "#285D73",

  // Terrain and green space: Catoctin Forest tints, parks a step lighter
  // than woods so ridgelines and forest blocks keep depth.
  park_a: "#D9E4DB",
  park_b: "#D2DFD5",
  wood_a: "#C9D9CC",
  wood_b: "#C2D4C6",
  scrub_a: "#DCE4D4",
  scrub_b: "#D6DFCC",
  glacier: "#F7F3EA",
  sand: "#EDE3CC",
  beach: "#EDE3CC",
  landcover: {
    grassland: "rgba(214, 226, 211, 1)",
    barren: "rgba(238, 229, 208, 1)",
    urban_area: "rgba(237, 230, 216, 1)",
    farmland: "rgba(226, 232, 209, 1)",
    glacier: "rgba(247, 243, 234, 1)",
    scrub: "rgba(219, 227, 205, 1)",
    forest: "rgba(201, 217, 204, 1)",
  },

  // Civic ground uses: quiet warm washes, never loud.
  hospital: "#F0E4DC",
  school: "#EFE8D6",
  industrial: "#EDE6D6",
  zoo: "#E3E7DA",
  military: "#E8E2D2",
  aerodrome: "#E9E4D6",
  runway: "#DAD2C2",
  pedestrian: "#EFE9DB",
  pier: "#E5DECE",

  // Buildings: a warm shade of the ground, not gray.
  buildings: "#E4DAC8",

  // The road ladder: warm neutrals from Cream toward white, with casings
  // mixed toward Ink so hierarchy survives without color noise.
  highway: "#FFFFFF",
  highway_casing_early: "#CBBFA9",
  highway_casing_late: "#CBBFA9",
  major: "#FDFAF3",
  major_casing_early: "#D8CDBA",
  major_casing_late: "#D8CDBA",
  minor_a: "#F9F4E9",
  minor_b: "#F7F1E4",
  minor_casing: "#E2D9C6",
  minor_service: "#F3ECDD",
  minor_service_casing: "#E6DECC",
  link: "#FBF7EC",
  link_casing: "#D8CDBA",
  other: "#F3ECDD",
  tunnel_highway: "#EFE9DB",
  tunnel_highway_casing: "#DDD3C0",
  tunnel_major: "#F0EADC",
  tunnel_major_casing: "#E0D7C4",
  tunnel_minor: "#F2ECDE",
  tunnel_minor_casing: "#E4DCC9",
  tunnel_link: "#F0EADC",
  tunnel_link_casing: "#E0D7C4",
  tunnel_other: "#F2ECDE",
  tunnel_other_casing: "#E4DCC9",
  bridges_highway: "#FFFFFF",
  bridges_highway_casing: "#CBBFA9",
  bridges_major: "#FDFAF3",
  bridges_major_casing: "#D8CDBA",
  bridges_minor: "#F9F4E9",
  bridges_minor_casing: "#E2D9C6",
  bridges_link: "#FBF7EC",
  bridges_link_casing: "#D8CDBA",
  bridges_other: "#F3ECDD",
  bridges_other_casing: "#E6DECC",

  railway: "#C9BFAE",
  boundaries: "#A99E8C",

  // Labels: Ink and its softer steps, halos in Cream — the app's own type
  // hierarchy, spoken by the map.
  city_label: "#221C15",
  city_label_halo: "#F4EEE2",
  state_label: "#8A8074",
  state_label_halo: "#F4EEE2",
  country_label: "#6E655A",
  subplace_label: "#5C5346",
  subplace_label_halo: "#F4EEE2",
  address_label: "#8A8074",
  address_label_halo: "#F4EEE2",
  roads_label_minor: "#6E655A",
  roads_label_minor_halo: "#F4EEE2",
  roads_label_major: "#4A4237",
  roads_label_major_halo: "#F4EEE2",

  // POI glyph palette: muted toward the brand family (Creek, Catoctin,
  // Brick-adjacent) so default POIs whisper.
  pois: {
    blue: "#285D73",
    green: "#315A43",
    lapis: "#2F566B",
    pink: "#9C5A74",
    red: "#B5462B",
    slategray: "#6E655A",
    tangerine: "#C58A32",
    turquoise: "#3E7085",
  },
};
