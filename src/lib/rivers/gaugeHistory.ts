import type { CurrentFloodCoverage } from "@/lib/integrations/floodStage";
import type { Reading, WaterSite } from "@/lib/integrations/usgsWater";

export const GAUGE_HOURS = { PT6H: 6, P1D: 24, P7D: 168 } as const;
export type GaugePeriod = keyof typeof GAUGE_HOURS;
export type GaugeHistory = { height: Reading[]; flow: Reading[]; end: string };
export const GAP_MINUTES = 45;

export function gaugeLabel(name: string): string {
  return name.toLowerCase().replace(/,?\s+md\.?$/i, "").replace(/\bnr\b/g, "near")
    .replace(/\bbl\b/g, "below").replace(/\bab\b/g, "above")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(At|Near|Above|Below|Of)\b/g, (word) => word.toLowerCase());
}

export function riverCoverageSummary(coverage: CurrentFloodCoverage<WaterSite>, count: number): string {
  const { worst, status } = coverage;
  if (worst && worst.category.key !== "normal") {
    const stage = worst.category.key === "action" ? "action" : worst.category.key + " flood";
    return `${gaugeLabel(worst.site.name)} was at or above NWS ${stage} stage at its latest reading. Check the official forecast.`;
  }
  if (status === "current") return "All six local NWS forecast gauges last reported below action stage.";
  if (count) return "USGS has recent readings at the locations shown. Some NWS forecast gauges have no verified recent height.";
  return status === "unavailable"
    ? "USGS readings could not be loaded. Check the official gauge before using a crossing."
    : "USGS returned no recent readings for Frederick County. Check the official gauge before using a crossing.";
}

export function usgsGaugeReadingsUrl(siteId: string): string {
  const url = new URL("https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items");
  url.search = new URLSearchParams({ f: "html", monitoring_location_id: `USGS-${siteId}`, parameter_code: "00065,00060" }).toString();
  return url.toString();
}

/** Position points by their observed times. Missing intervals remain blank. */
export function gaugePlot(readings: Reading[], period: GaugePeriod, end: string) {
  const finish = Date.parse(end);
  const start = finish - GAUGE_HOURS[period] * 3_600_000;
  const rows = readings.filter((row) => Number.isFinite(row.value) && Date.parse(row.at) >= start && Date.parse(row.at) <= finish);
  if (!rows.length) return null;
  const low = Math.min(...rows.map((row) => row.value));
  const high = Math.max(...rows.map((row) => row.value));
  const span = high - low;
  const pad = span ? span * 0.1 : Math.max(Math.abs(high) * 0.02, 0.01);
  const points = rows.map((row) => ({
    x: (Date.parse(row.at) - start) / (finish - start) * 1000,
    y: 100 - (row.value - low + pad) / (span + pad * 2) * 100,
  }));
  const segments: typeof points[] = [];
  rows.forEach((row, i) => {
    if (!i || Date.parse(row.at) - Date.parse(rows[i - 1].at) > GAP_MINUTES * 60_000) segments.push([]);
    segments[segments.length - 1].push(points[i]);
  });
  return { start, finish, rows, points, segments, low, high, top: high + pad, bottom: low - pad };
}
