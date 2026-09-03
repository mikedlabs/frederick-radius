import type {
  FairGroundsMapFeature,
  FairGroundsMapFeaturePatch,
} from "@/lib/fair/grounds-map";

const OFFICIAL_CHECKED_AT = "2026-09-03T02:10:47Z";
const GTFS_CHECKED_AT = "2026-09-03T02:08:00Z";

const parkingInformationSource = {
  publisher: "The Great Frederick Fair",
  title: "Plan Your Visit",
  url: "https://thegreatfrederickfair.com/plan-your-visit/",
  checkedAt: OFFICIAL_CHECKED_AT,
};

const faqInformationSource = {
  publisher: "The Great Frederick Fair",
  title: "FAQ",
  url: "https://thegreatfrederickfair.com/faq/",
  checkedAt: OFFICIAL_CHECKED_AT,
};

const guestServicesInformationSource = {
  publisher: "The Great Frederick Fair",
  title: "Guest Services",
  url: "https://thegreatfrederickfair.com/guest-services/",
  checkedAt: OFFICIAL_CHECKED_AT,
};

const scheduleMapInformationSource = {
  publisher: "The Great Frederick Fair",
  title: "2026 Schedule of Events grounds map",
  url: "https://thegreatfrederickfair.com/wp-content/uploads/2026/08/2026-GFF-SoE_website.pdf",
  checkedAt: OFFICIAL_CHECKED_AT,
};

const transitInformationSource = {
  publisher: "Transit Services of Frederick County",
  title: "Published static GTFS and Transit Services",
  url: "https://www.frederickcountymd.gov/105/Transit-Services",
  checkedAt: GTFS_CHECKED_AT,
};

const RESTROOM_IDS = [
  "osm-node-14099608982",
  "osm-way-103615600",
  "osm-way-1550204795",
  "osm-way-305093780",
  "osm-way-305093781",
  "osm-way-307321830",
  "osm-way-307321850",
];

/**
 * Original Radius annotations over reviewed OpenStreetMap geometry. These add
 * current visitor facts and search language without copying another map's
 * artwork or treating a schematic location as survey-grade geometry.
 */
