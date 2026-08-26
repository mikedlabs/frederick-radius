import { isSamePlace, normName, type DedupeRecord } from "@/lib/dedupe";
import { haversineMeters, isInFrederickCountyArea } from "@/lib/geo";

export type PublicMapSource = "osm" | "overture" | "gis";
export type PublicMapEntityKind = "place" | "amenity";

export type PublicMapCandidate = {
  source: PublicMapSource;
  sourceId: string;
  entityKind: PublicMapEntityKind;
  name: string;
  category?: string;
  amenityKind?: string;
  address?: string;
  status?: string;
  sourceUrl?: string;
  observedAt?: string;
  lng: number;
  lat: number;
};

export type RadiusMapEntity = {
  id: string;
  entityKind: PublicMapEntityKind;
  name: string;
  category?: string;
  amenityKind?: string;
  address?: string;
  sourceRefs?: string[];
  lng: number;
  lat: number;
};

export type PublicMapDiscrepancy = {
  kind: "likely_missing" | "possible_stale" | "identity_drift";
  confidence: "high" | "medium";
  source: PublicMapSource;
  sourceId: string;
  sourceRef: string;
  entityKind: PublicMapEntityKind;
  name: string;
  category?: string;
  amenityKind?: string;
  address?: string;
  status?: string;
  sourceUrl?: string;
  observedAt?: string;
  lng: number;
  lat: number;
  radiusId?: string;
  radiusName?: string;
  matchedBy?: "source_ref" | "name_and_location" | "kind_and_location";
  distanceMeters?: number;
  reasons: string[];
  reviewState: "candidate";
};

export type PublicMapDiscrepancyReport = {
  kind: "candidate-only";
  autoPublish: false;
  generatedAt: string;
  scanned: number;
  ignored: number;
  summary: {
    likelyMissing: number;
    possibleStale: number;
    identityDrift: number;
  };
  candidates: PublicMapDiscrepancy[];
  policy: string[];
};

type GeoJsonFeature = {
  id?: unknown;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

export type GisFeatureDefaults = {
  entityKind: PublicMapEntityKind;
  amenityKind?: string;
  sourceUrl?: string;
};

const TERMINAL_STATUSES = new Set([
  "abandoned",
  "closed permanently",
  "closed_permanently",
  "decommissioned",
  "demolished",
  "defunct",
  "disused",
  "inactive",
  "permanently closed",
  "permanently_closed",
  "removed",
  "retired",
]);

const EXCLUDED_STATUSES = new Set([
  "not public",
  "not_public",
  "private",
  "suppressed",
]);

const AMENITY_LABELS: Record<string, string> = {
  bench: "Bench",
  bike_parking: "Bike parking",
  bike_repair: "Bike repair station",
  dog_waste: "Dog waste station",
  ev_charging: "EV charging",
  picnic: "Picnic area",
  playground: "Playground",
  recycling: "Recycling drop-off",
  restroom: "Public restroom",
  trash: "Trash receptacle",
  water: "Drinking water",
  wifi: "Free Wi-Fi",
};

const BROAD_AMENITY_MATCH_METERS: Record<string, number> = {
  picnic: 45,
  playground: 35,
  wifi: 25,
  ev_charging: 20,
  restroom: 18,
};

const DEFAULT_AMENITY_MATCH_METERS = 10;

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function property(
  values: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = stringValue(values[name]);
    if (value) return value;
  }
  return undefined;
}

function pointFromGeometry(
  geometry: GeoJsonFeature["geometry"],
): { lng: number; lat: number } | null {
  let coordinates = geometry?.coordinates;
  for (let depth = 0; depth < 7; depth += 1) {
    if (
      Array.isArray(coordinates) &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number" &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1])
    ) {
      return { lng: coordinates[0], lat: coordinates[1] };
    }
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
    coordinates = coordinates[0];
  }
  return null;
}

