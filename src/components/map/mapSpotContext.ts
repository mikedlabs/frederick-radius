import { haversineMeters, type LngLat } from "@/lib/geo";

type Located = LngLat;

export type SpotPlace = Located & {
  slug: string;
  name: string;
  category: string;
};

export type SpotParking = Located & {
  name: string;
  available: number | null;
};

export type SpotTransit = Located & {
  id: string;
  name: string;
};

export type SpotEvent = Located & {
  slug: string;
  title: string;
  startsAt: string;
};

export type SpotRoad = Located & {
  kind: "traffic" | "issue";
  label: string;
};

export type MapSpotContext = {
  place: (SpotPlace & { distM: number }) | null;
  parking: (SpotParking & { distM: number }) | null;
  transit: (SpotTransit & { distM: number }) | null;
  event: (SpotEvent & { distM: number }) | null;
  road: (SpotRoad & { distM: number }) | null;
};

function nearestWithin<T extends Located>(
  origin: LngLat,
  items: T[],
  maxDistanceM: number,
): (T & { distM: number }) | null {
  return (
    items
      .map((item) => ({
        ...item,
        distM: haversineMeters(origin, item),
      }))
      .filter((item) => item.distM <= maxDistanceM)
      .sort((a, b) => a.distM - b.distM)[0] ?? null
  );
}

/**
 * The compact local read behind an empty-map tap. Every radius is explicit:
 * the sheet reports nearby things Radius actually has rather than making a
 * county-wide nearest result look walkable.
 */
export function buildMapSpotContext(
  origin: LngLat,
  input: {
    places: SpotPlace[];
    parking: SpotParking[];
    transit: SpotTransit[];
    events: SpotEvent[];
    roads: SpotRoad[];
    now?: Date;
  },
): MapSpotContext {
  const nowMs = (input.now ?? new Date()).getTime();
  const upcomingEvents = input.events
    .filter((event) => {
      const startsAt = Date.parse(event.startsAt);
      return (
        Number.isFinite(startsAt) &&
        startsAt >= nowMs &&
        startsAt <= nowMs + 24 * 60 * 60 * 1000
      );
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return {
    place: nearestWithin(origin, input.places, 1_200),
    parking: nearestWithin(origin, input.parking, 800),
    transit: nearestWithin(origin, input.transit, 650),
    event: nearestWithin(origin, upcomingEvents, 1_200),
    road: nearestWithin(origin, input.roads, 1_000),
  };
}
