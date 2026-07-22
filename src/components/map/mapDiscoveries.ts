import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import type { Amenity } from "@/lib/loaders/amenities";
import type { ParkingPin } from "@/lib/map/parking";
import type { CemeteryPin, EventPin, MapPinPlace, TransitStopPin } from "./types";

/**
 * A factual connection the map can draw and explain. These are deliberately
 * not AI-generated recommendations: every sentence is assembled from the
 * entities and distances carried in the map payload.
 */
export type MapDiscoveryKind =
  | "event-orbit"
  | "field-ready"
  | "beer-neighborhood"
  | "town-pocket"
  | "history-from-above";

export type MapDiscoveryPointKind =
  | "anchor"
  | "place"
  | "event"
  | "amenity"
  | "parking"
  | "transit"
  | "history"
  | "photo";

export type MapDiscoveryPoint = LngLat & {
  id: string;
  label: string;
  kind: MapDiscoveryPointKind;
};

export type MapDiscoveryEvidence = {
  fact: string;
  source: string;
  /** A source or record page a person can inspect. Omitted when the source is
   *  Radius fieldwork or another private first-party archive. */
  sourceUrl?: string;
  /** Positional honesty for map records whose apparent dot can otherwise
   *  imply more certainty than the source provides. */
  precision?: "exact" | "approximate" | "area";
  /** A real source/capture timestamp. Never synthesized from render time. */
  observedAt?: string;
};

export type MapDiscoveryLayers = {
  transit?: boolean;
  parking?: boolean;
  aerial?: boolean;
  cemeteries?: boolean;
  amenityGroups?: string[];
};

export type MapDiscovery = {
  id: string;
  kind: MapDiscoveryKind;
  eyebrow: string;
  title: string;
  summary: string;
  center: [number, number];
  zoom: number;
  score: number;
  /** The literal nodes behind the finding. The overlay draws these as a
   * constellation so a user can see the relationship, not just read it. */
  points: MapDiscoveryPoint[];
  evidence: MapDiscoveryEvidence[];
  layers: MapDiscoveryLayers;
  href?: string;
  actionLabel?: string;
};

export type DiscoveryAerialPhoto = {
  src: string;
  lat: number;
  lng: number;
  takenAt: string | null;
  season: "spring" | "summer" | "fall" | "winter";
};

export type BuildMapDiscoveriesInput = {
  places: MapPinPlace[];
  events: EventPin[];
  amenities: Amenity[];
  parking: ParkingPin[];
  transitStops: TransitStopPin[];
  cemeteries: CemeteryPin[];
  aerialPhotos: DiscoveryAerialPhoto[];
  origin: LngLat;
  now: Date;
  /** The settled map viewport. When present, every input is clipped to it and
   *  ranking uses its center, even when the device location is elsewhere. */
  bounds?: MapDiscoveryBounds;
  limit?: number;
};

export type MapDiscoveryBounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};

type Coord = { lng: number; lat: number };
type Candidate = MapDiscovery & { anchorKey: string };

const FOOD_AND_DRINK = new Set([
  "restaurant", "coffee", "bar", "brewery", "winery", "distillery",
  "bakery", "pizza", "ice-cream", "food-truck", "market",
]);
const POCKET_CATEGORIES = new Set([
  ...FOOD_AND_DRINK,
  "park", "trail", "playground", "museum", "gallery", "theater",
  "music", "antiques", "book-store", "shopping", "agritourism",
]);
const OUTDOOR_CATEGORIES = new Set(["park", "trail", "playground"]);

const AMENITY_LABEL: Partial<Record<Amenity["kind"], string>> = {
  restroom: "public restroom",
  water: "drinking water",
  trash: "trash can",
  recycling: "recycling point",
  bench: "bench",
  dog_waste: "dog-waste station",
  dog_water: "dog-water point",
  outlet: "power outlet",
  bike_parking: "bike parking",
  bike_repair: "bike-repair station",
  picnic: "picnic area",
  playground: "playground",
  wifi: "public Wi-Fi",
  ev_charging: "EV charger",
};

