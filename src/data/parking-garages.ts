/**
 * Curated metadata for the City of Frederick's downtown parking
 * garages. Coordinates come from places-dfp.json (the garages
 * already exist there as place records); this sidecar adds the
 * operational metadata visitors actually need to decide where to
 * park.
 *
 * Source: cityoffrederickmd.gov/parking (publicly published).
 * Rates VERIFIED against the City's published rate schedule (2026-06).
 * The schedule is uniform across all five city garages, so it lives
 * once in PARKING_RATE_SCHEDULE rather than being repeated per garage.
 * Capacity is still unset (the City doesn't publish per-garage counts);
 * left blank rather than guessed so a visitor never trusts wrong data.
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
  /** Garage coordinates (from the canonical place record in places-client.json).
   *  Carried here so the parking forecast (which garage a downtown event will
   *  fill) is self-contained and doesn't load the full places dataset. */
  geom?: { lng: number; lat: number };
  /** Always 24/7 for downtown Frederick city garages per municipal policy. */
  hours: string;
  /** Payment methods supported on-site. All city garages take cash or
   *  credit cards (verified 2026-06). */
  payment: ("cash" | "credit-card" | "park-mobile" | "pay-at-exit" | "monthly-permit" | "validated")[];
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

/**
 * The City of Frederick's downtown garage rate schedule — uniform across
 * all five garages. Verified against the City's published schedule
 * (2026-06). Surface this once on /parking rather than per-garage.
 */
export const PARKING_RATE_SCHEDULE = {
  /** Base: $1/hour, capped at $12/day, every day. */
  hourly: "$1 / hour",
  dailyMax: "$12 / day",
  /** 6:30 AM – 3:30 PM. */
  daytimeMax: "$12 max",
  /** 3:30 PM – 6:30 AM. */
  nighttimeMax: "$5 max",
  /** Free Sundays 8:00 AM – 2:00 PM; hourly rate resumes after 2:00 PM. */
  freeWindow: "Free Sundays 8 AM – 2 PM",
  acceptsCashAndCredit: true,
  summary: "$1/hr · $12/day max · $5 max overnight · free Sun 8 AM–2 PM",
} as const;

/** City of Frederick main parking office. */
export const PARKING_OFFICE = {
  address: "2 S Court St, Frederick, MD 21701",
  phone: "301-600-1429",
} as const;

/**
 * Accessible-parking rules for the Downtown Business District, per the
 * City (Maryland MVL §13-616). Surfaced verbatim-in-spirit so we never
 * misstate a legal allowance.
 */
export const PARKING_ACCESSIBILITY = [
  "A valid H/C tag or hangtag may park in a regular metered zone for twice the posted time, at no charge (e.g. a 2-hour meter = 4 hours).",
  "No accessible parking in SHORT-TERM loading zones 6–10 AM; after 10 AM those become regular spaces (2× the zone applies).",
  "No accessible parking in LONG-TERM loading-zone spaces.",
  "All city garages are accessible, with H/C spaces on every level; garage patrons pay the prevailing rates.",
] as const;

export const PARKING_GARAGES: ParkingGarage[] = [
  {
    slug: "west-patrick-street-parking-deck",
    name: "West Patrick Street Garage",
    address: "138 W Patrick St, Frederick, MD",
    geom: { lng: -77.4137744, lat: 39.4132628 },
    hours: "24/7",
    payment: ["cash", "credit-card", "park-mobile", "pay-at-exit", "monthly-permit"],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "On the west side of downtown — closest to City Hall, the courthouse, and the W Patrick Street restaurant strip.",
  },
  {
    slug: "court-street-parking-garage-frederick",
    name: "Court Street Garage",
    address: "2 S Court St, Frederick, MD",
    geom: { lng: -77.41204739999999, lat: 39.4135367 },
    hours: "24/7",
    payment: ["cash", "credit-card", "park-mobile", "pay-at-exit", "monthly-permit"],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "Adjacent to the City Hall and the courthouse complex. Most central garage for civic business.",
  },
  {
    slug: "carroll-creek-parking-garage-frederick",
    name: "Carroll Creek Parking Deck",
    address: "44 E Patrick St, Frederick, MD",
    geom: { lng: -77.4096093, lat: 39.4134048 },
    hours: "24/7",
    payment: ["cash", "credit-card", "park-mobile", "pay-at-exit", "monthly-permit"],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "Best garage for Carroll Creek Linear Park, Alive @ Five concerts, and the East Patrick restaurant row.",
  },
  {
    slug: "church-street-garage",
    name: "Church Street Garage",
    address: "17 E Church St, Frederick, MD",
    geom: { lng: -77.4100809, lat: 39.4155064 },
    hours: "24/7",
    payment: ["cash", "credit-card", "park-mobile", "pay-at-exit", "monthly-permit"],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "Closest to the Weinberg Center for the Arts and the N Market Street shopping/dining stretch.",
  },
  {
    slug: "east-all-saints-street-parking-garage",
    name: "East All Saints Street Parking Garage",
    address: "125 E All Saints St, Frederick, MD",
    geom: { lng: -77.40729069999999, lat: 39.4118117 },
    hours: "24/7",
    payment: ["cash", "credit-card", "park-mobile", "pay-at-exit", "monthly-permit"],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "South of Carroll Creek — convenient for the All Saints restaurant row and breweries.",
  },
];
