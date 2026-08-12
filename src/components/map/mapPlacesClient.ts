import type { MapPinPlace } from "./types";
import { beginMapSourceTiming } from "./mapPerf";

type MapPlacesPayload = {
  generatedAt: string;
  places: MapPinPlace[];
};

let pending: Promise<MapPlacesPayload> | null = null;

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
  if (pending) return pending;
  const finishTiming = beginMapSourceTiming("places");
  pending = fetch("/api/map/places", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Map places returned ${response.status}`);
      }
      const payload: unknown = await response.json();
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
      pending = null;
      throw error;
    });
  return pending;
}

/** Starts the data request from the static map shell, before the GL chunk mounts. */
export function warmMapPlaces(): void {
  void loadMapPlaces().catch(() => undefined);
}

/** Test/retry hook; never needed during a successful map session. */
export function resetMapPlacesRequest(): void {
  pending = null;
}
