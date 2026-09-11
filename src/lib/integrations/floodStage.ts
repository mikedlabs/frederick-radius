/**
 * NWS flood-stage thresholds for Frederick County river/stream gauges.
 *
 * The /rivers dashboard shows the live USGS reading; on its own that's just a
 * number ("4.2 ft") with no sense of whether that's calm or dangerous. The
 * meaning comes from the National Weather Service's official flood CATEGORIES
 * for each forecast point — action / minor (flood) / moderate / major stage —
 * set by NWS hydrologists. We compare the live USGS gage height (parameter
 * 00065) against these to label the reading honestly.
 *
 * SOURCE + HONESTY:
 *  - Values pulled from the NWS National Water Prediction Service (NWPS) API,
 *    the official source: https://api.water.noaa.gov/nwps/v1/gauges/<USGS-id>
 *    (each gauge object carries flood.categories[*].stage, in feet). Verified
 *    2026-06-19; cross-checked against published NWS flood stages (e.g.
 *    Monocacy at Frederick = 15 ft, Potomac at Point of Rocks = 16 ft).
 *  - The NWS "stage" is gage height in feet referenced to the same gage datum
 *    USGS reports for 00065, so the live reading and these thresholds are
 *    directly comparable (confirmed: all six gauges' live readings sit well
 *    below their flood stage on the same scale).
 *  - These are STATIC thresholds (they change only when NWS recalibrates a
 *    site), so they live as curated, sourced data rather than a per-request
 *    fetch — no new feed to fail, no runtime cost.
 *  - Only NWS FORECAST POINTS have categories. Six of the county's ten active
 *    USGS gauges are forecast points (below); the other four (Potomac at
 *    Brunswick, Fishing Creek at Mountaindale, Linganore Creek, Monocacy near
 *    Dickerson) are NOT, so we show their reading + trend and make no stage
 *    claim — inventing one would be unsafe.
 *  - We classify the CURRENT reading against fixed thresholds. We do NOT
 *    forecast crests or issue watches/warnings — that remains NWS's job, and
 *    the dashboard links out to the official gauge for the live forecast.
 */

export type FloodStages = {
  /** NWS gauge id (NWSLI), e.g. "FDKM2" — links to water.noaa.gov/gauges/<id>. */
  nws: string;
  /** Action stage (ft): be alert; minor flooding possible if it keeps rising. */
  action: number;
  /** Flood stage = NWS "minor" (ft): minor flooding begins. */
  minor: number;
  /** Moderate flooding (ft). */
  moderate: number;
  /** Major flooding (ft). */
  major: number;
};

/** Keyed by USGS site code (matches WaterSite.id). */
export const FLOOD_STAGES: Record<string, FloodStages> = {
  // Catoctin Creek near Middletown
  "01637500": { nws: "MDLM2", action: 10, minor: 15, moderate: 20, major: 25 },
  // Potomac River at Point of Rocks
  "01638500": { nws: "PORM2", action: 11, minor: 16, moderate: 20, major: 27 },
  // Monocacy River at Bridgeport
  "01639000": { nws: "BDGM2", action: 11, minor: 13, moderate: 21, major: 25 },
  // Monocacy River at Monocacy Blvd. in Frederick
  "01642190": { nws: "FRMM2", action: 15.5, minor: 17.8, moderate: 20.2, major: 23.5 },
  // Monocacy River near Frederick at Interstate 70 (Jug Bridge)
  "01643000": { nws: "FDKM2", action: 13, minor: 15, moderate: 17, major: 20 },
  // Bennett Creek at Park Mills
  "01643500": { nws: "PMBM2", action: 6, minor: 11, moderate: 17, major: 20 },
};

/** Human page for a gauge's official NWS forecast + hydrograph. */
export function nwsGaugeUrl(nws: string): string {
  return `https://water.noaa.gov/gauges/${nws}`;
}

export type FloodKey = "normal" | "action" | "minor" | "moderate" | "major";

export type FloodCategory = {
  key: FloodKey;
  /** Plain-language label for the pill + caption. */
  label: string;
  /** Drives the dashboard pill tone (brand tokens). */
  tone: "neutral" | "warning" | "danger";
  /** The NWS flood (minor) stage in feet — the "flood stage X ft" reference. */
  floodStageFt: number;
  /** Feet remaining until the flood (minor) stage; negative once flooding. */
  toFloodFt: number;
};

export type FloodReadingLike = {
  id?: string;
  gageHeightFt?: number;
  floodStages?: FloodStages;
  observedAt?: string;
  gageHistory?: readonly { at: string }[];
};