const AMENITY_GROUP: Partial<Record<Amenity["kind"], string>> = {
  restroom: "restroom",
  water: "water",
  trash: "trash",
  recycling: "trash",
  bench: "seating",
  picnic: "seating",
  dog_waste: "dog",
  dog_water: "dog",
  outlet: "outlet",
  bike_parking: "bike",
  bike_repair: "bike",
  playground: "play",
  wifi: "wifi",
  ev_charging: "ev",
};

function dist(a: Coord, b: Coord): number {
  return haversineMeters(a, b);
}

function nearest<T>(
  origin: Coord,
  items: T[],
  maxDistanceM: number,
  accept: (item: T) => boolean = () => true,
  coordinate: (item: T) => Coord = (item) => item as Coord,
): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null;
  for (const item of items) {
    if (!accept(item)) continue;
    const distanceM = dist(origin, coordinate(item));
    if (distanceM > maxDistanceM) continue;
    if (!best || distanceM < best.distanceM) best = { item, distanceM };
  }
  return best;
}

function placePoint(place: MapPinPlace, kind: MapDiscoveryPointKind = "place"): MapDiscoveryPoint {
  return { id: `place:${place.slug}`, label: place.name, kind, ...place.geom };
}

type EvidenceSource = Pick<MapDiscoveryEvidence, "source" | "sourceUrl">;

const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const COUNTY_GIS_URL = "https://fcgis.frederickcountymd.gov/server_pub/rest/services";
const TRANSIT_URL = "https://www.frederickcountymd.gov/199/Connector-Schedules";
const CITY_PARKING_URL = "https://www.cityoffrederickmd.gov/207/Parking";
const CEMETERY_SOURCE_URL = "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/HistoricCemeteries/FeatureServer/0";

function sourceForPlace(place: MapPinPlace): EvidenceSource {
  if (place.source === "dfp") return { source: "Downtown Frederick Partnership", sourceUrl: "https://downtownfrederick.org/" };
  if (place.source === "fc-gis" || place.source === "arcgis") return { source: "Frederick County GIS", sourceUrl: COUNTY_GIS_URL };
  if (place.source === "osm") return { source: "OpenStreetMap contributors", sourceUrl: OSM_COPYRIGHT_URL };
  if (place.source === "google") return { source: "Google Places" };
  if (place.source === "yelp") return { source: "Yelp" };
  return { source: "Frederick Radius place guide", sourceUrl: `/places/${place.slug}` };
}

function osmAmenityUrl(id: string): string {
  const match = id.match(/-([nwr])-(\d+)$/);
  if (!match) return OSM_COPYRIGHT_URL;
  const kind = match[1] === "n" ? "node" : match[1] === "w" ? "way" : "relation";
  return `https://www.openstreetmap.org/${kind}/${match[2]}`;
}

