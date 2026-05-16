/**
 * Demo Radius Points partners for the map preview.
 *
 * This is sample data, not a live program. Radius Points is the rewards
 * concept from the pitch (it reuses the RADIUS_COIN dataset in
 * city-data-engine for now). This set places a few real, recognizable
 * Frederick businesses on the map as illustrative "partners" so the
 * concept reads true. Every surface that renders this data labels it a
 * preview, and the preview has no account, no signup, and no payment of
 * any kind.
 *
 * When a real partner program exists, this static set is replaced behind
 * the same demo switcher. Nothing else has to change.
 */

export type DemoPointsPartner = {
  id: string;
  name: string;
  /** A short business-kind field, not prose. */
  kind: string;
  lng: number;
  lat: number;
  /** Illustrative earn line for the card, not a real offer. */
  earnLine: string;
};

export const DEMO_POINTS_PARTNERS: readonly DemoPointsPartner[] = [
  {
    id: "dublin-roasters",
    name: "Dublin Roasters Coffee",
    kind: "Coffee roaster",
    lng: -77.4128,
    lat: 39.418,
    earnLine: "Earns +10 points per check-in",
  },
  {
    id: "brewers-alley",
    name: "Brewer's Alley",
    kind: "Brewpub",
    lng: -77.4106,
    lat: 39.415,
    earnLine: "Earns +10 points per check-in",
  },
  {
    id: "dancing-bear",
    name: "Dancing Bear Toys and Games",
    kind: "Toy and game shop",
    lng: -77.4101,
    lat: 39.4139,
    earnLine: "Earns +15 points per review",
  },
  {
    id: "lebherz",
    name: "Lebherz Oil and Vinegar",
    kind: "Tasting shop",
    lng: -77.4099,
    lat: 39.4133,
    earnLine: "Earns +10 points per check-in",
  },
  {
    id: "tenth-ward-distilling",
    name: "Tenth Ward Distilling Company",
    kind: "Distillery",
    lng: -77.409,
    lat: 39.4146,
    earnLine: "Earns +10 points per check-in",
  },
];
