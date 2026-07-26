import runtimeBindings from "gtfs-rt-bindings";

export type GtfsLong = number | { toNumber: () => number };

type GtfsTranslatedString = {
  translation?: Array<{ text?: string | null }> | null;
};

type GtfsTripDescriptor = {
  routeId?: string | null;
  tripId?: string | null;
};

type GtfsVehicleDescriptor = {
  id?: string | null;
};

type GtfsStopTimeEvent = {
  time?: GtfsLong | null;
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
    stopTimeUpdate?: Array<{
      stopId?: string | null;
      stopSequence?: number | null;
      arrival?: GtfsStopTimeEvent | null;
      departure?: GtfsStopTimeEvent | null;
    }> | null;
  } | null;
  alert?: {
    informedEntity?: Array<{
      routeId?: string | null;
      stopId?: string | null;
    }> | null;
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
    } | null;
    vehicle?: GtfsVehicleDescriptor | null;
    stop_time_update?: Array<{
      stop_id?: string | null;
      stop_sequence?: number | null;
      arrival?: GtfsStopTimeEvent | null;
      departure?: GtfsStopTimeEvent | null;
    }> | null;
  } | null;
  alert?: {
    informed_entity?: Array<{
      route_id?: string | null;
      stop_id?: string | null;
    }> | null;
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
              }
            : entity.trip_update.trip,
          vehicle: entity.trip_update.vehicle,
          stopTimeUpdate: entity.trip_update.stop_time_update?.map((stop) => ({
            stopId: stop.stop_id,
            stopSequence: stop.stop_sequence,
            arrival: stop.arrival,
            departure: stop.departure,
          })),
        }
      : entity.trip_update,
    alert: entity.alert
      ? {
          informedEntity: entity.alert.informed_entity?.map((selector) => ({
            routeId: selector.route_id,
            stopId: selector.stop_id,
          })),
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
              }
            : entity.tripUpdate.trip,
          vehicle: entity.tripUpdate.vehicle,
          stop_time_update: entity.tripUpdate.stopTimeUpdate?.map((stop) => ({
            stop_id: stop.stopId,
            stop_sequence: stop.stopSequence,
            arrival: stop.arrival,
            departure: stop.departure,
          })),
        }
      : entity.tripUpdate,
    alert: entity.alert
      ? {
          informed_entity: entity.alert.informedEntity?.map((selector) => ({
            route_id: selector.routeId,
            stop_id: selector.stopId,
          })),
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