function sourceForAmenity(amenity: Amenity): EvidenceSource {
  if (amenity.id.startsWith("usgs:")) {
    const site = amenity.id.slice("usgs:".length);
    return { source: "U.S. Geological Survey", sourceUrl: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(site)}/` };
  }
  if (amenity.id.startsWith("mdev:")) return { source: "Maryland iMAP", sourceUrl: "https://data.imap.maryland.gov/" };
  if (amenity.id.startsWith("field:") || amenity.photo) return { source: "Frederick Radius field map" };
  return { source: "OpenStreetMap contributors", sourceUrl: osmAmenityUrl(amenity.id) };
}

function amenityDisplayName(amenity: Amenity): string {
  const type = AMENITY_LABEL[amenity.kind];
  if (!type) return amenity.name;
  const name = amenity.name.trim();
  const nameWords = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const usefulTypeWords = type.toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !["public", "point", "station"].includes(word));
  return usefulTypeWords.some((word) => nameWords.has(word)) ? name : `${name} · ${type}`;
}

function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "at the published time";
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${weekday} at ${time}`;
}

function photoLabel(photo: DiscoveryAerialPhoto): string {
  const year = photo.takenAt ? new Date(photo.takenAt).getUTCFullYear() : NaN;
  return Number.isFinite(year)
    ? `${photo.season} ${year} aerial photograph`
    : `${photo.season} aerial photograph`;
}

function transitStopLabel(name: string): string {
  const cleaned = name
    .replace(/\s*-\s*(?:SRI|STOP)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Nearby transit stop";
  return /^\d+\s/.test(cleaned) ? `Transit stop at ${cleaned}` : cleaned;
}

function shortTitle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || value.slice(0, max - 1)}…`;
}

function discoveryCenter(points: MapDiscoveryPoint[]): [number, number] {
  const total = points.reduce(
    (sum, point) => ({ lng: sum.lng + point.lng, lat: sum.lat + point.lat }),
    { lng: 0, lat: 0 },
  );
  return [total.lng / points.length, total.lat / points.length];
}

function proximityScore(origin: Coord, anchor: Coord): number {
  // Nearby findings lead, but a county overview can still reveal another town.
  return Math.max(-24, 18 - dist(origin, anchor) / 1_800);
}

function hasUsefulCemeteryName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();
  // Preserve these official source records on the map, but do not promote an
  // incomplete or dated one-word database label into a discovery headline.
  return !new Set(["colored", "colored a m e", "methodist", "unknown", "unnamed", "cemetery"]).has(normalized);
}

function eventCandidates(input: BuildMapDiscoveriesInput): Candidate[] {
  const out: Candidate[] = [];
  const nowMs = input.now.getTime();

  for (const event of input.events) {
    const startsMs = Date.parse(event.starts_at);
    if (!Number.isFinite(startsMs) || startsMs < nowMs - 60 * 60_000) continue;
    const venueName = event.venue_name.trim();
    // A time plus coordinates is not enough for a useful event plan. If the
    // source cannot name the venue, the card cannot explain where the joined
    // food, parking, or transit relationship begins.
    if (!venueName) continue;
    const anchor = { lng: event.lng, lat: event.lat };
    // Only an explicit venue slug proves the host relationship. Coordinate
    // proximity alone can turn the restaurant next door into the "venue" and
    // erase the useful pre-event stop from the result.
    const host = event.venue_place_slug
      ? input.places.find((place) => place.slug === event.venue_place_slug) ?? null
      : null;
    const nearbyPlace = nearest(anchor, input.places, 900, (place) =>
      place.slug !== host?.slug && FOOD_AND_DRINK.has(place.category),
      (place) => place.geom,
    );
    const garage = nearest(anchor, input.parking, 950);
    const transit = nearest(anchor, input.transitStops, 700);

    // An event listing alone is not a discovery. Require at least one useful
    // spatial connection the ordinary calendar would not show.
    const support = nearbyPlace ?? garage ?? transit;
    if (!support) continue;

    const points: MapDiscoveryPoint[] = [
      { id: `event:${event.slug}`, label: event.title, kind: "event", ...anchor },
    ];
    const evidence: MapDiscoveryEvidence[] = [{
      fact: `${event.title} is listed at ${venueName} on ${localDateTime(event.starts_at)}.`,
      source: "Frederick Radius event feeds",
      sourceUrl: `/events/${event.slug}`,
    }];
    const details: string[] = [];

    if (nearbyPlace) {
      points.push(placePoint(nearbyPlace.item));
      details.push(`${nearbyPlace.item.name} is ${formatDistance(nearbyPlace.distanceM)} away`);
      evidence.push({
        fact: `${nearbyPlace.item.name} is ${formatDistance(nearbyPlace.distanceM)} from the venue.`,
        ...sourceForPlace(nearbyPlace.item),
      });
    }
    if (garage) {
      points.push({ id: `parking:${garage.item.slug}`, label: garage.item.name, kind: "parking", lng: garage.item.lng, lat: garage.item.lat });
      details.push(`${garage.item.name} is ${formatDistance(garage.distanceM)} away`);
      evidence.push({
        fact: `${garage.item.name} is ${formatDistance(garage.distanceM)} from the venue.`,
        source: "City of Frederick parking data",
        sourceUrl: CITY_PARKING_URL,
      });
    } else if (transit) {
      const stopLabel = transitStopLabel(transit.item.name);
      points.push({ id: `transit:${transit.item.id}`, label: stopLabel, kind: "transit", lng: transit.item.lng, lat: transit.item.lat });
      details.push(`${stopLabel} is ${formatDistance(transit.distanceM)} away`);
      evidence.push({
        fact: `${stopLabel} is ${formatDistance(transit.distanceM)} from the venue.`,
        source: "Frederick County TransIT",
        sourceUrl: TRANSIT_URL,
      });
    }

    const hoursUntil = Math.max(0, (startsMs - nowMs) / 3_600_000);
    out.push({
      id: `event-orbit:${event.slug}`,
      anchorKey: `event:${event.slug}`,
      kind: "event-orbit",
      eyebrow: "Plan around an event",
      title: `Before ${shortTitle(event.title)}`,
      summary: `${event.title} begins ${localDateTime(event.starts_at)} at ${venueName}. ${details.slice(0, 2).join(", and ")}.`,
      center: discoveryCenter(points),
      zoom: 14.1,
      score: 96 - Math.min(28, hoursUntil / 4) + proximityScore(input.origin, anchor) + Math.min(8, points.length * 2),
      points,
      evidence,
      layers: { parking: Boolean(garage), transit: Boolean(!garage && transit) },
      href: `/events/${event.slug}`,
      actionLabel: "Open event",
    });
  }
  return out;
}

function fieldReadyCandidates(input: BuildMapDiscoveriesInput): Candidate[] {
  const out: Candidate[] = [];
  for (const place of input.places) {
    if (!OUTDOOR_CATEGORIES.has(place.category)) continue;
    const nearby = input.amenities
      .map((amenity) => ({ amenity, distanceM: dist(place.geom, amenity) }))
      .filter(({ amenity, distanceM }) => AMENITY_LABEL[amenity.kind] && distanceM <= 500)
      .sort((a, b) => a.distanceM - b.distanceM);
    const distinct = [...new Map(nearby.map((item) => [item.amenity.kind, item])).values()];
    if (distinct.length < 2 || !distinct.some(({ amenity }) => amenity.kind === "restroom" || amenity.kind === "water")) continue;

    const shown = distinct.slice(0, 3);
    const points = [placePoint(place, "anchor"), ...shown.map(({ amenity }) => ({
      id: `amenity:${amenity.id}`,
      label: amenityDisplayName(amenity),
      kind: "amenity" as const,
      lng: amenity.lng,
      lat: amenity.lat,
    }))];
    const first = shown[0];
    const second = shown[1];
    const firstLabel = AMENITY_LABEL[first.amenity.kind]!;
    const secondLabel = AMENITY_LABEL[second.amenity.kind]!;
    const groups = [...new Set(shown.map(({ amenity }) => AMENITY_GROUP[amenity.kind]).filter(Boolean))] as string[];

    out.push({
      id: `field-ready:${place.slug}`,
      anchorKey: `place:${place.slug}`,
      kind: "field-ready",
      eyebrow: "Useful on the ground",
      title: `What is mapped near ${place.name}`,
      summary: `The nearest mapped ${firstLabel} is ${formatDistance(first.distanceM)} from ${place.name}. The nearest mapped ${secondLabel} is ${formatDistance(second.distanceM)} away.`,
      center: discoveryCenter(points),
      zoom: 14.4,
      score: 82 + distinct.length * 2 + proximityScore(input.origin, place.geom),
      points,
      evidence: shown.map(({ amenity, distanceM }) => ({
        fact: `${amenityDisplayName(amenity)} is mapped ${formatDistance(distanceM)} from ${place.name}.`,
        ...sourceForAmenity(amenity),
      })),
      layers: { amenityGroups: groups },
      href: `/places/${place.slug}`,
      actionLabel: "Open place",
    });
  }
  return out;
}

function beerCandidates(input: BuildMapDiscoveriesInput): Candidate[] {
  const out: Candidate[] = [];
  const breweries = input.places.filter((place) => place.category === "brewery");
  for (const brewery of breweries) {
    const food = nearest(brewery.geom, input.places, 850, (place) =>
      place.slug !== brewery.slug && ["restaurant", "pizza", "food-truck", "bakery"].includes(place.category),
      (place) => place.geom,
    );
    const event = nearest(brewery.geom, input.events, 650);
    const transit = nearest(brewery.geom, input.transitStops, 650);
    if (!food || (!event && !transit)) continue;

    const points: MapDiscoveryPoint[] = [placePoint(brewery, "anchor"), placePoint(food.item)];
    const evidence: MapDiscoveryEvidence[] = [
      { fact: `${food.item.name} is ${formatDistance(food.distanceM)} from ${brewery.name}.`, ...sourceForPlace(food.item) },
    ];
    let secondSentence: string;
    if (event) {
      points.push({ id: `event:${event.item.slug}`, label: event.item.title, kind: "event", lng: event.item.lng, lat: event.item.lat });
      secondSentence = `${event.item.title} is listed ${formatDistance(event.distanceM)} away on ${localDateTime(event.item.starts_at)}.`;
      evidence.push({ fact: secondSentence, source: "Frederick Radius event feeds", sourceUrl: `/events/${event.item.slug}` });
    } else {
      const stopLabel = transitStopLabel(transit!.item.name);
      points.push({ id: `transit:${transit!.item.id}`, label: stopLabel, kind: "transit", lng: transit!.item.lng, lat: transit!.item.lat });
      secondSentence = `${stopLabel} is mapped ${formatDistance(transit!.distanceM)} away.`;
      evidence.push({ fact: secondSentence, source: "Frederick County TransIT", sourceUrl: TRANSIT_URL });
    }

    out.push({
      id: `beer-neighborhood:${brewery.slug}`,
      anchorKey: `place:${brewery.slug}`,
      kind: "beer-neighborhood",
      eyebrow: "Build a beer stop",
      title: `Around ${brewery.name}`,
      summary: `${food.item.name} is ${formatDistance(food.distanceM)} from the brewery. ${secondSentence}`,
      center: discoveryCenter(points),
      zoom: 14.1,
      score: 78 + proximityScore(input.origin, brewery.geom) + (event ? 8 : 3),
      points,
      evidence,
      layers: { transit: Boolean(!event && transit) },
      href: `/places/${brewery.slug}`,
      actionLabel: "Open brewery",
    });
  }
  return out;
}

function categoryFamily(place: MapPinPlace): string {
  if (FOOD_AND_DRINK.has(place.category)) return "food and drink";
  if (OUTDOOR_CATEGORIES.has(place.category)) return "outdoors";
  if (["museum", "gallery", "theater", "music"].includes(place.category)) return "arts and culture";
  return place.category;
}

function townPocketCandidates(input: BuildMapDiscoveriesInput): Candidate[] {
  const out: Candidate[] = [];
  const byTown = new Map<string, MapPinPlace[]>();
  for (const place of input.places) {
    if (place.municipality === "frederick" || !POCKET_CATEGORIES.has(place.category)) continue;
    const list = byTown.get(place.municipality) ?? [];
    list.push(place);
    byTown.set(place.municipality, list);
  }

  for (const [townSlug, places] of byTown) {
    let best: { anchor: MapPinPlace; neighbors: Array<{ place: MapPinPlace; distanceM: number }>; families: Set<string> } | null = null;
    for (const anchor of places) {
      const neighbors = places
        .filter((place) => place.slug !== anchor.slug)
        .map((place) => ({ place, distanceM: dist(anchor.geom, place.geom) }))
        .filter(({ distanceM }) => distanceM <= 700)
        .sort((a, b) => a.distanceM - b.distanceM);
      const families = new Set([categoryFamily(anchor), ...neighbors.map(({ place }) => categoryFamily(place))]);
      if (neighbors.length < 3 || families.size < 3) continue;
      if (!best || neighbors.length > best.neighbors.length || (neighbors.length === best.neighbors.length && families.size > best.families.size)) {
        best = { anchor, neighbors, families };
      }
    }
    if (!best) continue;

    const town = MUNICIPALITY_BY_SLUG[townSlug]?.name ?? best.anchor.municipality;
    const companion = best.neighbors[0];
    const shown = best.neighbors.slice(0, 3);
    const points = [placePoint(best.anchor, "anchor"), ...shown.map(({ place }) => placePoint(place))];
    out.push({
      id: `town-pocket:${townSlug}`,
      anchorKey: `town:${townSlug}`,
      kind: "town-pocket",
      eyebrow: "A county pocket",
      title: `A compact cluster in ${town}`,
      summary: `${best.anchor.name} is ${formatDistance(companion.distanceM)} from ${companion.place.name}. ${best.neighbors.length - 1} other useful places are mapped within ${formatDistance(700)} of the same point.`,
      center: discoveryCenter(points),
      zoom: 14,
      score: 72 + best.neighbors.length + best.families.size * 2 + proximityScore(input.origin, best.anchor.geom),
      points,
      evidence: [
        { fact: `${best.anchor.name} and ${companion.place.name} are ${formatDistance(companion.distanceM)} apart.`, source: "Frederick Radius place guide", sourceUrl: `/towns/${townSlug}` },
        { fact: `${best.families.size} kinds of stop are mapped in this 0.4-mile pocket.`, source: "Frederick Radius place guide" },
      ],
      layers: {},
      href: `/towns/${townSlug}`,
      actionLabel: `Open ${town}`,
    });
  }
  return out;
}

function historyCandidates(input: BuildMapDiscoveriesInput): Candidate[] {
  const out: Candidate[] = [];
  for (const cemetery of input.cemeteries) {
    if (!hasUsefulCemeteryName(cemetery.name)) continue;
    const photos = input.aerialPhotos
      .map((photo) => ({ photo, distanceM: dist(cemetery, photo) }))
      .filter(({ distanceM }) => distanceM <= 1_800)
      .sort((a, b) => a.distanceM - b.distanceM);
    const seasons = [...new Set(photos.map(({ photo }) => photo.season))];
    if (photos.length < 2 || seasons.length < 2) continue;
    const shown = photos.slice(0, 2);
    const points: MapDiscoveryPoint[] = [
      { id: `cemetery:${cemetery.id}`, label: cemetery.name, kind: "history", lng: cemetery.lng, lat: cemetery.lat },
      ...shown.map(({ photo }, index) => ({ id: `photo:${photo.src}:${index}`, label: photoLabel(photo), kind: "photo" as const, lng: photo.lng, lat: photo.lat })),
    ];
    const seasonSummary = seasons.length === 2
      ? `${seasons[0]} and ${seasons[1]}`
      : `${seasons.length} seasons`;
    out.push({
      id: `history-from-above:${cemetery.id}`,
      anchorKey: `cemetery:${cemetery.id}`,
      kind: "history-from-above",
      eyebrow: "Frederick through time",
      title: `The aerial archive around ${cemetery.name}`,
      summary: `${photos.length} geotagged aerial photographs were taken within ${formatDistance(1_800)} of ${cemetery.name}. The nearby archive spans ${seasonSummary}.`,
      center: discoveryCenter(points),
      zoom: 13.2,
      score: 69 + Math.min(12, photos.length) + seasons.length * 3 + proximityScore(input.origin, cemetery),
      points,
      evidence: [
        { fact: `${cemetery.name} is plotted from the county cemetery inventory${cemetery.approximate ? " with an approximate location" : ""}.`, source: "Frederick County historic cemetery inventory", sourceUrl: CEMETERY_SOURCE_URL, precision: cemetery.approximate ? "approximate" : "exact" },
        { fact: `${photos.length} Radius aerial photographs are geotagged within 1.1 miles.`, source: "Frederick Radius drone archive" },
        { fact: `${photoLabel(shown[0].photo)} is plotted at its recorded GPS point.`, source: "Frederick Radius drone archive", precision: "exact", observedAt: shown[0].photo.takenAt ?? undefined },
      ],
      layers: { aerial: true, cemeteries: true },
      href: `/map?mode=browse&show=aerial,cemeteries&at=${shown[0].photo.lat.toFixed(6)},${shown[0].photo.lng.toFixed(6)}&aerial=${encodeURIComponent(shown[0].photo.src)}`,
      actionLabel: shown[0].photo.takenAt
        ? `Open ${new Date(shown[0].photo.takenAt).getUTCFullYear()} aerial`
        : "Open aerial photo",
    });
  }
  return out;
}

function isInsideBounds(point: Coord, bounds: MapDiscoveryBounds): boolean {
  return point.lng >= bounds.west && point.lng <= bounds.east
    && point.lat >= bounds.south && point.lat <= bounds.north;
}

/** Clip every source before any recipe joins it. A point just beyond the
 * viewport may be geographically close, but it is not something the user
 * asked Radius to read when they tapped "Read this area." */
function viewportInput(input: BuildMapDiscoveriesInput): BuildMapDiscoveriesInput {
  if (!input.bounds) return input;
  const { bounds } = input;
  return {
    ...input,
    places: input.places.filter((place) => isInsideBounds(place.geom, bounds)),
    events: input.events.filter((event) => isInsideBounds(event, bounds)),
    amenities: input.amenities.filter((amenity) => isInsideBounds(amenity, bounds)),
    parking: input.parking.filter((garage) => isInsideBounds(garage, bounds)),
    transitStops: input.transitStops.filter((stop) => isInsideBounds(stop, bounds)),
    cemeteries: input.cemeteries.filter((cemetery) => isInsideBounds(cemetery, bounds)),
    aerialPhotos: input.aerialPhotos.filter((photo) => isInsideBounds(photo, bounds)),
    // "Read this area" belongs to the camera. A device fix can inform other
    // Radius rankings, but it must not pull this tray toward a different town.
    origin: {
      lng: (bounds.west + bounds.east) / 2,
      lat: (bounds.south + bounds.north) / 2,
    },
  };
}

/** A defensive final gate: a recipe can request only the supporting layers
 * represented by points in its own constellation. This prevents a nearby but
 * unused feed from lighting up as if it were evidence. */
function evidencedLayers(discovery: Candidate): MapDiscoveryLayers {
  const kinds = new Set(discovery.points.map((point) => point.kind));
  return {
    transit: discovery.layers.transit && kinds.has("transit") ? true : undefined,
    parking: discovery.layers.parking && kinds.has("parking") ? true : undefined,
    aerial: discovery.layers.aerial && kinds.has("photo") ? true : undefined,
    cemeteries: discovery.layers.cemeteries && kinds.has("history") ? true : undefined,
    amenityGroups: discovery.layers.amenityGroups?.length && kinds.has("amenity")
      ? discovery.layers.amenityGroups
      : undefined,
  };
}

/**
 * Build a short, diverse set of deterministic map findings for the current
 * viewport. One high-scoring candidate per recipe leads before any recipe can
 * repeat, which keeps the tray from becoming another event or place list.
 */
export function buildMapDiscoveries(input: BuildMapDiscoveriesInput): MapDiscovery[] {
  const scoped = viewportInput(input);
  const limit = Math.max(1, Math.min(scoped.limit ?? 6, 8));
  const candidates = [
    ...eventCandidates(scoped),
    ...fieldReadyCandidates(scoped),
    ...beerCandidates(scoped),
    ...townPocketCandidates(scoped),
    ...historyCandidates(scoped),
  ].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const chosen: Candidate[] = [];
  const usedKinds = new Set<MapDiscoveryKind>();
  const usedAnchors = new Set<string>();

  // Diversity pass: let each recipe earn one slot.
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (usedKinds.has(candidate.kind) || usedAnchors.has(candidate.anchorKey)) continue;
    chosen.push(candidate);
    usedKinds.add(candidate.kind);
    usedAnchors.add(candidate.anchorKey);
  }
  // Quality pass: fill remaining room without repeating the same anchor.
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (chosen.includes(candidate) || usedAnchors.has(candidate.anchorKey)) continue;
    chosen.push(candidate);
    usedAnchors.add(candidate.anchorKey);
  }

  return chosen.map((candidate): MapDiscovery => ({
    id: candidate.id,
    kind: candidate.kind,
    eyebrow: candidate.eyebrow,
    title: candidate.title,
    summary: candidate.summary,
    center: candidate.center,
    zoom: candidate.zoom,
    score: candidate.score,
    points: candidate.points,
    evidence: candidate.evidence,
    layers: evidencedLayers(candidate),
    href: candidate.href,
    actionLabel: candidate.actionLabel,
  }));
}
