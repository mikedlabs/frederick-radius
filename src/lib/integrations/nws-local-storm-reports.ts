/**
 * NWS Baltimore/Washington (LWX) Preliminary Local Storm Reports.
 *
 * LSRs are recent observations, not active warnings. Their official
 * provenance does not make every report verified: NWS labels the product
 * preliminary and includes reports from several source types. Radius keeps
 * that distinction in both `active` and `confidence`.
 */

import { easternWallToUtcISO } from "@/lib/tz";
import type {
  OfficialOperationalSignalBase,
} from "./official-signal-contract";

const NWS_BASE = "https://api.weather.gov";
const LWX_LSR_INDEX = `${NWS_BASE}/products/types/LSR/locations/LWX`;
const USER_AGENT = "Frederick Radius (hello@frederickradius.app)";
const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_MAX_PRODUCTS = 16;
const FUTURE_TOLERANCE_MS = 60 * 60 * 1_000;

export type NwsLocalStormReport = OfficialOperationalSignalBase & {
  kind: "local-storm-report";
  scope: "county";
  active: false;
  state: "recent" | "expired";
  event: string;
  location: string;
  county: "Frederick";
  stateCode: "MD";
  lat: number;
  lng: number;
  magnitude: string | null;
  reportingSource: string;
  preliminary: true;
};

type NwsProductReference = {
  "@id"?: string;
  id?: string;
  issuingOffice?: string;
  issuanceTime?: string;
  productCode?: string;
};

type NwsProductIndex = {
  "@graph"?: NwsProductReference[];
};

type NwsProduct = NwsProductReference & {
  productText?: string;
};

