import type {
  FairGroundsMapFeature,
  FairGroundsMapFeaturePatch,
} from "@/lib/fair/grounds-map";
import {
  fairTransitStopServiceSummary,
  greatFrederickFair2026TransitReview,
  greatFrederickFair2026TransitStops,
} from "./great-frederick-fair-2026-transit";

const OFFICIAL_CHECKED_AT = "2026-09-04T06:04:00Z";
// Only the PDF's grounds map was re-reviewed for these corrections. Other
// visitor-page and transit review timestamps intentionally remain unchanged.
const SCHEDULE_MAP_CHECKED_AT = "2026-09-21T15:59:02Z";

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
  checkedAt: SCHEDULE_MAP_CHECKED_AT,
};

const vendorGuideInformationSource = {
  publisher: "The Great Frederick Fair",
  title: "2026 Vendor Guide",
  url: "https://thegreatfrederickfair.com/wp-content/uploads/2026/03/Vendor-Guide-2026.pdf",
  checkedAt: OFFICIAL_CHECKED_AT,
};

const transitInformationSource = {
  publisher: "Transit Services of Frederick County",
  title: "Published static GTFS and Transit Services",
  url: greatFrederickFair2026TransitReview.informationUrl,
  checkedAt: greatFrederickFair2026TransitReview.checkedAt,
};

