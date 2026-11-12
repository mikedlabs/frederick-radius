import type { MapPinPlace } from "./types";
import { beginMapSourceTiming } from "./mapPerf";
import { startBoundedJsonRequest } from "@/lib/bounded-json-request";

type MapPlacesPayload = {
  generatedAt: string;
  places: MapPinPlace[];
};

export const MAP_PLACES_REQUEST_TIMEOUT_MS = 10_000;

type MapPlacesFlight = {
  promise: Promise<MapPlacesPayload>;
  cancel: () => void;
};

let pending: MapPlacesFlight | null = null;

function validPayload(value: unknown): value is MapPlacesPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<MapPlacesPayload>;
  return (
    typeof payload.generatedAt === "string" &&
    Array.isArray(payload.places) &&
    payload.places.every(
      (place) =>
        Boolean(place) &&
        typeof place.slug === "string" &&
        typeof place.name === "string" &&
        Number.isFinite(place.geom?.lng) &&
        Number.isFinite(place.geom?.lat),
    )
  );
}

export function loadMapPlaces(): Promise<MapPlacesPayload> {
  if (pending) return pending.promise;
  const finishTiming = beginMapSourceTiming("places");
  const task = startBoundedJsonRequest("/api/map/places", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  }, { deadlineMs: MAP_PLACES_REQUEST_TIMEOUT_MS, label: "Map places" });
  const flight: MapPlacesFlight = {
    cancel: task.cancel,
    promise: task.promise.then((payload) => {
      // A reset may retire an already-resolved request before this continuation
      // runs. It must neither publish that old result nor affect its successor.
      if (pending !== flight) {
        throw new DOMException("Map places request cancelled", "AbortError");
      }
      if (!validPayload(payload)) throw new Error("Map places were malformed");
      finishTiming(payload.places.length > 0 ? "ready" : "empty");
      return payload;
    })
    .catch((error) => {
      const aborted =
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError";
      finishTiming(aborted ? "aborted" : "error");
      if (pending === flight) pending = null;
      throw error;
    }),
  };
  pending = flight;
  return flight.promise;
}

/** Starts the data request from the static map shell, before the GL chunk mounts. */
export function warmMapPlaces(): void {
  void loadMapPlaces().catch(() => undefined);
}

/** Test/retry hook; never needed during a successful map session. */
export function resetMapPlacesRequest(): void {
  const retired = pending;
  pending = null;
  retired?.cancel();
}