function normalizedStatus(status?: string): string | undefined {
  return status?.trim().toLowerCase().replace(/[-]+/g, " ");
}

function isTerminal(status?: string): boolean {
  const normalized = normalizedStatus(status);
  if (!normalized) return false;
  return TERMINAL_STATUSES.has(normalized) || TERMINAL_STATUSES.has(status!.trim().toLowerCase());
}

function isExcluded(status?: string): boolean {
  const normalized = normalizedStatus(status);
  if (!normalized) return false;
  return EXCLUDED_STATUSES.has(normalized) || EXCLUDED_STATUSES.has(status!.trim().toLowerCase());
}

function osmType(value?: string): "n" | "w" | "r" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "n" || normalized === "node") return "n";
  if (normalized === "w" || normalized === "way") return "w";
  if (normalized === "r" || normalized === "relation") return "r";
  return undefined;
}

export function publicMapSourceRef(
  source: PublicMapSource,
  sourceId: string,
): string {
  if (source !== "osm") return `${source}:${sourceId.trim().toLowerCase()}`;
  const match = sourceId.trim().toLowerCase().match(/^(?:osm:)?(node|way|relation|n|w|r)[/:]([^/]+)$/);
  if (!match) return `osm:${sourceId.trim().toLowerCase()}`;
  return `osm:${osmType(match[1])}:${match[2]}`;
}

export function osmSourceRefFromRadiusAmenityId(id: string): string | null {
  const match = id.match(/-(node|way|relation|n|w|r)-([^-]+)$/i);
  if (!match) return null;
  return publicMapSourceRef("osm", `${match[1]}/${match[2]}`);
}

function osmAmenityKind(values: Record<string, unknown>): string | undefined {
  const amenity = property(values, ["amenity"]);
  const leisure = property(values, ["leisure"]);
  if (amenity === "toilets") return "restroom";
  if (amenity === "charging_station") return "ev_charging";
  if (amenity === "bicycle_parking") return "bike_parking";
  if (amenity === "drinking_water" || amenity === "water_point" || property(values, ["drinking_water"]) === "yes") return "water";
  if (amenity === "waste_basket" && property(values, ["waste"]) === "dog_excrement") return "dog_waste";
  if (amenity === "dog_waste_bin") return "dog_waste";
  if (amenity === "waste_basket") return "trash";
  if (amenity === "recycling") return "recycling";
  if (amenity === "bench") return "bench";
  if (amenity === "bicycle_repair_station") return "bike_repair";
  if (leisure === "picnic_table" || property(values, ["tourism"]) === "picnic_site") return "picnic";
  if (leisure === "playground") return "playground";
  if (property(values, ["internet_access"]) === "wlan") return "wifi";
  return undefined;
}

function osmLifecycleStatus(values: Record<string, unknown>): string | undefined {
  const access = property(values, ["access"]);
  if (access === "private" || access === "no" || access === "customers") return "not_public";
  for (const prefix of ["abandoned:", "demolished:", "disused:", "removed:"]) {
    if (Object.keys(values).some((key) => key.startsWith(prefix))) return prefix.slice(0, -1);
  }
  return property(values, ["operational_status", "operating_status", "status"]);
}

export function normalizeOsmAmenityFeature(
  feature: GeoJsonFeature,
): PublicMapCandidate | null {
  const values = feature.properties ?? {};
  const point = pointFromGeometry(feature.geometry);
  if (!point || !isInFrederickCountyArea(point.lng, point.lat)) return null;
  const type = osmType(property(values, ["_osm_type", "osm_type"]));
  const id = property(values, ["_osm_id", "osm_id"]) ?? stringValue(feature.id);
  const amenityKind = osmAmenityKind(values);
  if (!type || !id || !amenityKind) return null;
  const name = property(values, ["name"]) ?? AMENITY_LABELS[amenityKind] ?? amenityKind;
  return {
    source: "osm",
    sourceId: `${type}/${id}`,
    entityKind: "amenity",
    name,
    amenityKind,
    status: osmLifecycleStatus(values),
    sourceUrl: `https://www.openstreetmap.org/${type === "n" ? "node" : type === "w" ? "way" : "relation"}/${id}`,
    lng: point.lng,
    lat: point.lat,
  };
}