export type ClassifiedFloodReading<T extends FloodReadingLike> = {
  site: T;
  category: FloodCategory;
  /** Timestamp for the gage-height value used in the classification. */
  observedAt: string;
};

export type CurrentFloodCoverage<T extends FloodReadingLike> = {
  status: "current" | "incomplete" | "unavailable";
  worst: ClassifiedFloodReading<T> | null;
};

const FLOOD_RANK: Record<FloodKey, number> = {
  normal: 0,
  action: 1,
  minor: 2,
  moderate: 3,
  major: 4,
};

/**
 * Classify a live gage height against a gauge's NWS flood categories.
 * Returns null when we have no reading or the gauge is not a forecast point
 * (so the caller shows the reading without a stage claim). Pure + tested.
 */
export function classifyFlood(
  gageHeightFt: number | undefined | null,
  s: FloodStages | undefined,
): FloodCategory | null {
  if (gageHeightFt == null || !Number.isFinite(gageHeightFt) || !s) return null;
  const floodStageFt = s.minor;
  const toFloodFt = Math.round((floodStageFt - gageHeightFt) * 10) / 10;
  if (gageHeightFt >= s.major)
    return { key: "major", label: "Major flooding", tone: "danger", floodStageFt, toFloodFt };
  if (gageHeightFt >= s.moderate)
    return { key: "moderate", label: "Moderate flooding", tone: "danger", floodStageFt, toFloodFt };
  if (gageHeightFt >= s.minor)
    return { key: "minor", label: "Minor flooding", tone: "danger", floodStageFt, toFloodFt };
  if (gageHeightFt >= s.action)
    return { key: "action", label: "Near flood stage", tone: "warning", floodStageFt, toFloodFt };
  return { key: "normal", label: "Normal", tone: "neutral", floodStageFt, toFloodFt };
}

/**
 * Find the most consequential current NWS category across a set of gauges.
 * USGS gauges normally report every fifteen minutes. A two-hour ceiling is
 * deliberately generous for a delayed observation while preventing an old
 * high-water reading from reappearing as a live Pulse warning.
 */
export function worstCurrentFloodReading<T extends FloodReadingLike>(
  sites: readonly T[],
  now: Date = new Date(),
  maxAgeMs = 2 * 60 * 60 * 1000,
): ClassifiedFloodReading<T> | null {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  let worst: ClassifiedFloodReading<T> | null = null;
  for (const site of sites) {
    // A WaterSite's general observedAt may come from a newer streamflow
    // measurement. Flood category uses gage height, so prefer that series's
    // own latest timestamp when it is available.
    const gageObservedAt = site.gageHistory?.at(-1)?.at ?? site.observedAt;
    const observedMs = gageObservedAt ? Date.parse(gageObservedAt) : Number.NaN;
    if (
      !Number.isFinite(observedMs) ||
      observedMs > nowMs + 5 * 60 * 1000 ||
      nowMs - observedMs > maxAgeMs
    ) continue;

    const category = classifyFlood(site.gageHeightFt, site.floodStages);
    if (!category) continue;
    if (
      !worst ||
      FLOOD_RANK[category.key] > FLOOD_RANK[worst.category.key] ||
      (FLOOD_RANK[category.key] === FLOOD_RANK[worst.category.key] &&
        category.toFloodFt < worst.category.toFloodFt)
    ) {
      worst = { site, category, observedAt: gageObservedAt! };
    }
  }
  return worst;
}

/**
 * Trust boundary for an all-clear claim. A successful HTTP response is not
 * enough: at least one forecast-point gage-height observation must also be
 * current. A normal category then becomes positive evidence of no active
 * flood-stage condition; an empty or stale payload remains incomplete.
 */
export function currentFloodCoverage<T extends FloodReadingLike>(
  sourceAvailable: boolean,
  sites: readonly T[],
  now: Date = new Date(),
): CurrentFloodCoverage<T> {
  if (!sourceAvailable) return { status: "unavailable", worst: null };
  const worst = worstCurrentFloodReading(sites, now);
  const expectedIds = Object.keys(FLOOD_STAGES);
  const freshIds = new Set(
    sites.flatMap((site) => {
      if (!site.id || !Object.hasOwn(FLOOD_STAGES, site.id)) return [];
      return worstCurrentFloodReading([site], now) ? [site.id] : [];
    }),
  );
  // A single normal forecast point is evidence for that gauge, not the whole
  // county. Keep the board partial until all six expected NWS points are fresh.
  if (freshIds.size !== expectedIds.length) {
    return { status: "incomplete", worst };
  }
  if (!worst) return { status: "incomplete", worst: null };
  return { status: "current", worst };
}
