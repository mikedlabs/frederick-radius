const FAIR_DATES = [
  "2026-09-18",
  "2026-09-19",
  "2026-09-20",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
] as const;

const PUBLISHED_SERVICE_DATES = [
  "2026-09-18",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
] as const;

const PUBLISHED_NO_SERVICE_DATES = [
  "2026-09-19",
  "2026-09-20",
  "2026-09-26",
] as const;

export type GreatFrederickFairTransitStop = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  routes: string;
  distanceMeters: number;
  publishedWeekdayService: string;
};

export type GreatFrederickFairTransitReview = {
  status: "published-static-fair-service" | "unconfirmed";
  checkedAt: string;
  feedWindow: { startsOn: string; endsOn: string };
  snapshotSha256: string;
  sourceUrl: string;
  informationUrl: string;
  publishedServiceDates: readonly string[];
  publishedNoServiceDates: readonly string[];
};

export const greatFrederickFair2026TransitReview: GreatFrederickFairTransitReview = {
  status: "published-static-fair-service",
  checkedAt: "2026-09-04T06:04:00Z",
  feedWindow: { startsOn: "2026-09-03", endsOn: "2026-10-04" },
  snapshotSha256:
    "550a04b4ad2aca909dc0a0dbc238f9fa0f4d63a1148edc4e217af7d8307de3ed",
  sourceUrl: "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip",
  informationUrl: "https://www.frederickcountymd.gov/105/Transit-Services",
  publishedServiceDates: PUBLISHED_SERVICE_DATES,
  publishedNoServiceDates: PUBLISHED_NO_SERVICE_DATES,
};

export const greatFrederickFair2026TransitStops: readonly GreatFrederickFairTransitStop[] = [
  {
    id: "163112",
    name: "Monroe Avenue across from FCC Monroe Center",
    longitude: -77.39042922,
    latitude: 39.41344959,
    routes: "East Frederick Shuttle",
    distanceMeters: 165,
    publishedWeekdayService:
      "seven explicit published departures from 9:05 AM through 5:05 PM",
  },
  {
    id: "163103",
    name: "Monroe Avenue at FCC Monroe Center",
    longitude: -77.38991584,
    latitude: 39.41379112,
    routes: "East Frederick Shuttle",
    distanceMeters: 223,
    publishedWeekdayService: "published departures from 8:20 AM through 5:20 PM",
  },
  {
    id: "162919",
    name: "East Patrick Street at Hamilton Avenue",
    longitude: -77.39602587,
    latitude: 39.41139132,
    routes: "Route 15",
    distanceMeters: 375,
    publishedWeekdayService:
      "hourly published Route 15 departures from 6:18 AM through 9:18 PM",
  },
  {
    id: "163111",
    name: "Monocacy Boulevard at Bucheimer Road",
    longitude: -77.38699611,
    latitude: 39.40903282,
    routes: "East Frederick Shuttle",
    distanceMeters: 571,
    publishedWeekdayService:
      "seven explicit published departures from 9:02 AM through 5:02 PM",
  },
  {
    id: "162918",
    name: "East Patrick Street at Fairground Center",
    longitude: -77.39916882,
    latitude: 39.41301244,
    routes: "Route 15",
    distanceMeters: 627,
    publishedWeekdayService:
      "hourly published Route 15 departures from 6:17 AM through 9:17 PM",
  },
];

export function reviewSupportsFullFairService(
  review: GreatFrederickFairTransitReview,
): boolean {
  if (
    review.status !== "published-static-fair-service" ||
    review.feedWindow.startsOn > FAIR_DATES[0] ||
    review.feedWindow.endsOn < FAIR_DATES.at(-1)!
  ) {
    return false;
  }
  const resolvedDates = new Set([
    ...review.publishedServiceDates,
    ...review.publishedNoServiceDates,
  ]);
  return FAIR_DATES.every((date) => resolvedDates.has(date));
}

export function fairTransitStopServiceSummary(
  stop: GreatFrederickFairTransitStop,
  review: GreatFrederickFairTransitReview = greatFrederickFair2026TransitReview,
): string {
  if (!reviewSupportsFullFairService(review)) {
    return `${stop.routes} is associated with this stop, but Fair-date service and departure times are not confirmed.`;
  }
  return `Weekdays only during the Fair, with ${stop.publishedWeekdayService}. The reviewed feed does not publish ${stop.routes} service here on Fair Saturdays or Sunday.`;
}

export function fairTransitTravelSummary(
  review: GreatFrederickFairTransitReview = greatFrederickFair2026TransitReview,
): string {
  const fairgroundCenter = greatFrederickFair2026TransitStops.find(
    (stop) => stop.id === "162918",
  )!;
  return `${fairgroundCenter.name}: ${fairTransitStopServiceSummary(fairgroundCenter, review)} This is a static published timetable, not a live arrival prediction.`;
}

export function fairTransitDateStatus(
  date: string,
  review: GreatFrederickFairTransitReview = greatFrederickFair2026TransitReview,
): { kind: "service" | "no-service" | "unconfirmed"; detail: string } {
  if (!reviewSupportsFullFairService(review) || !FAIR_DATES.includes(date as (typeof FAIR_DATES)[number])) {
    return {
      kind: "unconfirmed",
      detail: "Fair-date service and departure times are not confirmed.",
    };
  }
  if (review.publishedServiceDates.includes(date)) {
    return {
      kind: "service",
      detail: `For this Fair day, the reviewed static feed publishes ${greatFrederickFair2026TransitStops[4].publishedWeekdayService} at East Patrick Street at Fairground Center. These are scheduled times, not live arrivals.`,
    };
  }
  return {
    kind: "no-service",
    detail:
      "For this Fair day, the reviewed static feed does not publish East Frederick Shuttle or Route 15 service at the five nearby stops shown on the Fair map.",
  };
}
