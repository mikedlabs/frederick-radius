const DAY_MS = 24 * 60 * 60 * 1_000;

export const TRANSIT_SNAPSHOT_MAX_AGE_DAYS = 14;
export const MARC_SNAPSHOT_MAX_AGE_DAYS = 45;

// This is deliberately wider than Frederick County. It catches zeroes,
// swapped coordinates, and distant feed contamination without rejecting a
// legitimate stop just across the county line.
const FREDERICK_REGION = {
  minLat: 39.15,
  maxLat: 39.8,
  minLng: -77.8,
  maxLng: -77.1,
};

export type TransitValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type FrederickTransitArtifacts = {
  transit: unknown;
  network: unknown;
  trips: unknown;
};

export type MarcStationStop = {
  id: string;
  lat: number;
  lng: number;
};

export type MarcGtfsRows = {
  routes: readonly Record<string, string>[];
  stops: readonly Record<string, string>[];
  trips: readonly Record<string, string>[];
  stopTimes: readonly Record<string, string>[];
  calendar: readonly Record<string, string>[];
  calendarDates: readonly Record<string, string>[];
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dateOnlyUtc(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

function gtfsDateUtc(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  return dateOnlyUtc(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
  );
}

function utcDay(now: Date): number {
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
}

function coordinateIsValid(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number"
    && Number.isFinite(lat)
    && typeof lng === "number"
    && Number.isFinite(lng)
    && lat >= FREDERICK_REGION.minLat
    && lat <= FREDERICK_REGION.maxLat
    && lng >= FREDERICK_REGION.minLng
    && lng <= FREDERICK_REGION.maxLng
  );
}

function validateSnapshotDate(
  issues: TransitValidationIssue[],
  value: unknown,
  path: string,
  now: Date,
  maxAgeDays: number,
): number | null {
  const parsed = dateOnlyUtc(value);
  if (parsed === null) {
    issues.push({
      code: "invalid_snapshot_date",
      path,
      message: "Snapshot date must be a real YYYY-MM-DD UTC date.",
    });
    return null;
  }
  const age = utcDay(now) - parsed;
  if (age < -DAY_MS) {
    issues.push({
      code: "future_snapshot",
      path,
      message: "Snapshot date is more than one day in the future.",
    });
  } else if (age > maxAgeDays * DAY_MS) {
    issues.push({
      code: "stale_snapshot",
      path,
      message: `Snapshot is older than ${maxAgeDays} days.`,
    });
  }
  return parsed;
}

function validatePointList(
  issues: TransitValidationIssue[],
  value: unknown,
  path: string,
): void {
  const points = rows(value);
  if (points.length < 2) {
    issues.push({
      code: "missing_shape_points",
      path,
      message: "A route shape must contain at least two points.",
    });
    return;
  }
  points.forEach((point, index) => {
    const pair = Array.isArray(point) ? point : [];
    if (!coordinateIsValid(pair[0], pair[1])) {
      issues.push({
        code: "invalid_coordinate",
        path: `${path}[${index}]`,
        message: "Shape coordinate is outside the Frederick region or invalid.",
      });
    }
  });
}

export function validateFrederickTransitArtifacts(
  artifacts: FrederickTransitArtifacts,
  now = new Date(),
): TransitValidationIssue[] {
  const issues: TransitValidationIssue[] = [];
  const transit = record(artifacts.transit);
  const network = record(artifacts.network);
  const trips = record(artifacts.trips);
  const staticFeed = record(transit.staticFeed);

  const generatedAt = validateSnapshotDate(
    issues,
    transit.generatedAt,
    "transit.generatedAt",
    now,
    TRANSIT_SNAPSHOT_MAX_AGE_DAYS,
  );
  const fetchedOn = validateSnapshotDate(
    issues,
    staticFeed.fetchedOn,
    "transit.staticFeed.fetchedOn",
    now,
    TRANSIT_SNAPSHOT_MAX_AGE_DAYS,
  );
  if (
    generatedAt !== null
    && fetchedOn !== null
    && generatedAt !== fetchedOn
  ) {
    issues.push({
      code: "metadata_mismatch",
      path: "transit.staticFeed.fetchedOn",
      message: "Fetched date must match the generated artifact date.",
    });
  }

  const serviceStart = dateOnlyUtc(staticFeed.serviceWindowStart);
  const serviceEnd = dateOnlyUtc(staticFeed.serviceWindowEnd);
  if (serviceStart === null || serviceEnd === null) {
    issues.push({
      code: "invalid_service_window",
      path: "transit.staticFeed",
      message: "Static feed must publish real service-window dates.",
    });
  } else {
    if (serviceStart > serviceEnd) {
      issues.push({
        code: "invalid_service_window",
        path: "transit.staticFeed",
        message: "Service-window start is after its end.",
      });
    }
    if (serviceEnd < utcDay(now)) {
      issues.push({
        code: "expired_calendar",
        path: "transit.staticFeed.serviceWindowEnd",
        message: "The committed TransIT service calendar has expired.",
      });
    }
    if (
      fetchedOn !== null
      && (fetchedOn < serviceStart || fetchedOn > serviceEnd)
    ) {
      issues.push({
        code: "snapshot_outside_service_window",
        path: "transit.staticFeed.fetchedOn",
        message: "Fetched date is outside the advertised service window.",
      });
    }
  }

  const routeIds = new Set<string>();
  for (const [index, value] of rows(transit.routes).entries()) {
    const route = record(value);
    const id = typeof route.id === "string" ? route.id.trim() : "";
    if (!id || routeIds.has(id)) {
      issues.push({
        code: "invalid_route_id",
        path: `transit.routes[${index}].id`,
        message: id ? "Route id is duplicated." : "Route id is missing.",
      });
    } else {
      routeIds.add(id);
    }
  }

  const stopIds = new Set<string>();
  for (const [index, value] of rows(transit.stops).entries()) {
    const stop = record(value);
    const id = String(stop.id ?? "").trim();
    if (!id || stopIds.has(id)) {
      issues.push({
        code: "invalid_stop_id",
        path: `transit.stops[${index}].id`,
        message: id ? "Stop id is duplicated." : "Stop id is missing.",
      });
    } else {
      stopIds.add(id);
    }
    if (!coordinateIsValid(stop.lat, stop.lng)) {
      issues.push({
        code: "invalid_coordinate",
        path: `transit.stops[${index}]`,
        message: "Stop coordinate is outside the Frederick region or invalid.",
      });
    }
  }

  const shapes = record(transit.shapes);
  for (const [routeId, points] of Object.entries(shapes)) {
    if (!routeIds.has(routeId)) {
      issues.push({
        code: "unknown_route_reference",
        path: `transit.shapes.${routeId}`,
        message: "Shape references a route that is not published.",
      });
    }
    validatePointList(issues, points, `transit.shapes.${routeId}`);
  }

  const variantsByRoute = record(network.shapeVariants);
  const variantIdsByRoute = new Map<string, Set<string>>();
  for (const [routeId, value] of Object.entries(variantsByRoute)) {
    if (!routeIds.has(routeId)) {
      issues.push({
        code: "unknown_route_reference",
        path: `network.shapeVariants.${routeId}`,
        message: "Shape variants reference a route that is not published.",
      });
    }
    const variantIds = new Set<string>();
    rows(value).forEach((variantValue, index) => {
      const variant = record(variantValue);
      const id = typeof variant.id === "string" ? variant.id.trim() : "";
      if (!id || variantIds.has(id)) {
        issues.push({
          code: "invalid_shape_id",
          path: `network.shapeVariants.${routeId}[${index}].id`,
          message: id ? "Shape id is duplicated for its route." : "Shape id is missing.",
        });
      } else {
        variantIds.add(id);
      }
      validatePointList(
        issues,
        variant.points,
        `network.shapeVariants.${routeId}[${index}].points`,
      );
    });
    variantIdsByRoute.set(routeId, variantIds);
  }

  const servedRouteIds = new Set<string>();
  for (const [stopId, routeValue] of Object.entries(record(network.stopRoutes))) {
    if (!stopIds.has(stopId)) {
      issues.push({
        code: "unknown_stop_reference",
        path: `network.stopRoutes.${stopId}`,
        message: "Stop-to-route index references a stop that is not published.",
      });
    }
    const seenRouteIds = new Set<string>();
    for (const [index, routeIdValue] of rows(routeValue).entries()) {
      const routeId = typeof routeIdValue === "string" ? routeIdValue : "";
      if (!routeIds.has(routeId)) {
        issues.push({
          code: "unknown_route_reference",
          path: `network.stopRoutes.${stopId}[${index}]`,
          message: "Stop-to-route index references an unknown route.",
        });
      } else {
        servedRouteIds.add(routeId);
      }
      if (seenRouteIds.has(routeId)) {
        issues.push({
          code: "duplicate_route_reference",
          path: `network.stopRoutes.${stopId}[${index}]`,
          message: "Stop-to-route index contains a duplicate route.",
        });
      }
      seenRouteIds.add(routeId);
    }
  }

  for (const routeId of routeIds) {
    if (!Object.hasOwn(shapes, routeId)) {
      issues.push({
        code: "missing_route_shape",
        path: `transit.shapes.${routeId}`,
        message: "Published route has no representative shape.",
      });
    }
    if ((variantIdsByRoute.get(routeId)?.size ?? 0) === 0) {
      issues.push({
        code: "missing_route_shape",
        path: `network.shapeVariants.${routeId}`,
        message: "Published route has no shape variants.",
      });
    }
    if (!servedRouteIds.has(routeId)) {
      issues.push({
        code: "missing_route_stops",
        path: `network.stopRoutes.${routeId}`,
        message: "Published route is not referenced by any served stop.",
      });
    }
  }

  for (const [tripId, tripValue] of Object.entries(trips)) {
    const trip = record(tripValue);
    const routeId = typeof trip.routeId === "string" ? trip.routeId : "";
    const shapeId = typeof trip.shapeId === "string" ? trip.shapeId : "";
    if (!routeIds.has(routeId)) {
      issues.push({
        code: "unknown_route_reference",
        path: `trips.${tripId}.routeId`,
        message: "Trip references an unknown route.",
      });
    }
    if (shapeId && !variantIdsByRoute.get(routeId)?.has(shapeId)) {
      issues.push({
        code: "unknown_shape_reference",
        path: `trips.${tripId}.shapeId`,
        message: "Trip references a shape missing from its route.",
      });
    }
    if (typeof trip.serviceId !== "string" || !trip.serviceId.trim()) {
      issues.push({
        code: "missing_service_reference",
        path: `trips.${tripId}.serviceId`,
        message: "Trip has no static-calendar service id.",
      });
    }
  }

  return issues;
}

function marcServiceWindow(schedule: Record<string, unknown>): {
  start: number | null;
  end: number | null;
} {
  let start: number | null = null;
  let end: number | null = null;
  for (const value of Object.values(record(schedule.calendar))) {
    const calendar = record(value);
    const rowStart = gtfsDateUtc(calendar.start);
    const rowEnd = gtfsDateUtc(calendar.end);
    if (rowStart !== null) start = start === null ? rowStart : Math.min(start, rowStart);
    if (rowEnd !== null) end = end === null ? rowEnd : Math.max(end, rowEnd);
  }
  for (const date of Object.keys(record(schedule.exceptions))) {
    const parsed = gtfsDateUtc(date);
    if (parsed !== null) {
      start = start === null ? parsed : Math.min(start, parsed);
      end = end === null ? parsed : Math.max(end, parsed);
    }
  }
  return { start, end };
}

export function validateMarcScheduleArtifact(
  scheduleValue: unknown,
  stationStops: readonly MarcStationStop[],
  now = new Date(),
): TransitValidationIssue[] {
  const issues: TransitValidationIssue[] = [];
  const schedule = record(scheduleValue);
  const staticFeed = record(schedule.staticFeed);
  const generatedAt = validateSnapshotDate(
    issues,
    schedule.generatedAt,
    "marc.generatedAt",
    now,
    MARC_SNAPSHOT_MAX_AGE_DAYS,
  );
  const fetchedOn = validateSnapshotDate(
    issues,
    staticFeed.fetchedOn,
    "marc.staticFeed.fetchedOn",
    now,
    MARC_SNAPSHOT_MAX_AGE_DAYS,
  );
  if (
    generatedAt !== null
    && fetchedOn !== null
    && generatedAt !== fetchedOn
  ) {
    issues.push({
      code: "metadata_mismatch",
      path: "marc.staticFeed.fetchedOn",
      message: "Fetched date must match the generated artifact date.",
    });
  }

  const calendar = record(schedule.calendar);
  for (const [serviceId, value] of Object.entries(calendar)) {
    const service = record(value);
    const start = gtfsDateUtc(service.start);
    const end = gtfsDateUtc(service.end);
    const days = rows(service.days);
    if (start === null || end === null || start > end) {
      issues.push({
        code: "invalid_service_window",
        path: `marc.calendar.${serviceId}`,
        message: "Calendar service has invalid GTFS dates.",
      });
    }
    if (
      days.length !== 7
      || days.some((day) => day !== 0 && day !== 1)
    ) {
      issues.push({
        code: "invalid_service_days",
        path: `marc.calendar.${serviceId}.days`,
        message: "Calendar service must contain seven zero-or-one day flags.",
      });
    }
  }

  const computedWindow = marcServiceWindow(schedule);
  const metadataStart = dateOnlyUtc(staticFeed.serviceWindowStart);
  const metadataEnd = dateOnlyUtc(staticFeed.serviceWindowEnd);
  if (computedWindow.start === null || computedWindow.end === null) {
    issues.push({
      code: "invalid_service_window",
      path: "marc.calendar",
      message: "MARC schedule has no valid service calendar window.",
    });
  } else {
    if (computedWindow.end < utcDay(now)) {
      issues.push({
        code: "expired_calendar",
        path: "marc.calendar",
        message: "The committed MARC service calendar has expired.",
      });
    }
    if (
      metadataStart !== computedWindow.start
      || metadataEnd !== computedWindow.end
    ) {
      issues.push({
        code: "metadata_mismatch",
        path: "marc.staticFeed",
        message: "Published MARC service window does not match its calendars.",
      });
    }
  }

  const requiredStopIds = new Set<string>();
  stationStops.forEach((stop, index) => {
    if (!stop.id || requiredStopIds.has(stop.id)) {
      issues.push({
        code: "invalid_stop_id",
        path: `marc.stationStops[${index}].id`,
        message: stop.id ? "Station stop id is duplicated." : "Station stop id is missing.",
      });
    }
    requiredStopIds.add(stop.id);
    if (!coordinateIsValid(stop.lat, stop.lng)) {
      issues.push({
        code: "invalid_coordinate",
        path: `marc.stationStops[${index}]`,
        message: "MARC station coordinate is invalid or outside the region.",
      });
    }
  });

  const exceptionAdded = new Set<string>();
  for (const [date, value] of Object.entries(record(schedule.exceptions))) {
    if (gtfsDateUtc(date) === null) {
      issues.push({
        code: "invalid_exception_date",
        path: `marc.exceptions.${date}`,
        message: "Calendar exception key must be a real GTFS date.",
      });
    }
    for (const serviceId of rows(record(value).added)) {
      if (typeof serviceId === "string") exceptionAdded.add(serviceId);
    }
    for (const serviceId of rows(record(value).removed)) {
      if (typeof serviceId !== "string" || !Object.hasOwn(calendar, serviceId)) {
        issues.push({
          code: "missing_service_reference",
          path: `marc.exceptions.${date}.removed`,
          message: "Removed exception references an unknown calendar service.",
        });
      }
    }
  }

  const stops = record(schedule.stops);
  let departureCount = 0;
  for (const [stopId, value] of Object.entries(stops)) {
    if (!requiredStopIds.has(stopId)) {
      issues.push({
        code: "unknown_stop_reference",
        path: `marc.stops.${stopId}`,
        message: "Schedule references a stop outside the county station set.",
      });
    }
    let previousMinute = -Infinity;
    rows(value).forEach((departureValue, index) => {
      departureCount += 1;
      const departure = record(departureValue);
      const serviceId = typeof departure.svc === "string" ? departure.svc : "";
      if (!Object.hasOwn(calendar, serviceId) && !exceptionAdded.has(serviceId)) {
        issues.push({
          code: "missing_service_reference",
          path: `marc.stops.${stopId}[${index}].svc`,
          message: "Departure references an unknown calendar service.",
        });
      }
      const time = typeof departure.t === "string" ? departure.t : "";
      const match = /^(\d{1,2}):(\d{2})$/.exec(time);
      const expectedMinute = match
        ? Number(match[1]) * 60 + Number(match[2])
        : Number.NaN;
      if (
        !match
        || Number(match[2]) > 59
        || departure.min !== expectedMinute
      ) {
        issues.push({
          code: "invalid_departure_time",
          path: `marc.stops.${stopId}[${index}]`,
          message: "Departure clock and minute index disagree.",
        });
      }
      if (typeof departure.min === "number" && departure.min < previousMinute) {
        issues.push({
          code: "unsorted_departures",
          path: `marc.stops.${stopId}[${index}]`,
          message: "Departures are not sorted by service-day minute.",
        });
      }
      if (typeof departure.min === "number") previousMinute = departure.min;
    });
  }
  for (const stopId of requiredStopIds) {
    if (!Object.hasOwn(stops, stopId)) {
      issues.push({
        code: "missing_stop_reference",
        path: `marc.stops.${stopId}`,
        message: "County MARC stop is absent from the schedule artifact.",
      });
    }
  }
  if (schedule.stations !== Object.keys(stops).length) {
    issues.push({
      code: "metadata_mismatch",
      path: "marc.stations",
      message: "Station count does not match the schedule stop index.",
    });
  }
  if (schedule.departures !== departureCount) {
    issues.push({
      code: "metadata_mismatch",
      path: "marc.departures",
      message: "Departure count does not match the schedule rows.",
    });
  }

  return issues;
}

export function validateMarcGtfsRows(
  feed: MarcGtfsRows,
  requiredStopIds: ReadonlySet<string>,
): TransitValidationIssue[] {
  const issues: TransitValidationIssue[] = [];
  const routeIds = new Set(
    feed.routes.map((route) => route.route_id).filter(Boolean),
  );
  const stopById = new Map(
    feed.stops
      .filter((stop) => stop.stop_id)
      .map((stop) => [stop.stop_id, stop]),
  );
  const calendarServiceIds = new Set(
    feed.calendar.map((row) => row.service_id).filter(Boolean),
  );
  const exceptionAdded = new Set(
    feed.calendarDates
      .filter((row) => row.exception_type === "1")
      .map((row) => row.service_id)
      .filter(Boolean),
  );
  const tripIds = new Set<string>();
  for (const [index, trip] of feed.trips.entries()) {
    if (!trip.trip_id || tripIds.has(trip.trip_id)) {
      issues.push({
        code: "invalid_trip_id",
        path: `gtfs.trips[${index}].trip_id`,
        message: trip.trip_id ? "Trip id is duplicated." : "Trip id is missing.",
      });
    }
    tripIds.add(trip.trip_id);
    if (!routeIds.has(trip.route_id)) {
      issues.push({
        code: "unknown_route_reference",
        path: `gtfs.trips[${index}].route_id`,
        message: "Trip references an unknown GTFS route.",
      });
    }
    if (
      !calendarServiceIds.has(trip.service_id)
      && !exceptionAdded.has(trip.service_id)
    ) {
      issues.push({
        code: "missing_service_reference",
        path: `gtfs.trips[${index}].service_id`,
        message: "Trip references an unknown GTFS service.",
      });
    }
  }
  for (const [index, stopTime] of feed.stopTimes.entries()) {
    if (!tripIds.has(stopTime.trip_id)) {
      issues.push({
        code: "unknown_trip_reference",
        path: `gtfs.stop_times[${index}].trip_id`,
        message: "Stop time references an unknown trip.",
      });
    }
    if (!stopById.has(stopTime.stop_id)) {
      issues.push({
        code: "unknown_stop_reference",
        path: `gtfs.stop_times[${index}].stop_id`,
        message: "Stop time references an unknown stop.",
      });
    }
  }
  for (const stopId of requiredStopIds) {
    const stop = stopById.get(stopId);
    if (!stop) {
      issues.push({
        code: "missing_stop_reference",
        path: `gtfs.stops.${stopId}`,
        message: "Required Frederick County MARC stop is missing.",
      });
      continue;
    }
    if (!coordinateIsValid(Number(stop.stop_lat), Number(stop.stop_lon))) {
      issues.push({
        code: "invalid_coordinate",
        path: `gtfs.stops.${stopId}`,
        message: "Required MARC stop has an invalid source coordinate.",
      });
    }
  }
  return issues;
}

export function assertTransitValidation(
  label: string,
  issues: readonly TransitValidationIssue[],
): void {
  if (issues.length === 0) return;
  const details = issues
    .map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`)
    .join("\n");
  throw new Error(`${label} validation failed:\n${details}`);
}
