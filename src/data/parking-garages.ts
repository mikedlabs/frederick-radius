/**
 * Curated metadata for the City of Frederick's downtown parking
 * garages. Coordinates come from places-dfp.json (the garages
 * already exist there as place records); this sidecar adds the
 * operational metadata visitors actually need to decide where to
 * park.
 *
 * Source: cityoffrederickmd.gov/parking (publicly published).
 * Rates and capacity are PLACEHOLDERS to be verified — left blank
 * here rather than guessed so a visitor never trusts wrong data.
 * The editor should confirm rates with the City Parking Department
 * before they ship; the structure is here, the values are honest.
 *
 * NOT included:
 *   - "Second Chances Garage" — charity / vehicle-repair non-profit
 *     on N Market, not a public parking garage. Filtered out of
 *     this list at the place-record level.
 *
 * Slug note: each `slug` below MUST match the canonical place record
 * in places-client.json — these strings build /places/<slug> links on
 * /parking. The Phase 2 slug rebuild normalized the garage slugs to
 * their longer forms (e.g. "court-street-parking-garage-frederick"),
 * so the short forms used here originally went dead. parking-slugs.spec
 * now guards every slug against the place data so this can't recur.
 */
export type ParkingGarage = {
  slug: string;
  name: string;
  address: string;
  /** Always 24/7 for downtown Frederick city garages per municipal policy. */
  hours: string;
  /** Payment methods supported on-site. */
  payment: ("park-mobile" | "pay-at-exit" | "monthly-permit" | "validated")[];
  /** True if EV charging stations are present in this garage. Verified
   *  with the city's published EV-charging map. Left undefined when
   *  the editor has not yet confirmed. */
  ev_charging?: boolean;
  /** Verified once the editor confirms with the City Parking Department;
   *  intentionally left null on first ship so visitors don't trust
   *  guessed rates. */
  hourly_rate?: string;
  capacity?: number;
  notes?: string;
};

export const PARKING_GARAGES: ParkingGarage[] = [
  {
    slug: "west-patrick-street-parking-deck",
    name: "West Patrick Street Garage",
    address: "138 W Patrick St, Frederick, MD",
    hours: "24/7",
    payment: ["park-mobile", "pay-at-exit", "monthly-permit"],
    notes:
      "On the west side of downtown — closest to City Hall, the courthouse, and the W Patrick Street restaurant strip.",
  },
  {
    slug: "court-street-parking-garage-frederick",
    name: "Court Street Garage",
    address: "2 S Court St, Frederick, MD",
    hours: "24/7",
    payment: ["park-mobile", "pay-at-exit", "monthly-permit"],
    notes:
      "Adjacent to the City Hall and the courthouse complex. Most central garage for civic business.",
  },
  {
    slug: "carroll-creek-parking-garage-frederick",
    name: "Carroll Creek Parking Deck",
    address: "44 E Patrick St, Frederick, MD",
    hours: "24/7",
    payment: ["park-mobile", "pay-at-exit", "monthly-permit"],
    notes:
      "Best garage for Carroll Creek Linear Park, Alive @ Five concerts, and the East Patrick restaurant row.",
  },
  {
    slug: "church-street-garage",
    name: "Church Street Garage",
    address: "17 E Church St, Frederick, MD",
    hours: "24/7",
    payment: ["park-mobile", "pay-at-exit", "monthly-permit"],
    notes:
      "Closest to the Weinberg Center for the Arts and the N Market Street shopping/dining stretch.",
  },
  {
    slug: "east-all-saints-street-parking-garage",
    name: "East All Saints Street Parking Garage",
    address: "125 E All Saints St, Frederick, MD",
    hours: "24/7",
    payment: ["park-mobile", "pay-at-exit", "monthly-permit"],
    notes:
      "South of Carroll Creek — convenient for the All Saints restaurant row and breweries.",
  },
];
