/**
 * EV charging stations — Frederick County, from Maryland iMAP.
 *
 * The app's `ev_charging` amenity layer was crowd-sourced OpenStreetMap
 * points (a bare "there's a charger here"). Maryland publishes an
 * AUTHORITATIVE, keyless ArcGIS FeatureServer (the AFDC dataset mirrored
 * into MD iMAP) with the station name, network, connector counts, and
 * hours. This upgrades the layer from "a dot" to "a ChargePoint site with
 * 2 Level 2 and 4 DC-fast plugs, open 24 hours" — the difference a driver
 * actually needs.
 *
 * Live-verified 2026-07 against layer 2 (Electric Vehicle Charging
 * Stations). There is no county column, so we query the Frederick County
 * bbox envelope and gate every point through the real county ring
 * (isInFrederickCountyArea) to drop the neighbor-county bleed (Taneytown,
 * Hagerstown). Graceful [] on any failure — the map falls back to the OSM
 * points, never a 503.
 */
import { queryArcGIS } from "./arcgis";
import { isInFrederickCountyArea } from "@/lib/geo";
import { resolveMunicipality } from "@/lib/connect";

const SERVICE =
  "https://mdgeodata.md.gov/imap/rest/services/Transportation/MD_AlternativeFuel/FeatureServer/2";

// Frederick County bbox [west, south, east, north] as an ArcGIS envelope.
const BBOX = { west: -77.7, south: 39.265, east: -77.15, north: 39.745 };

export type EvChargingStation = {
  /** Stable id from the source station ID (falls back to OBJECTID). */
  id: string;
  name: string;
  /** "Network" that runs the site: Tesla, ChargePoint, EVgo, etc. */
  network?: string;
  /** Network site URL, when present + a real http(s) link. */
  networkUrl?: string;
  address?: string;
  municipality: string;
  /** Number of Level 2 (240V) plugs. */
  level2: number;
  /** Number of DC fast-charge plugs (the ones that matter on a road trip). */
  dcFast: number;
  /** Connector standards present, cleaned: "CCS, CHAdeMO, J1772". */
  connectors?: string;
  /** Hours string as published, e.g. "24 hours daily". */
  hours?: string;
  lng: number;
  lat: number;
};

type Attrs = Record<string, unknown>;

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}
function int(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function httpUrl(v: unknown): string | undefined {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}

// AFDC connector codes → human labels. Codes come space/comma separated.
const CONNECTOR_LABEL: Record<string, string> = {
  J1772: "J1772",
  J1772COMBO: "CCS",
  CHADEMO: "CHAdeMO",
  TESLA: "Tesla",
  NACS: "NACS",
};
function connectors(v: unknown): string | undefined {
  const raw = str(v);
  if (!raw) return undefined;
  const seen = new Set<string>();
  for (const tok of raw.split(/[\s,;]+/)) {
    const label = CONNECTOR_LABEL[tok.toUpperCase()];
    if (label) seen.add(label);
  }
  return seen.size ? [...seen].join(", ") : undefined;
}

/**
 * Pure row → station. Exported for tests. Returns null when the row has no
 * usable coordinate, is not an available ("E") station, or falls outside
 * the Frederick County ring.
 */
export function normalizeEvFeature(
  attrs: Attrs,
  geometry?: { x?: number; y?: number } | null,
): EvChargingStation | null {
  // Only currently-available stations. Status: E=available, P=planned,
  // T=temporarily unavailable. Planned/unavailable would over-promise.
  if (str(attrs.Status_Code) !== "E") return null;

  const lng = typeof attrs.Longitude === "number" ? attrs.Longitude : geometry?.x;
  const lat = typeof attrs.Latitude === "number" ? attrs.Latitude : geometry?.y;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!isInFrederickCountyArea(lng, lat)) return null;

  const name = str(attrs.Station_Name) ?? "EV charging station";
  const zip = str(attrs.ZIP);
  const address = [str(attrs.Street_Address), str(attrs.City), zip]
    .filter(Boolean)
    .join(", ") || undefined;
  const id = String(attrs.ID ?? attrs.OBJECTID ?? `${lng},${lat}`);

  return {
    id,
    name,
    network: str(attrs.EV_Network),
    networkUrl: httpUrl(attrs.EV_Network_Web),
    address,
    municipality: resolveMunicipality({ lng, lat }).municipality.slug,
    level2: int(attrs.EV_Level2_EVSE_Num),
    dcFast: int(attrs.EV_DC_Fast_Count),
    connectors: connectors(attrs.EV_Connector_Types),
    hours: str(attrs.Access_Days_Time),
    lng,
    lat,
  };
}

/**
 * One-line summary for a station, in the field-guide mono voice:
 * "ChargePoint · 4 fast, 2 Level 2 · CCS, CHAdeMO". Counts are supporting
 * detail; the network leads because that's what a driver's app opens.
 */
export function evDetailLine(s: EvChargingStation): string {
  const parts: string[] = [];
  if (s.network) parts.push(s.network);
  const plugs: string[] = [];
  if (s.dcFast > 0) plugs.push(`${s.dcFast} fast`);
  if (s.level2 > 0) plugs.push(`${s.level2} Level 2`);
  if (plugs.length) parts.push(plugs.join(", "));
  if (s.connectors) parts.push(s.connectors);
  return parts.join(" · ");
}

const FIELDS = [
  "OBJECTID", "ID", "Station_Name", "Street_Address", "City", "ZIP",
  "Status_Code", "EV_Level2_EVSE_Num", "EV_DC_Fast_Count", "EV_Connector_Types",
  "EV_Network", "EV_Network_Web", "Access_Days_Time", "Latitude", "Longitude",
].join(",");

/**
 * Frederick County EV charging stations, authoritative. Cached a day
 * (stations change slowly). Empty array on any failure.
 */
export async function getEvChargingStations(): Promise<EvChargingStation[]> {
  const features = await queryArcGIS(
    SERVICE,
    {
      geometry: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: FIELDS,
      resultRecordCount: "500",
    },
    86_400,
  );
  const out: EvChargingStation[] = [];
  for (const f of features) {
    const s = normalizeEvFeature(f.attributes, f.geometry as { x?: number; y?: number } | null);
    if (s) out.push(s);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