function overtureName(values: Record<string, unknown>): string | undefined {
  const names = values.names;
  if (names && typeof names === "object") {
    const primary = property(names as Record<string, unknown>, ["primary"]);
    if (primary) return primary;
  }
  return property(values, ["@name", "name"]);
}

export function normalizeOverturePlaceFeature(
  feature: GeoJsonFeature,
): PublicMapCandidate | null {
  const values = feature.properties ?? {};
  const point = pointFromGeometry(feature.geometry);
  const name = overtureName(values);
  const id = property(values, ["id", "@id"]) ?? stringValue(feature.id);
  if (!point || !isInFrederickCountyArea(point.lng, point.lat) || !name || !id) return null;
  const categories = values.categories;
  const category = categories && typeof categories === "object"
    ? property(categories as Record<string, unknown>, ["primary"])
    : property(values, ["@category", "category"]);
  const addresses = values.addresses;
  const firstAddress = Array.isArray(addresses) && addresses[0] && typeof addresses[0] === "object"
    ? property(addresses[0] as Record<string, unknown>, ["freeform"])
    : undefined;
  return {
    source: "overture",
    sourceId: id,
    entityKind: "place",
    name,
    category,
    address: firstAddress ?? property(values, ["address"]),
    status: property(values, ["operating_status", "operational_status", "status"]),
    lng: point.lng,
    lat: point.lat,
  };
}

export function normalizeGisFeature(
  feature: GeoJsonFeature,
  defaults: GisFeatureDefaults,
): PublicMapCandidate | null {
  const values = feature.properties ?? {};
  const point = pointFromGeometry(feature.geometry);
  const id = property(values, ["GlobalID", "GLOBALID", "globalid", "OBJECTID", "ObjectID", "objectid", "id"]) ?? stringValue(feature.id);
  const amenityKind = property(values, ["radius_kind", "amenity_kind", "kind", "TYPE", "type"]) ?? defaults.amenityKind;
  const name = property(values, ["NAME", "Name", "name", "FACILITY", "Facility", "facility"])
    ?? (defaults.entityKind === "amenity" && amenityKind ? AMENITY_LABELS[amenityKind] ?? amenityKind : undefined);
  if (!point || !isInFrederickCountyArea(point.lng, point.lat) || !id || !name) return null;
  const active = values.active ?? values.ACTIVE ?? values.Active;
  const status = active === false || active === 0 || active === "0" || active === "false"
    ? "inactive"
    : property(values, ["operational_status", "STATUS", "Status", "status"]);
  return {
    source: "gis",
    sourceId: id,
    entityKind: defaults.entityKind,
    name,
    category: property(values, ["radius_category", "CATEGORY", "Category", "category"]),
    amenityKind,
    address: property(values, ["FULL_ADDRESS", "ADDRESS", "Address", "address"]),
    status,
    sourceUrl: property(values, ["SOURCE_URL", "source_url"]) ?? defaults.sourceUrl,
    observedAt: property(values, ["UPDATED_AT", "updated_at", "EditDate", "EDIT_DATE"]),
    lng: point.lng,
    lat: point.lat,
  };
}

function candidateAsDedupe(candidate: PublicMapCandidate): DedupeRecord {
  return {
    slug: `${candidate.source}:${candidate.sourceId}`,
    name: candidate.name,
    geom: { lng: candidate.lng, lat: candidate.lat },
    source: candidate.source,
  };
}

function radiusAsDedupe(entity: RadiusMapEntity): DedupeRecord {
  return {
    slug: entity.id,
    name: entity.name,
    geom: { lng: entity.lng, lat: entity.lat },
  };
}

