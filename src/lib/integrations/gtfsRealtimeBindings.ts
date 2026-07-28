import runtimeBindings from "gtfs-rt-bindings";

export type GtfsLong = number | { toNumber: () => number };

type GtfsTranslatedString = {
  translation?: Array<{ text?: string | null }> | null;
};

type GtfsTripDescriptor = {
  routeId?: string | null;
  tripId?: string | null;
  directionId?: number | null;
  scheduleRelationship?: number | string | null;
};

type GtfsVehicleDescriptor = {
  id?: string | null;
};

type GtfsStopTimeEvent = {
  time?: GtfsLong | null;
};

type GtfsTimeRange = {
  start?: GtfsLong | null;
  end?: GtfsLong | null;
};

export type GtfsFeedEntity = {
  id?: string | null;
  vehicle?: {
    trip?: GtfsTripDescriptor | null;
    vehicle?: GtfsVehicleDescriptor | null;
    position?: {
      latitude?: number | null;
      longitude?: number | null;
      bearing?: number | null;
    } | null;
    timestamp?: GtfsLong | null;
    stopId?: string | null;
    currentStopSequence?: number | null;
    currentStatus?: number | string | null;
  } | null;
  tripUpdate?: {
    trip?: GtfsTripDescriptor | null;
    vehicle?: GtfsVehicleDescriptor | null;
    timestamp?: GtfsLong | null;
    stopTimeUpdate?: Array<{
      stopId?: string | null;
      stopSequence?: number | null;
      arrival?: GtfsStopTimeEvent | null;
      departure?: GtfsStopTimeEvent | null;
      scheduleRelationship?: number | string | null;
    }> | null;
  } | null;
  alert?: {
    activePeriod?: GtfsTimeRange[] | null;
    informedEntity?: Array<{
      routeId?: string | null;
      stopId?: string | null;
    }> | null;
    cause?: number | string | null;
    effect?: number | string | null;
    headerText?: GtfsTranslatedString | null;
    descriptionText?: GtfsTranslatedString | null;
  } | null;
};

export type GtfsFeedMessage = {
  header: {
    gtfsRealtimeVersion?: string | null;
    timestamp?: GtfsLong | null;
  };
  entity: GtfsFeedEntity[];
};

type GtfsFeedMessageInput = {
  header: {
    gtfsRealtimeVersion: string;
    timestamp?: GtfsLong | null;
  };
  entity: GtfsFeedEntity[];
};

type GtfsFeedMessageCodec = {
  decode: (bytes: Uint8Array) => GtfsFeedMessage;
  encode: (message: GtfsFeedMessageInput) => {
    finish: () => Uint8Array;
  };
};

type GtfsRealtimeRuntime = {
  FeedMessage: GtfsFeedMessageCodec;
};

type RawTranslatedString = {
  translation?: Array<{ text?: string | null }> | null;
};

type RawFeedEntity = {
  id?: string | null;
  vehicle?: {
    trip?: {
      route_id?: string | null;
      trip_id?: string | null;
      direction_id?: number | null;
      schedule_relationship?: number | string | null;
    } | null;
    vehicle?: GtfsVehicleDescriptor | null;
    position?: {
      latitude?: number | null;
      longitude?: number | null;
      bearing?: number | null;
    } | null;
    timestamp?: GtfsLong | null;
    stop_id?: string | null;
    current_stop_sequence?: number | null;
    current_status?: number | string | null;
  } | null;
  trip_update?: {
    trip?: {
      route_id?: string | null;
      trip_id?: string | null;
      direction_id?: number | null;
      schedule_relationship?: number | string | null;
    } | null;
    vehicle?: GtfsVehicleDescriptor | null;
    timestamp?: GtfsLong | null;
    stop_time_update?: Array<{
      stop_id?: string | null;
      stop_sequence?: number | null;
      arrival?: GtfsStopTimeEvent | null;
      departure?: GtfsStopTimeEvent | null;
      schedule_relationship?: number | string | null;
    }> | null;
  } | null;
  alert?: {
    active_period?: GtfsTimeRange[] | null;
    informed_entity?: Array<{
      route_id?: string | null;
      stop_id?: string | null;
    }> | null;
    cause?: number | string | null;
    effect?: number | string | null;
    header_text?: RawTranslatedString | null;
    description_text?: RawTranslatedString | null;
  } | null;
};

type RawFeedMessage = {
  header: {
    gtfs_realtime_version?: string | null;
    timestamp?: GtfsLong | null;
  };
  entity?: RawFeedEntity[] | null;
};

type RawFeedMessageCodec = {
  decode: (bytes: Uint8Array) => RawFeedMessage;
  encode: (message: RawFeedMessage) => {
    finish: () => Uint8Array;
  };
};

