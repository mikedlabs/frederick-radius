/**
 * Curated metadata for the City of Frederick's five downtown garages.
 *
 * Operational source of truth:
 *   https://www.cityoffrederickmd.gov/1342/Garage-Parking
 *
 * Rates and payment procedures were rechecked against the City's published
 * garage page in July 2026. ParkMobile belongs to ON-STREET parking; it is not
 * listed as a garage payment method. Garage patrons take their ticket with
 * them, pay at a first-level pay station, and use the validated ticket at the
 * exit. Pay stations accept cash, coin, and cards; exit stations accept cards
 * or a ticket already validated at a pay station.
 */
export type ParkingGarage = {
  slug: string;
  name: string;
  address: string;
  /** Garage coordinates from the canonical place record. */
  geom?: { lng: number; lat: number };
  /** All five City garages operate 24/7. */
  hours: string;
  payment: (
    | "cash"
    | "coin"
    | "credit-card"
    | "pay-station"
    | "pay-at-exit"
    | "monthly-permit"
    | "validated"
  )[];
  /** Verified against the City's published EV-charging list. */
  ev_charging?: boolean;
  hourly_rate?: string;
  capacity?: number;
  notes?: string;
};

/** Uniform rate schedule for all five City garages. */
export const PARKING_RATE_SCHEDULE = {
  hourly: "$1 / hour",
  dailyMax: "$12 / day",
  daytimeMax: "$12 max",
  nighttimeMax: "$5 max",
  freeWindow: "Free Sundays 8 AM – 2 PM",
  acceptsCashAndCredit: true,
  summary: "$1/hr · $12/day max · $5 max overnight · free Sun 8 AM–2 PM",
} as const;

export const PARKING_OFFICE = {
  address: "2 S Court St, Frederick, MD 21701",
  phone: "301-600-1429",
} as const;

export const PARKING_ACCESSIBILITY = [
  "A valid H/C tag or hangtag may use a regular on-street zone for twice the posted time at no charge.",
  "Short-term loading zones are reserved for loading from 6–10 AM; after 10 AM, the regular-zone allowance applies.",
  "No accessible parking is allowed in long-term loading-zone spaces.",
  "All five City garages are accessible and have H/C spaces on each level; prevailing garage rates still apply.",
] as const;

const GARAGE_PAYMENT: ParkingGarage["payment"] = [
  "cash",
  "coin",
  "credit-card",
  "pay-station",
  "pay-at-exit",
  "monthly-permit",
  "validated",
];

export const PARKING_GARAGES: ParkingGarage[] = [
  {
    slug: "west-patrick-street-parking-deck",
    name: "West Patrick Street Garage",
    address: "138 W Patrick St, Frederick, MD",
    geom: { lng: -77.4137744, lat: 39.4132628 },
    hours: "24/7",
    payment: [...GARAGE_PAYMENT],
    ev_charging: true,
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "On the west side of downtown beside the Frederick County Courthouse, with convenient access to West Patrick Street.",
  },
  {
    slug: "court-street-parking-garage-frederick",
    name: "Court Street Garage",
    address: "2 S Court St, Frederick, MD",
    geom: { lng: -77.4120474, lat: 39.4135367 },
    hours: "24/7",
    payment: [...GARAGE_PAYMENT],
    ev_charging: true,
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "A central choice for City Hall, the courthouse area, and the middle of Market Street.",
  },
  {
    slug: "carroll-creek-parking-garage-frederick",
    name: "Carroll Creek Garage",
    address: "44 E Patrick St, Frederick, MD",
    geom: { lng: -77.4096093, lat: 39.4134048 },
    hours: "24/7",
    payment: [...GARAGE_PAYMENT],
    ev_charging: true,
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "Next to the C. Burr Artz Library and a useful starting point for Carroll Creek and East Patrick Street.",
  },
  {
    slug: "church-street-garage",
    name: "Church Street Garage",
    address: "17 E Church St, Frederick, MD",
    geom: { lng: -77.4100809, lat: 39.4155064 },
    hours: "24/7",
    payment: [...GARAGE_PAYMENT],
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "Useful for the Weinberg Center, North Market Street, and the Church Street area.",
  },
  {
    slug: "east-all-saints-street-parking-garage",
    name: "East All Saints Street Garage",
    address: "125 E All Saints St, Frederick, MD",
    geom: { lng: -77.4072907, lat: 39.4118117 },
    hours: "24/7",
    payment: [...GARAGE_PAYMENT],
    ev_charging: true,
    hourly_rate: PARKING_RATE_SCHEDULE.summary,
    notes:
      "At East All Saints and South Carroll Streets, south of Carroll Creek.",
  },
];
