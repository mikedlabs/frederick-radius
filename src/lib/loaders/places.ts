import { PLACES, PLACE_BY_SLUG, type Place } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsAtVenue, type Event } from "@/data/events";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { getOpenStatus, type OpenStatus } from "@/lib/hours";

export type PlaceCardData = Place & {
  open_status: OpenStatus;
  distance_m?: number;
};

export type PlaceDetail = PlaceCardData & {
  category_name: string;
  municipality_name: string;
  nearby_places: PlaceCardData[];
  upcoming_events: Event[];
};

export function decoratePlace(p: Place, origin?: LngLat, now: Date = new Date()): PlaceCardData {
  return {
    ...p,
    open_status: getOpenStatus(p.hours, now),
    distance_m: origin ? haversineMeters(origin, p.geom) : undefined,
  };
}

export function getPlaceBySlug(slug: string, origin?: LngLat, now: Date = new Date()): PlaceDetail | null {
  const p = PLACE_BY_SLUG[slug];
  if (!p) return null;
  const decorated = decoratePlace(p, origin, now);

  const nearby_places = PLACES
    .filter((x) => x.slug !== p.slug)
    .map((x) => decoratePlace(x, p.geom, now))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 6);

  return {
    ...decorated,
    category_name: CATEGORY_BY_SLUG[p.category]?.name ?? p.category,
    municipality_name: MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.municipality,
    nearby_places,
    upcoming_events: eventsAtVenue(p.slug),
  };
}

export type RankingContext = {
  origin?: LngLat;
  now?: Date;
  preferOpen?: boolean;
  category?: string;
  municipality?: string;
  tags?: string[];
  limit?: number;
};

function proximityScore(distance_m: number | undefined): number {
  if (distance_m === undefined) return 0.5;
  if (distance_m < 500) return 1;
  if (distance_m < 1500) return 0.8;
  if (distance_m < 3000) return 0.6;
  if (distance_m < 8000) return 0.4;
  return 0.2;
}

function openScore(status: OpenStatus): number {
  if (status.state === "open") return 1;
  if (status.state === "closing-soon") return 0.6;
  if (status.state === "unknown") return 0.5;
  return 0;
}

export function rankPlaces(ctx: RankingContext = {}): PlaceCardData[] {
  const now = ctx.now ?? new Date();
  let results = PLACES.map((p) => decoratePlace(p, ctx.origin, now));

  if (ctx.category) {
    results = results.filter(
      (p) => p.category === ctx.category || (p.subcategories ?? []).includes(ctx.category!)
    );
  }
  if (ctx.municipality) {
    results = results.filter((p) => p.municipality === ctx.municipality);
  }
  if (ctx.tags?.length) {
    results = results.filter((p) => ctx.tags!.every((t) => (p.tags ?? []).includes(t)));
  }
  if (ctx.preferOpen) {
    results = results.filter((p) => p.open_status.state !== "closed");
  }

  results.sort((a, b) => {
    const sa = a.feature_score * 0.4 + proximityScore(a.distance_m) * 0.3 + openScore(a.open_status) * 0.3;
    const sb = b.feature_score * 0.4 + proximityScore(b.distance_m) * 0.3 + openScore(b.open_status) * 0.3;
    return sb - sa;
  });

  return ctx.limit ? results.slice(0, ctx.limit) : results;
}

export function placesWithinRadius(origin: LngLat, meters: number, now: Date = new Date()): PlaceCardData[] {
  return PLACES
    .map((p) => decoratePlace(p, origin, now))
    .filter((p) => (p.distance_m ?? Infinity) <= meters)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