export type NwsLocalStormReportsResult = {
  reports: NwsLocalStormReport[];
  /**
   * True when the product index was valid and either no recent products
   * existed or at least one selected product was read successfully.
   */
  available: boolean;
  degraded: boolean;
  asOf: string | null;
  attemptedProducts: number;
  loadedProducts: number;
  /** LSRs are observations and never substitute for active NWS alerts. */
  coverageNote: string;
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseCoordinate(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([NSEW])$/i.exec(value.trim());
  if (!match) return null;
  const magnitude = Number(match[1]);
  if (!Number.isFinite(magnitude)) return null;
  return /[SW]/i.test(match[2]) ? -magnitude : magnitude;
}

function parseEasternReportTime(
  dateValue: string,
  timeValue: string,
  meridiem: string,
): string | null {
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateValue.trim());
  const time = /^(\d{2})(\d{2})$/.exec(timeValue.trim());
  if (!date || !time) return null;

  const month = Number(date[1]);
  const day = Number(date[2]);
  const year = Number(date[3]);
  let hour = Number(time[1]);
  const minute = Number(time[2]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  hour %= 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;

  try {
    return easternWallToUtcISO(year, month, day, hour, minute);
  } catch {
    return null;
  }
}

function stableId(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedRemarks(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export function localStormReportState(
  occurredAt: string,
  now = new Date(),
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
): "recent" | "expired" {
  const occurredMs = Date.parse(occurredAt);
  const ageMs = now.getTime() - occurredMs;
  if (
    !Number.isFinite(occurredMs) ||
    ageMs < -FUTURE_TOLERANCE_MS ||
    ageMs > maxAgeHours * 60 * 60 * 1_000
  ) {
    return "expired";
  }
  return "recent";
}

export type ParseNwsLocalStormReportOptions = {
  productUrl: string;
  issuedAt: string;
  retrievedAt?: string;
  now?: Date;
  maxAgeHours?: number;
};

/**
 * Parse fixed-column LSR text and keep only the explicit
 * `Frederick ... MD` county/state field. This avoids confusing Frederick
 * County, Virginia with Frederick County, Maryland.
 */
export function parseNwsLocalStormReportProduct(
  productText: string,
  {
    productUrl,
    issuedAt,
    retrievedAt = new Date().toISOString(),
    now = new Date(),
    maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  }: ParseNwsLocalStormReportOptions,
): NwsLocalStormReport[] {
  const safeProductUrl = officialNwsProductUrl(productUrl);
  const publishedAt = isoOrNull(issuedAt);
  if (!safeProductUrl || !publishedAt) return [];

  const lines = productText.replace(/\r\n?/g, "\n").split("\n");
  const reports: NwsLocalStormReport[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const firstLine = lines[index];
    const timeMatch = /^(\d{4})\s+(AM|PM)\s+/.exec(firstLine);
    if (!timeMatch) continue;

    let secondIndex = index + 1;
    while (secondIndex < lines.length && !lines[secondIndex].trim()) {
      secondIndex += 1;
    }
    const secondLine = lines[secondIndex] ?? "";
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(secondLine)) continue;

    const event = firstLine.slice(12, 29).trim();
    const location = firstLine.slice(29, 53).trim();
    const coordinates = firstLine
      .slice(53)
      .match(/(\d+(?:\.\d+)?[NS])\s+(\d+(?:\.\d+)?[EW])/i);
    const county = secondLine.slice(29, 48).trim();
    const stateCode = secondLine.slice(48, 50).trim().toUpperCase();
    if (county.toLowerCase() !== "frederick" || stateCode !== "MD") continue;
    if (!event || !location || !coordinates) continue;

    const lat = parseCoordinate(coordinates[1]);
    const lng = parseCoordinate(coordinates[2]);
    const occurredAt = parseEasternReportTime(
      secondLine.slice(0, 10),
      timeMatch[1],
      timeMatch[2],
    );
    if (lat === null || lng === null || !occurredAt) continue;
    if (now.getTime() - Date.parse(occurredAt) < -FUTURE_TOLERANCE_MS) continue;

    const remarks: string[] = [];
    let cursor = secondIndex + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (/^\d{4}\s+(?:AM|PM)\s+/.test(line) || /^&&|\$\$/.test(line.trim())) {
        break;
      }
      remarks.push(line);
      cursor += 1;
    }

    const summary =
      normalizedRemarks(remarks) || `${event} was reported near ${location}.`;
    const magnitude = secondLine.slice(12, 29).trim() || null;
    const reportingSource = secondLine.slice(53).trim() || "Not specified";
    const state = localStormReportState(occurredAt, now, maxAgeHours);
    const expiresAt = new Date(
      Date.parse(occurredAt) + maxAgeHours * 60 * 60 * 1_000,
    ).toISOString();
    const identity = [
      occurredAt,
      event.toLowerCase(),
      location.toLowerCase(),
      lat.toFixed(3),
      lng.toFixed(3),
      summary.toLowerCase(),
    ].join("|");

    reports.push({
      id: `nws-lsr-${stableId(identity)}`,
      kind: "local-storm-report",
      title: event,
      summary,
      url: safeProductUrl,
      scope: "county",
      state,
      active: false,
      publishedAt,
      occurredAt,
      expiresAt,
      confidence: "preliminary-official",
      provenance: {
        publisher: "National Weather Service Baltimore/Washington",
        authority: "official-government",
        sourceKind: "nws-text-product",
        sourceUrl: LWX_LSR_INDEX,
        canonicalUrl: safeProductUrl,
        retrievedAt,
        providerUpdatedAt: publishedAt,
        confidence: "preliminary-official",
      },
      event,
      location,
      county: "Frederick",
      stateCode: "MD",
      lat,
      lng,
      magnitude,
      reportingSource,
      preliminary: true,
    });

    index = Math.max(index, cursor - 1);
  }

  return reports;
}

function officialNwsProductUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "api.weather.gov" ||
      !parsed.pathname.startsWith("/products/")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeReports(
  reports: NwsLocalStormReport[],
): NwsLocalStormReport[] {
  const newestById = new Map<string, NwsLocalStormReport>();
  for (const report of reports) {
    const previous = newestById.get(report.id);
    if (
      !previous ||
      Date.parse(report.publishedAt ?? "") >
        Date.parse(previous.publishedAt ?? "")
    ) {
      newestById.set(report.id, report);
    }
  }
  return [...newestById.values()].sort(
    (left, right) =>
      Date.parse(right.occurredAt ?? "") - Date.parse(left.occurredAt ?? ""),
  );
}

type LoadNwsLocalStormReportOptions = {
  deadlineMs?: number;
  revalidateSeconds?: number;
  maxAgeHours?: number;
  maxProducts?: number;
  now?: Date;
};

export async function getNwsLocalStormReportsResult({
  deadlineMs = 8_000,
  revalidateSeconds = 600,
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  maxProducts = DEFAULT_MAX_PRODUCTS,
  now = new Date(),
}: LoadNwsLocalStormReportOptions = {}): Promise<NwsLocalStormReportsResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const unavailable = (
    attemptedProducts = 0,
    loadedProducts = 0,
  ): NwsLocalStormReportsResult => ({
    reports: [],
    available: false,
    degraded: attemptedProducts > loadedProducts,
    asOf: null,
    attemptedProducts,
    loadedProducts,
    coverageNote:
      "Preliminary local storm observations only; use active NWS alerts for current warning status.",
  });

  try {
    const indexResponse = await fetch(LWX_LSR_INDEX, {
      headers: {
        Accept: "application/ld+json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
      next: { revalidate: revalidateSeconds },
    });
    if (!indexResponse.ok) return unavailable();
    const index = (await indexResponse.json().catch(() => null)) as
      | NwsProductIndex
      | null;
    if (!index || !Array.isArray(index["@graph"])) return unavailable();

    const references = index["@graph"]
      .map((reference) => ({
        reference,
        url: officialNwsProductUrl(reference["@id"] ?? ""),
        issuedAt: isoOrNull(reference.issuanceTime),
      }))
      .filter(
        (
          item,
        ): item is {
          reference: NwsProductReference;
          url: string;
          issuedAt: string;
        } =>
          Boolean(item.url) &&
          Boolean(item.issuedAt) &&
          item.reference.productCode === "LSR" &&
          item.reference.issuingOffice === "KLWX",
      )
      .filter(
        (item) =>
          now.getTime() - Date.parse(item.issuedAt) <=
          (maxAgeHours + 12) * 60 * 60 * 1_000,
      )
      .sort(
        (left, right) =>
          Date.parse(right.issuedAt) - Date.parse(left.issuedAt),
      )
      .slice(0, Math.max(0, Math.min(maxProducts, 40)));

    const asOf =
      index["@graph"]
        .map((reference) => isoOrNull(reference.issuanceTime))
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    if (references.length === 0) {
      return {
        reports: [],
        available: true,
        degraded: false,
        asOf,
        attemptedProducts: 0,
        loadedProducts: 0,
        coverageNote:
          "Preliminary local storm observations only; use active NWS alerts for current warning status.",
      };
    }

    const products = await Promise.all(
      references.map(async ({ url, issuedAt }) => {
        try {
          const response = await fetch(url, {
            headers: {
              Accept: "application/ld+json",
              "User-Agent": USER_AGENT,
            },
            signal: controller.signal,
            next: { revalidate: revalidateSeconds },
          });
          if (!response.ok) return null;
          const product = (await response.json().catch(() => null)) as
            | NwsProduct
            | null;
          if (!product || typeof product.productText !== "string") return null;
          return {
            product,
            url,
            issuedAt:
              isoOrNull(product.issuanceTime) ?? issuedAt,
          };
        } catch {
          return null;
        }
      }),
    );

    const loaded = products.filter(
      (
        product,
      ): product is {
        product: NwsProduct & { productText: string };
        url: string;
        issuedAt: string;
      } => Boolean(product),
    );
    const retrievedAt = now.toISOString();
    const reports = dedupeReports(
      loaded
        .flatMap(({ product, url, issuedAt }) =>
          parseNwsLocalStormReportProduct(product.productText, {
            productUrl: url,
            issuedAt,
            retrievedAt,
            now,
            maxAgeHours,
          }),
        )
        .filter((report) => report.state === "recent"),
    );

    return {
      reports,
      available: loaded.length > 0,
      degraded: loaded.length < references.length,
      asOf,
      attemptedProducts: references.length,
      loadedProducts: loaded.length,
      coverageNote:
        "Preliminary local storm observations only; use active NWS alerts for current warning status.",
    };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}

export async function getNwsLocalStormReports(
  options: LoadNwsLocalStormReportOptions = {},
): Promise<NwsLocalStormReport[]> {
  return (await getNwsLocalStormReportsResult(options)).reports;
}