const RESTROOM_IDS = [
  "osm-node-14099608982",
  "osm-way-103615600",
  "osm-way-1550204795",
  "osm-way-305093780",
  "osm-way-305093781",
  "osm-way-307321830",
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
      name: "Gate 1 · Pedestrians only",
      detail:
        "Gate 1 is pedestrian-only. The Fair allows special-needs unloading and loading outside this gate; follow current traffic signs and on-site directions.",
      keywords: [
        "pedestrian entrance",
        "accessible drop-off",
        "special needs",
        "unloading",
      ],
      informationSource: faqInformationSource,
      locationPrecision: "mapped-feature",
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-node-14099608931",
    properties: {
      name: "Gate 2 · Pedestrians only",
      detail:
        "Gate 2 is pedestrian-only on the 2026 Fair grounds map. Use Gate 3 for vehicle entry to infield parking and follow current on-site traffic signs.",
      keywords: ["pedestrian entrance", "pedestrians only", "monroe avenue"],
      informationSource: scheduleMapInformationSource,
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
      name: "Gate 4A · Pedestrians only",
      detail:
        "Gate 4A is pedestrian-only. Use its Highland Avenue pull-off for taxi, rideshare, or friend drop-off. The free ADA-compliant shuttle from the Monocacy Boulevard side of Lot D also arrives here.",
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
    targetId: "osm-node-14099608937",
    properties: {
      name: "Gate 4 · Exit only",
      detail:
        "Exit only. The 2026 Fair grounds map does not show Gate 4 as a visitor entrance. Use Gate 4A for pedestrian entry, pickup, or drop-off.",
      keywords: ["exit only", "not an entrance", "highland street"],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
      directionsEnabled: false,
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-node-14099608957",
    properties: {
      name: "Gate 5 · Exhibitors only",
      detail:
        "Exhibitors only. The 2026 Fair grounds map does not show Gate 5 as a public visitor entrance.",
      keywords: ["exhibitors only", "not a public entrance", "highland street"],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
      directionsEnabled: false,
      filterIds: ["arrival"],
    },
  },
  {
    targetId: "osm-node-3124269595",
    properties: {
      name: "Gate 6 · Closed",
      detail:
        "Closed. The 2026 Fair grounds map marks Gate 6 closed; do not use it as an arrival or exit point.",
      keywords: ["closed gate", "not an entrance", "not an exit"],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
      directionsEnabled: false,
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
      name: "Administration (Building 3)",
      scheduleAliases: [
        "bldg. 3",
        "building 3",
        "administration office",
        "admin building",
      ],
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
      filterIds: ["essentials"],
    },
  },
  {
    targetId: "osm-way-103615601",
    properties: {
      name: "Home Arts & Crafts (Building 9)",
      scheduleAliases: [
        "bldg. 9",
        "building 9",
        "the null bldg",
        "household building",
        "home arts and crafts",
      ],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-307321839",
    properties: {
      name: "Youth Indoor Exhibits (Building 12)",
      scheduleAliases: [
        "bldg. 12",
        "building 12",
        "youth building",
        "youth indoor exhibits",
        "4-h building",
      ],
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
      filterIds: ["essentials"],
    },
  },
  {
    targetId: "osm-way-307321854",
    properties: {
      name: "Homegrown Frederick (Building 13)",
      scheduleAliases: [
        "bldg. 13",
        "building 13",
        "homegrown building",
        "homegrown frederick",
      ],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-307321838",
    properties: {
      name: "Grandstand stage",
      scheduleAliases: [],
      detail:
        "The official grounds map shows this stage beside the Grandstand infield.",
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-307321843",
    properties: {
      name: "Dairy Office (Building 31)",
      scheduleAliases: ["dairy office", "bldg. 31", "building 31"],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-307321840",
    properties: {
      name: "Milking Parlor (Building 43)",
      scheduleAliases: ["milking parlor", "milking facility", "bldg. 43", "building 43"],
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
    },
  },
  {
    targetId: "osm-way-307321855",
    properties: {
      name: "Dairy Barns (Buildings 33–39)",
      scheduleAliases: [
        "dairy barns", "building 33", "building 34", "building 35",
        "building 36", "building 37", "building 38", "building 39",
      ],
      keywords: ["bldg. 33", "bldg. 34", "bldg. 35", "bldg. 36", "bldg. 37", "bldg. 38", "bldg. 39"],
      detail:
        "The official Fair map labels the dairy barns as Buildings 33 through 39. Radius shows their shared mapped area; use the building numbers on site to find an individual barn.",
      informationSource: scheduleMapInformationSource,
      locationPrecision: "mapped-feature",
      directionsEnabled: false,
    },
  },
  {
    targetId: "osm-way-307321850",
    properties: {
      name: "Restroom (Building 15)",
      scheduleAliases: ["bldg. 15", "building 15", "bathroom building 15"],
      detail:
        "The 2026 Fair map identifies this restroom as Building 15. First Aid is next to it inside Gate 3. The Fair also allows special-needs unloading and loading outside Building 15; follow on-site signs.",
      keywords: [
        "bathroom",
        "toilet",
        "diaper changing",
        "baby",
        "first aid",
        "accessible drop-off",
      ],
      informationSource: vendorGuideInformationSource,
      locationPrecision: "mapped-feature",
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

const transitFeatures: FairGroundsMapFeature[] =
  greatFrederickFair2026TransitStops.map((stop) =>
    pointFeature({
      id: `transit-stop-${stop.id}`,
      name: stop.name,
      kind: "transit",
      sourceUrl: greatFrederickFair2026TransitReview.sourceUrl,
      sourceUpdatedAt: null,
      scheduleAliases: [],
      anchor: [stop.longitude, stop.latitude],
      detail: `${fairTransitStopServiceSummary(stop)} The stop is about ${stop.distanceMeters} meters straight-line from the Fairgrounds; Radius has not verified the walking route or step-free access.`,
      keywords: ["bus", "transit", stop.routes, "fare free", "weekday service"],
      informationSource: transitInformationSource,
      locationPrecision: "static-transit-stop",
      directionsEnabled: true,
      filterIds: ["arrival"],
    }),
  );

const serviceFeatures: FairGroundsMapFeature[] = [
  pointFeature({
    id: "fair-service-first-aid-building-15",
    name: "First Aid near Building 15",
    kind: "service",
    sourceUrl: vendorGuideInformationSource.url,
    sourceUpdatedAt: null,
    scheduleAliases: [],
    // Reuse the reviewed Building 15 restroom anchor. The official Fair map
    // is schematic, so this is deliberately an area result without routing.
    anchor: [-77.3930768, 39.4120902],
    detail:
      "First Aid is next to Building 15, inside Gate 3, and is open during Fair hours. The official map is schematic, so follow First Aid signs when you reach this area.",
    keywords: ["medical", "emergency", "fire rescue", "building 15", "gate 3"],
    informationSource: vendorGuideInformationSource,
    locationPrecision: "published-area",
    directionsEnabled: false,
    filterIds: ["essentials"],
  }),
  pointFeature({
    id: "fair-service-information-gate-4a",
    name: "Information booth near Gate 4A",
    kind: "service",
    sourceUrl: scheduleMapInformationSource.url,
    sourceUpdatedAt: null,
    scheduleAliases: [],
    // Reuse the reviewed Gate 4A anchor; the publisher map does not provide
    // survey-grade booth coordinates.
    anchor: [-77.3936558, 39.4137365],
    detail:
      "The official 2026 Fair map marks an information booth in the Gate 4A entrance area. Volunteers can help with schedules and finding places; follow the orange INFO signs.",
    keywords: ["info", "visitor center", "help", "schedule", "volunteer"],
    informationSource: scheduleMapInformationSource,
    locationPrecision: "published-area",
    directionsEnabled: false,
    filterIds: ["essentials"],
  }),
  pointFeature({
    id: "fair-service-information-administration",
    name: "Information booth near Administration",
    kind: "service",
    sourceUrl: scheduleMapInformationSource.url,
    sourceUpdatedAt: null,
    scheduleAliases: [],
    // Reuse the reviewed Administration anchor for the published Gate 1 side
    // service area; on-site INFO signs remain authoritative.
    anchor: [-77.3954764, 39.411424874999994],
    detail:
      "The official 2026 Fair map marks an information booth in the Administration and Family Care area on the Gate 1 side. Follow the orange INFO signs for the exact booth.",
    keywords: [
      "info",
      "visitor center",
      "help",
      "schedule",
      "gate 1",
      "family care",
    ],
    informationSource: scheduleMapInformationSource,
    locationPrecision: "published-area",
    directionsEnabled: false,
    filterIds: ["essentials"],
  }),
];

const showAreaFeatures: FairGroundsMapFeature[] = [
  pointFeature({
    id: "fair-service-funky-joes-free-stage",
    name: "Funky Joe's Free Stage",
    kind: "stage",
    sourceUrl: scheduleMapInformationSource.url,
    sourceUpdatedAt: null,
    scheduleAliases: [
      "free stage", "funky joe's bandwagon stage", "funky joes bandwagon",
      "funky joe's band wagon stage", "resthaven rest area", "resthaven area",
    ],
    // Reuse the reviewed Building 9 anchor to identify the published area.
    // The PDF shows the stage between 9 and 12, not at the infield stage.
    // It does not supply a surveyed coordinate or a verified walking route.
    anchor: [-77.39419534285715, 39.41131661428572],
    detail:
      "Funky Joe's Bandwagon Stage is in the Resthaven area between Home Arts & Crafts (Building 9) and Youth Indoor Exhibits (Building 12). This marks the published area, not an exact stage entrance. Follow on-site signs.",
    keywords: ["music", "free stage", "funky joe", "resthaven", "bandwagon", "faith at the fair"],
    informationSource: scheduleMapInformationSource,
    locationPrecision: "published-area",
    directionsEnabled: false,
  }),
];

export const greatFrederickFair2026MapAdditions: FairGroundsMapFeature[] = [
  ...parkingFeatures,
  ...transitFeatures,
  ...serviceFeatures,
  ...showAreaFeatures,
];