function exactRefMatch(
  candidate: PublicMapCandidate,
  radius: RadiusMapEntity[],
): RadiusMapEntity | undefined {
  const ref = publicMapSourceRef(candidate.source, candidate.sourceId);
  return radius.find((entity) =>
    entity.sourceRefs?.includes(ref)
    && (
      candidate.entityKind !== "amenity"
      || !candidate.amenityKind
      || entity.amenityKind === candidate.amenityKind
    ),
  );
}

function inferredMatch(
  candidate: PublicMapCandidate,
  radius: RadiusMapEntity[],
): { entity: RadiusMapEntity; matchedBy: "name_and_location" | "kind_and_location"; distanceMeters: number } | undefined {
  if (candidate.entityKind === "place") {
    const dedupeCandidate = candidateAsDedupe(candidate);
    const entity = radius.find((item) => isSamePlace(dedupeCandidate, radiusAsDedupe(item)));
    if (!entity) return undefined;
    return {
      entity,
      matchedBy: "name_and_location",
      distanceMeters: haversineMeters(
        { lng: candidate.lng, lat: candidate.lat },
        { lng: entity.lng, lat: entity.lat },
      ),
    };
  }
  if (!candidate.amenityKind) return undefined;
  const maxDistance = BROAD_AMENITY_MATCH_METERS[candidate.amenityKind] ?? DEFAULT_AMENITY_MATCH_METERS;
  let best: { entity: RadiusMapEntity; distanceMeters: number } | undefined;
  for (const entity of radius) {
    if (entity.amenityKind !== candidate.amenityKind) continue;
    const distanceMeters = haversineMeters(
      { lng: candidate.lng, lat: candidate.lat },
      { lng: entity.lng, lat: entity.lat },
    );
    if (distanceMeters > maxDistance || (best && best.distanceMeters <= distanceMeters)) continue;
    best = { entity, distanceMeters };
  }
  return best ? { ...best, matchedBy: "kind_and_location" } : undefined;
}

function baseDiscrepancy(candidate: PublicMapCandidate): Omit<PublicMapDiscrepancy, "kind" | "confidence" | "reasons"> {
  return {
    source: candidate.source,
    sourceId: candidate.sourceId,
    sourceRef: publicMapSourceRef(candidate.source, candidate.sourceId),
    entityKind: candidate.entityKind,
    name: candidate.name,
    category: candidate.category,
    amenityKind: candidate.amenityKind,
    address: candidate.address,
    status: candidate.status,
    sourceUrl: candidate.sourceUrl,
    observedAt: candidate.observedAt,
    lng: candidate.lng,
    lat: candidate.lat,
    reviewState: "candidate",
  };
}

function identityDrift(
  candidate: PublicMapCandidate,
  match: RadiusMapEntity,
): PublicMapDiscrepancy | null {
  const reasons: string[] = [];
  const distanceMeters = haversineMeters(
    { lng: candidate.lng, lat: candidate.lat },
    { lng: match.lng, lat: match.lat },
  );
  const maxDistance = candidate.entityKind === "place" ? 250 : 40;
  if (distanceMeters > maxDistance) reasons.push(`coordinates moved ${Math.round(distanceMeters)} m`);
  if (
    candidate.amenityKind &&
    match.amenityKind &&
    candidate.amenityKind !== match.amenityKind
  ) {
    reasons.push(`kind changed from ${match.amenityKind} to ${candidate.amenityKind}`);
  }
  if (normName(candidate.name) !== normName(match.name)) {
    const candidateGeneric = candidate.amenityKind && candidate.name === AMENITY_LABELS[candidate.amenityKind];
    const radiusGeneric = match.amenityKind && match.name === AMENITY_LABELS[match.amenityKind];
    if (!candidateGeneric && !radiusGeneric) reasons.push(`name changed from "${match.name}"`);
  }
  if (reasons.length === 0) return null;
  return {
    ...baseDiscrepancy(candidate),
    kind: "identity_drift",
    confidence: "high",
    radiusId: match.id,
    radiusName: match.name,
    matchedBy: "source_ref",
    distanceMeters: Math.round(distanceMeters),
    reasons,
  };
}