function normalizeEntity(entity: RawFeedEntity): GtfsFeedEntity {
  return {
    id: entity.id,
    vehicle: entity.vehicle
      ? {
          trip: entity.vehicle.trip
            ? {
              routeId: entity.vehicle.trip.route_id,
              tripId: entity.vehicle.trip.trip_id,
              directionId: entity.vehicle.trip.direction_id,
              scheduleRelationship: entity.vehicle.trip.schedule_relationship,
            }
            : entity.vehicle.trip,
          vehicle: entity.vehicle.vehicle,
          position: entity.vehicle.position,
          timestamp: entity.vehicle.timestamp,
          stopId: entity.vehicle.stop_id,
          currentStopSequence: entity.vehicle.current_stop_sequence,
          currentStatus: entity.vehicle.current_status,
        }
      : entity.vehicle,
    tripUpdate: entity.trip_update
      ? {
          trip: entity.trip_update.trip
            ? {
                routeId: entity.trip_update.trip.route_id,
                tripId: entity.trip_update.trip.trip_id,
                directionId: entity.trip_update.trip.direction_id,
                scheduleRelationship: entity.trip_update.trip.schedule_relationship,
              }
            : entity.trip_update.trip,
          vehicle: entity.trip_update.vehicle,
          timestamp: entity.trip_update.timestamp,
          stopTimeUpdate: entity.trip_update.stop_time_update?.map((stop) => ({
            stopId: stop.stop_id,
            stopSequence: stop.stop_sequence,
            arrival: stop.arrival,
            departure: stop.departure,
            scheduleRelationship: stop.schedule_relationship,
          })),
        }
      : entity.trip_update,
    alert: entity.alert
      ? {
          activePeriod: entity.alert.active_period,
          informedEntity: entity.alert.informed_entity?.map((selector) => ({
            routeId: selector.route_id,
            stopId: selector.stop_id,
          })),
          cause: entity.alert.cause,
          effect: entity.alert.effect,
          headerText: entity.alert.header_text,
          descriptionText: entity.alert.description_text,
        }
      : entity.alert,
  };
}

function encodeEntity(entity: GtfsFeedEntity): RawFeedEntity {
  return {
    id: entity.id,
    vehicle: entity.vehicle
      ? {
          trip: entity.vehicle.trip
            ? {
                route_id: entity.vehicle.trip.routeId,
                trip_id: entity.vehicle.trip.tripId,
                direction_id: entity.vehicle.trip.directionId,
                schedule_relationship: entity.vehicle.trip.scheduleRelationship,
              }
            : entity.vehicle.trip,
          vehicle: entity.vehicle.vehicle,
          position: entity.vehicle.position,
          timestamp: entity.vehicle.timestamp,
          stop_id: entity.vehicle.stopId,
          current_stop_sequence: entity.vehicle.currentStopSequence,
          current_status: entity.vehicle.currentStatus,
        }
      : entity.vehicle,
    trip_update: entity.tripUpdate
      ? {
          trip: entity.tripUpdate.trip
            ? {
                route_id: entity.tripUpdate.trip.routeId,
                trip_id: entity.tripUpdate.trip.tripId,
                direction_id: entity.tripUpdate.trip.directionId,
                schedule_relationship: entity.tripUpdate.trip.scheduleRelationship,
              }
            : entity.tripUpdate.trip,
          vehicle: entity.tripUpdate.vehicle,
          timestamp: entity.tripUpdate.timestamp,
          stop_time_update: entity.tripUpdate.stopTimeUpdate?.map((stop) => ({
            stop_id: stop.stopId,
            stop_sequence: stop.stopSequence,
            arrival: stop.arrival,
            departure: stop.departure,
            schedule_relationship: stop.scheduleRelationship,
          })),
        }
      : entity.tripUpdate,
    alert: entity.alert
      ? {
          active_period: entity.alert.activePeriod,
          informed_entity: entity.alert.informedEntity?.map((selector) => ({
            route_id: selector.routeId,
            stop_id: selector.stopId,
          })),
          cause: entity.alert.cause,
          effect: entity.alert.effect,
          header_text: entity.alert.headerText,
          description_text: entity.alert.descriptionText,
        }
      : entity.alert,
  };
}

/**
 * A small typed seam around the generated GTFS-Realtime runtime.
 *
 * The upstream package intentionally ships JavaScript without TypeScript
 * declarations. Keeping its shape here limits untyped data to one boundary
 * and prevents its build-only tooling from entering the production graph.
 */
const rawRuntime = runtimeBindings as {
  FeedMessage: RawFeedMessageCodec;
};

export const gtfsRealtime: GtfsRealtimeRuntime = {
  FeedMessage: {
    decode(bytes) {
      const feed = rawRuntime.FeedMessage.decode(bytes);
      return {
        header: {
          gtfsRealtimeVersion: feed.header.gtfs_realtime_version,
          timestamp: feed.header.timestamp,
        },
        entity: (feed.entity ?? []).map(normalizeEntity),
      };
    },
    encode(message) {
      return rawRuntime.FeedMessage.encode({
        header: {
          gtfs_realtime_version: message.header.gtfsRealtimeVersion,
          timestamp: message.header.timestamp,
        },
        entity: message.entity.map(encodeEntity),
      });
    },
  },
};