export const greatFrederickFair2026MapPatches: FairGroundsMapFeaturePatch[] = [
  {
    targetId: "osm-node-14099608925",
    properties: {
      detail:
        "The Fair lists Gate 1 as a special-needs unloading location. Follow current traffic signs and on-site directions.",
      keywords: ["accessible drop-off", "special needs", "unloading"],
      informationSource: faqInformationSource,
      locationPrecision: "mapped-feature",
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-node-14099608935",
    properties: {
      anchor: [-77.391895, 39.411782],
      detail:
        "Use Gate 3 for infield parking. Parking is $15 per vehicle and accepts cash or credit card. The Fair directs special-needs vehicles here; accessible spaces are first come with a proper placard or plate.",
      keywords: [
        "infield parking",
        "$15 parking",
        "cash",
        "credit card",
        "accessible parking",
        "special needs",
      ],
      informationSource: parkingInformationSource,
      locationPrecision: "official-pin",
      directionsEnabled: true,
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-node-14099608940",
    properties: {
      detail:
        "Use the Gate 4A pull-off for taxi, rideshare, or friend drop-off. The free ADA-compliant shuttle from the Monocacy Boulevard side of Lot D also arrives here.",
      keywords: [
        "rideshare",
        "uber",
        "lyft",
        "taxi",
        "drop-off",
        "pickup",
        "accessible shuttle",
        "lot d shuttle",
      ],
      informationSource: faqInformationSource,
      locationPrecision: "mapped-feature",
      directionsEnabled: true,
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-way-103615596",
    properties: {
      detail:
        "Evening musical performances have an ASL interpreter audience-left. The Fair identifies Track Right and Grandstand sections C through F for the best view.",
      keywords: [
        "asl",
        "sign language",
        "interpreter",
        "hearing accommodation",
        "concert",
      ],
      informationSource: faqInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-1550204781",
    properties: {
      anchor: [-77.394916, 39.409986],
      detail:
        "The official Lot A entrance pin is on Franklin Street. Parking opens at 9 AM and costs $10 per vehicle, cash only. Designated accessible parking is subject to availability.",
      keywords: [
        "lot a",
        "franklin street",
        "$10 parking",
        "cash only",
        "accessible parking",
      ],
      informationSource: parkingInformationSource,
      locationPrecision: "official-pin",
      directionsEnabled: true,
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-way-305093779",
    properties: {
      detail:
        "The Family Care Station and Security Trailer are across from Administration near the midway entrance. Security handles lost people and property.",
      keywords: [
        "family care",
        "nursing",
        "diaper changing",
        "security",
        "lost and found",
        "lost person",
      ],
      informationSource: faqInformationSource,
      locationPrecision: "published-area",
    },
  },
  {
    targetId: "osm-way-307321839",
    properties: {
      detail:
        "Rentals in the published area between Building 12 and Homegrown Building 13: scooters $10/hour, manual wheelchairs $25/day, and strollers, wagons, or push cars $20/day. They are first come; a driver's license is required.",
      keywords: [
        "mobility rental",
        "scooter",
        "wheelchair",
        "stroller",
        "wagon",
        "push car",
      ],
      informationSource: guestServicesInformationSource,
      locationPrecision: "published-area",
    },
  },
  ...[
    "osm-way-1548624421",
    "osm-way-1550204782",
    "osm-way-307321832",
    "osm-way-307321842",
    "osm-way-307321846",
    "osm-way-307321847",
    "osm-way-307321848",
    "osm-way-307321849",
  ].map((targetId) => ({
    targetId,
    properties: {
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature" as const,
    },
  })),
  ...RESTROOM_IDS.map((targetId) => ({
    targetId,
    properties: {
      detail:
        "The Fair says all public restrooms have diaper-changing stations. Follow current on-site signs for availability.",
      keywords: ["bathroom", "toilet", "diaper changing", "baby"],
      informationSource: faqInformationSource,
      locationPrecision: "mapped-feature" as const,
    },
  })),
];

function pointFeature(
  properties: FairGroundsMapFeature["properties"],
): FairGroundsMapFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: properties.anchor },
    properties,
  };
}

const parkingFeatures: FairGroundsMapFeature[] = [
  pointFeature({
    id: "fair-arrival-lot-b",
    name: "Lot B entrance",
    kind: "parking",
    sourceUrl: "https://maps.app.goo.gl/HPHtRa2FWB7oHBDq8",
    sourceUpdatedAt: null,
    scheduleAliases: [],
    anchor: [-77.3933, 39.41434],
    detail:
      "The official Lot B entrance pin is on Highland Street. Parking opens at 9 AM and costs $10 per vehicle, cash only. Designated accessible parking is subject to availability.",
    keywords: ["lot b", "highland street", "$10 parking", "cash only", "accessible parking"],
    informationSource: parkingInformationSource,
    locationPrecision: "official-pin",
    directionsEnabled: true,
    filterIds: ["arrival"],
  }),
  pointFeature({
    id: "fair-arrival-lot-c",
    name: "Lot C entrance",
    kind: "parking",
    sourceUrl: "https://maps.app.goo.gl/XKwuHkebkE4PRkjy5",
    sourceUpdatedAt: null,
    scheduleAliases: [],
    anchor: [-77.393121, 39.414249],
    detail:
      "The official Lot C entrance pin is on Highland Street. Parking opens at 9 AM and costs $10 per vehicle, cash only. Designated accessible parking is subject to availability.",
    keywords: ["lot c", "highland street", "$10 parking", "cash only", "accessible parking"],
    informationSource: parkingInformationSource,
    locationPrecision: "official-pin",
    directionsEnabled: true,
    filterIds: ["arrival"],
  }),
  pointFeature({
    id: "fair-arrival-lot-d-monroe",
    name: "Lot D entrance on Monroe Avenue",
    kind: "parking",
    sourceUrl: "https://maps.app.goo.gl/N2FJkuXQu7CAmoGZ7",
    sourceUpdatedAt: null,
    scheduleAliases: [],
    anchor: [-77.391017, 39.412496],
    detail:
      "This is the official Monroe Avenue entrance pin for Lot D. Parking opens at 9 AM and costs $10 per vehicle, cash only. The free ADA-compliant shuttle boards on the Monocacy Boulevard side.",
    keywords: [
      "lot d",
      "monroe avenue",
      "$10 parking",
      "cash only",
      "accessible parking",
      "ada shuttle",
      "gate 4a",
    ],
    informationSource: parkingInformationSource,
    locationPrecision: "official-pin",
    directionsEnabled: true,
    filterIds: ["arrival"],
  }),
  pointFeature({
    id: "fair-arrival-lot-d-monocacy",
    name: "Lot D entrance on Monocacy Boulevard",
    kind: "parking",
    sourceUrl: "https://maps.app.goo.gl/5T7jEAznm3niAUnC8",
    sourceUpdatedAt: null,
    scheduleAliases: [],
    anchor: [-77.386472, 39.410483],
    detail:
      "This is the official Monocacy Boulevard entrance pin for Lot D. Parking opens at 9 AM and costs $10 per vehicle, cash only. A free ADA-compliant shuttle runs frequently to Gate 4A.",
    keywords: [
      "lot d",
      "monocacy boulevard",
      "$10 parking",
      "cash only",
      "accessible parking",
      "ada shuttle",
      "gate 4a",
    ],
    informationSource: parkingInformationSource,
    locationPrecision: "official-pin",
    directionsEnabled: true,
    filterIds: ["arrival"],
  }),
];

const transitFeatures: FairGroundsMapFeature[] = [
  {
    id: "163112",
    name: "Monroe Avenue across from FCC Monroe Center",
    longitude: -77.39042922,
    latitude: 39.41344959,
    routes: "East Frederick Shuttle",
    distance: 165,
    service:
      "Weekdays only during the Fair, with published departures from 9:05 AM through 6:05 PM. This route does not run on Fair Saturdays or Sunday.",
  },
  {
    id: "163103",
    name: "Monroe Avenue at FCC Monroe Center",
    longitude: -77.38991584,
    latitude: 39.41379112,
    routes: "East Frederick Shuttle",
    distance: 223,
    service:
      "Weekdays only during the Fair, with published departures from 8:20 AM through 5:20 PM. This route does not run on Fair Saturdays or Sunday.",
  },
  {
    id: "162919",
    name: "East Patrick Street at Hamilton Avenue",
    longitude: -77.39602587,
    latitude: 39.41139132,
    routes: "Route 15",
    distance: 375,
    service:
      "Weekdays only during the Fair, with hourly published Route 15 departures from 6:18 AM through 9:18 PM. Route 15 does not run on Fair Saturdays or Sunday.",
  },
  {
    id: "163111",
    name: "Monocacy Boulevard at Bucheimer Road",
    longitude: -77.38699611,
    latitude: 39.40903282,
    routes: "East Frederick Shuttle",
    distance: 571,
    service:
      "Weekdays only during the Fair, with seven explicit published departures from 9:02 AM through 5:02 PM. This route does not run on Fair Saturdays or Sunday.",
  },
  {
    id: "162918",
    name: "East Patrick Street at Fairground Center",
    longitude: -77.39916882,
    latitude: 39.41301244,
    routes: "Route 15",
    distance: 627,
    service:
      "Weekdays only during the Fair, with hourly published Route 15 departures from 6:17 AM through 9:17 PM. Route 15 does not run on Fair Saturdays or Sunday.",
  },
].map(({ id, name, longitude, latitude, routes, distance, service }) =>
  pointFeature({
    id: `transit-stop-${id}`,
    name: String(name),
    kind: "transit",
    sourceUrl: "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip",
    sourceUpdatedAt: null,
    scheduleAliases: [],
    anchor: [Number(longitude), Number(latitude)],
    detail: `${service} The stop is about ${distance} meters straight-line from the Fairgrounds; Radius has not verified the walking route or step-free access.`,
    keywords: ["bus", "transit", routes, "fare free", "weekday service"],
    informationSource: transitInformationSource,
    locationPrecision: "static-transit-stop",
    directionsEnabled: true,
    filterIds: ["arrival"],
  }),
);

export const greatFrederickFair2026MapAdditions: FairGroundsMapFeature[] = [
  ...parkingFeatures,
  ...transitFeatures,
];