export function buildPublicMapDiscrepancyReport(
  candidates: PublicMapCandidate[],
  radiusEntities: RadiusMapEntity[],
  generatedAt = new Date().toISOString(),
): PublicMapDiscrepancyReport {
  const queue: PublicMapDiscrepancy[] = [];
  let ignored = 0;
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const sourceRef = publicMapSourceRef(candidate.source, candidate.sourceId);
    // One OSM object can truthfully carry multiple public functions, such as
    // toilets plus drinking water. Keep those as independent review rows.
    const candidateKey = `${sourceRef}:${candidate.entityKind}:${candidate.amenityKind ?? ""}`;
    if (seen.has(candidateKey) || isExcluded(candidate.status)) {
      ignored += 1;
      continue;
    }
    seen.add(candidateKey);
    const eligibleRadius = radiusEntities.filter((entity) => entity.entityKind === candidate.entityKind);
    const exact = exactRefMatch(candidate, eligibleRadius);
    const inferred = exact ? undefined : inferredMatch(candidate, eligibleRadius);
    const matched = exact ?? inferred?.entity;

    if (isTerminal(candidate.status)) {
      // Absence from a snapshot is never closure evidence. A stale candidate
      // requires an explicit terminal source status plus a strong entity match.
      if (matched && (exact || candidate.entityKind === "place")) {
        const distanceMeters = haversineMeters(
          { lng: candidate.lng, lat: candidate.lat },
          { lng: matched.lng, lat: matched.lat },
        );
        queue.push({
          ...baseDiscrepancy(candidate),
          kind: "possible_stale",
          confidence: exact ? "high" : "medium",
          radiusId: matched.id,
          radiusName: matched.name,
          matchedBy: exact ? "source_ref" : inferred?.matchedBy,
          distanceMeters: Math.round(distanceMeters),
          reasons: [`source explicitly reports ${candidate.status}`],
        });
      } else {
        ignored += 1;
      }
      continue;
    }

    if (exact) {
      const drift = identityDrift(candidate, exact);
      if (drift) queue.push(drift);
      continue;
    }
    if (inferred) continue;

    queue.push({
      ...baseDiscrepancy(candidate),
      kind: "likely_missing",
      confidence: candidate.source === "gis" ? "medium" : "high",
      reasons: ["no matching Radius entity by source reference, name, kind, and location"],
    });
  }

  const kindRank: Record<PublicMapDiscrepancy["kind"], number> = {
    possible_stale: 0,
    identity_drift: 1,
    likely_missing: 2,
  };
  queue.sort((a, b) =>
    kindRank[a.kind] - kindRank[b.kind]
    || a.source.localeCompare(b.source)
    || a.name.localeCompare(b.name)
    || a.sourceRef.localeCompare(b.sourceRef),
  );

  return {
    kind: "candidate-only",
    autoPublish: false,
    generatedAt,
    scanned: candidates.length,
    ignored,
    summary: {
      likelyMissing: queue.filter((item) => item.kind === "likely_missing").length,
      possibleStale: queue.filter((item) => item.kind === "possible_stale").length,
      identityDrift: queue.filter((item) => item.kind === "identity_drift").length,
    },
    candidates: queue,
    policy: [
      "This report is a human review queue and never changes public Radius data.",
      "A missing source row is never treated as evidence that a Radius entity closed.",
      "A stale flag requires an explicit terminal source status and a strong entity match.",
      "Public access to a GIS endpoint is not proof of reuse rights; confirm source terms before promotion.",
    ],
  };
}
