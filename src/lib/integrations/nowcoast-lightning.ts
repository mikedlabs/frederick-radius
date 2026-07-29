/**
 * NOAA nowCOAST lightning-density WMS metadata.
 *
 * This is a 15-minute, 8 km gridded density product. It is deliberately not
 * modeled as individual lightning strikes and must not be rendered as strike
 * pins. The layer is useful for showing lightning cores and whether activity
 * is increasing or decreasing; active NWS warnings remain authoritative.
 */

import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";

const WMS_ENDPOINT =
  "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows";
const CAPABILITIES_URL =
  `${WMS_ENDPOINT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;

export const NOWCOAST_LIGHTNING_DATASET = {
  publisher: "NOAA nowCOAST / NWS Ocean Prediction Center",
  sourceUrl: CAPABILITIES_URL,
  publicPageUrl: "https://nowcoast.noaa.gov/",
  layerName: "ldn_lightning_strike_density",
  styleName: "lightning_density",
  dataKind: "gridded-lightning-density",
  individualStrikes: false,
  densityWindowMinutes: 15,
  horizontalResolutionKm: 8,
  approximateUpdateMinutes: 15,
  units:
    "strikes per square kilometer per minute, scaled by 10^3",
  confidence: "official" as const,
} as const;

export type NowCoastLightningCapability = {
  layerName: typeof NOWCOAST_LIGHTNING_DATASET.layerName;
  title: string;
  latestFrameAt: string | null;
  frameTimes: string[];
  status: "current" | "stale";
  individualStrikes: false;
  densityWindowMinutes: 15;
  horizontalResolutionKm: 8;
  approximateUpdateMinutes: 15;
  units: typeof NOWCOAST_LIGHTNING_DATASET.units;
  provenance: {
    publisher: typeof NOWCOAST_LIGHTNING_DATASET.publisher;
    sourceUrl: string;
    retrievedAt: string;
    confidence: "official";
  };
};

export type NowCoastLightningResult = {
  capability: NowCoastLightningCapability | null;
  available: boolean;
  /** A parseable capability can still be stale. */
  stale: boolean;
  coverageNote: string;
};

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .trim();
}

function isoOrNull(value: string): string | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function layerBlock(xml: string, layerName: string): string | null {
  const nameMatch = new RegExp(
    `<Name>\\s*${layerName}\\s*<\\/Name>`,
    "i",
  ).exec(xml);
  if (!nameMatch) return null;
  const start = xml.lastIndexOf("<Layer", nameMatch.index);
  const openEnd = xml.indexOf(">", start);
  const end = xml.indexOf("</Layer>", nameMatch.index);
  if (start < 0 || openEnd < 0 || end < 0) return null;
  return xml.slice(openEnd + 1, end);
}

export function parseNowCoastLightningCapabilities(
  xml: string,
  {
    now = new Date(),
    retrievedAt = now.toISOString(),
    staleAfterMinutes = 45,
  }: {
    now?: Date;
    retrievedAt?: string;
    staleAfterMinutes?: number;
  } = {},
): NowCoastLightningCapability | null {
  if (!/<WMS_Capabilities\b/i.test(xml)) return null;
  const block = layerBlock(xml, NOWCOAST_LIGHTNING_DATASET.layerName);
  if (!block) return null;

  const title =
    decodeXml(block.match(/<Title>([\s\S]*?)<\/Title>/i)?.[1] ?? "") ||
    "Lightning Strike Density Data";
  const dimension = block.match(
    /<Dimension\b([^>]*)\bname=["']time["']([^>]*)>([\s\S]*?)<\/Dimension>/i,
  );
  if (!dimension) return null;
  const attributes = `${dimension[1]} ${dimension[2]}`;
  const defaultTime =
    attributes.match(/\bdefault=["']([^"']+)["']/i)?.[1] ?? "";
  const frameTimes = [...new Set(
    dimension[3]
      .split(",")
      .map((value) => isoOrNull(value.trim()))
      .filter((value): value is string => Boolean(value)),
  )].sort((left, right) => Date.parse(left) - Date.parse(right));
  const latestFrameAt =
    isoOrNull(defaultTime) ?? frameTimes.at(-1) ?? null;
  const ageMs = latestFrameAt
    ? now.getTime() - Date.parse(latestFrameAt)
    : Number.POSITIVE_INFINITY;
  const current =
    ageMs >= -5 * 60 * 1_000 &&
    ageMs <= staleAfterMinutes * 60 * 1_000;

  return {
    layerName: NOWCOAST_LIGHTNING_DATASET.layerName,
    title,
    latestFrameAt,
    frameTimes,
    status: current ? "current" : "stale",
    individualStrikes: false,
    densityWindowMinutes: 15,
    horizontalResolutionKm: 8,
    approximateUpdateMinutes: 15,
    units: NOWCOAST_LIGHTNING_DATASET.units,
    provenance: {
      publisher: NOWCOAST_LIGHTNING_DATASET.publisher,
      sourceUrl: CAPABILITIES_URL,
      retrievedAt,
      confidence: "official",
    },
  };
}

type LoadNowCoastLightningOptions = {
  deadlineMs?: number;
  revalidateSeconds?: number;
  now?: Date;
};

export async function getNowCoastLightningResult({
  deadlineMs = 8_000,
  revalidateSeconds = 900,
  now = new Date(),
}: LoadNowCoastLightningOptions = {}): Promise<NowCoastLightningResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const unavailable: NowCoastLightningResult = {
    capability: null,
    available: false,
    stale: false,
    coverageNote:
      "NOAA gridded lightning density, not individual strike locations or an active warning.",
  };

  try {
    const response = await fetch(CAPABILITIES_URL, {
      headers: {
        Accept: "application/xml,text/xml;q=0.9",
        "User-Agent": "Frederick Radius (hello@frederickradius.app)",
      },
      signal: controller.signal,
      next: { revalidate: revalidateSeconds },
    });
    if (!response.ok) return unavailable;
    const capability = parseNowCoastLightningCapabilities(
      await response.text(),
      { now, retrievedAt: now.toISOString() },
    );
    if (!capability) return unavailable;
    return {
      capability,
      available: true,
      stale: capability.status === "stale",
      coverageNote:
        "NOAA gridded lightning density, not individual strike locations or an active warning.",
    };
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timer);
  }
}

export function buildFrederickLightningMapUrl({
  width = 1024,
  height = 1024,
  time,
}: {
  width?: number;
  height?: number;
  time?: string;
} = {}): string {
  const safeWidth = Math.max(1, Math.min(2_048, Math.round(width)));
  const safeHeight = Math.max(1, Math.min(2_048, Math.round(height)));
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: NOWCOAST_LIGHTNING_DATASET.layerName,
    STYLES: NOWCOAST_LIGHTNING_DATASET.styleName,
    FORMAT: "image/png",
    TRANSPARENT: "true",
    CRS: "CRS:84",
    BBOX: [
      FREDERICK_COUNTY_BBOX.west,
      FREDERICK_COUNTY_BBOX.south,
      FREDERICK_COUNTY_BBOX.east,
      FREDERICK_COUNTY_BBOX.north,
    ].join(","),
    WIDTH: String(safeWidth),
    HEIGHT: String(safeHeight),
  });
  const frame = time ? isoOrNull(time) : null;
  if (frame) params.set("TIME", frame);
  return `${WMS_ENDPOINT}?${params.toString()}`;
}
