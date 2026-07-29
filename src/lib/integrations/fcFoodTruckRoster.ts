/**
 * Frederick County Health Department licensed mobile-unit roster discovery.
 *
 * CivicPlus keeps a stable page but can replace the PDF behind its
 * DocumentCenter link without changing the old-looking URL slug. This adapter
 * discovers the current link from the official page and reads document
 * metadata from the response headers.
 *
 * It deliberately does not parse the PDF on the request path. PDF table
 * extraction is layout-sensitive, and a silent column shift could publish a
 * business name beside the wrong license data. A vetted cron/build parser can
 * be added later against saved fixtures. Until then Radius can truthfully know
 * that a current official roster document exists and when the filename says it
 * was issued.
 */
import { unstable_cache } from "next/cache";
import {
  type CountyDataSnapshot,
  type CountySourceDescriptor,
  frederickCountySourceEnabled,
} from "./fcCountySource";

const PAGE_URL =
  "https://health.frederickcountymd.gov/695/Mobile-UnitsFood-Trucks";
const CACHE_SECONDS = 86_400;
const TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_PDF_BYTES = 10_000_000;

export const FC_FOOD_TRUCK_ROSTER_SOURCE: CountySourceDescriptor = {
  id: "frederick-county-licensed-mobile-units",
  ledgerId: "fc_food_truck_roster",
  title: "Mobile Units Licensed to Operate in Frederick County",
  authority: "Frederick County Health Department",
  sourceUrl: PAGE_URL,
  dataUrl: PAGE_URL,
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "A license record does not establish that a truck is open, operating today, or located at a particular place.",
};

export type LicensedFoodTruckRosterDocument = {
  kind: "licensed_mobile_unit_roster";
  format: "pdf";
  documentUrl: string;
  fileName?: string;
  dataAsOf?: string;
  byteLength?: number;
  rosterEntries: "not_parsed_at_runtime";
  openStatus: "not_provided";
  currentLocation: "not_provided";
};

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};

function disabledSnapshot(): CountyDataSnapshot<LicensedFoodTruckRosterDocument> {
  return {
    configured: false,
    availability: "disabled",
    records: [],
    provenance: {
      ...FC_FOOD_TRUCK_ROSTER_SOURCE,
      checkedAt: new Date().toISOString(),
    },
  };
}

function unavailableSnapshot(
  checkedAt: string,
  sourceResponseAt?: string,
): CountyDataSnapshot<LicensedFoodTruckRosterDocument> {
  return {
    configured: true,
    availability: "unavailable",
    records: [],
    provenance: {
      ...FC_FOOD_TRUCK_ROSTER_SOURCE,
      checkedAt,
      sourceResponseAt,
    },
  };
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, "/");
}

function anchorText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeRosterDocumentUrl(value: string, pageUrl: string): string | undefined {
  try {
    const url = new URL(decodeHtmlAttribute(value), pageUrl);
    if (url.protocol !== "https:") return undefined;
    if (url.hostname.toLowerCase() !== "health.frederickcountymd.gov") {
      return undefined;
    }
    if (!/^\/DocumentCenter\/View\/\d+(?:\/|$)/i.test(url.pathname)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Discover the roster link by semantic anchor text, not the stale filename in
 * the page URL. External and non-DocumentCenter links are rejected.
 */
export function discoverLicensedRosterUrl(
  html: string,
  pageUrl: string = PAGE_URL,
): string | undefined {
  if (!html || html.length > MAX_PAGE_BYTES) return undefined;
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const text = anchorText(match[2]).toLowerCase();
    if (
      !text.includes("mobile units") ||
      !text.includes("licensed") ||
      !text.includes("frederick county")
    ) {
      continue;
    }
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href) continue;
    const safe = safeRosterDocumentUrl(href, pageUrl);
    if (safe) return safe;
  }
  return undefined;
}

export function fileNameFromContentDisposition(
  contentDisposition: string | null,
): string | undefined {
  if (!contentDisposition) return undefined;
  const utf8 = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const plain =
    contentDisposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1] ??
    contentDisposition.match(/filename\s*=\s*([^;]+)/i)?.[1];
  const raw = (utf8 ?? plain)?.trim();
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw).replace(/[\r\n\u0000]/g, "").trim() || undefined;
  } catch {
    return raw.replace(/[\r\n\u0000]/g, "").trim() || undefined;
  }
}

function fourDigitYear(value: number): number {
  return value < 70 ? 2000 + value : value < 100 ? 1900 + value : value;
}

function validIsoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/** Parse only an explicit "As of" date (or CivicPlus' YYYYMMDD suffix). */
export function rosterDateFromFileName(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const explicit = fileName.match(
    /\bas[\s._-]*of[\s._-]*(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})(?=[^0-9]|$)/i,
  );
  if (explicit) {
    return validIsoDate(
      fourDigitYear(Number(explicit[3])),
      Number(explicit[1]),
      Number(explicit[2]),
    );
  }
  const suffix = fileName.match(/(?:^|[_-])((?:19|20)\d{2})(\d{2})(\d{2})(?:\d{6})?(?:\.pdf)?$/i);
  return suffix
    ? validIsoDate(Number(suffix[1]), Number(suffix[2]), Number(suffix[3]))
    : undefined;
}

function responseDate(headers: Headers): string | undefined {
  const raw = headers.get("date");
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function contentLength(headers: Headers): number | undefined {
  const value = Number(headers.get("content-length"));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Network worker exported for focused tests and future cron use. It remains
 * permission-gated itself, so calling the lower-level function cannot bypass
 * the production gate.
 */
export async function fetchLicensedFoodTruckRosterDocument(): Promise<
  CountyDataSnapshot<LicensedFoodTruckRosterDocument>
> {
  if (!frederickCountySourceEnabled(FC_FOOD_TRUCK_ROSTER_SOURCE.ledgerId)) {
    return disabledSnapshot();
  }
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let sourceResponseAt: string | undefined;

  try {
    const pageInit: NextFetchInit = {
      signal: controller.signal,
      headers: { Accept: "text/html" },
      next: {
        revalidate: CACHE_SECONDS,
        tags: ["fc-food-truck-roster-page"],
      },
    };
    const pageResponse = await fetch(PAGE_URL, pageInit);
    sourceResponseAt = responseDate(pageResponse.headers);
    const pageLength = contentLength(pageResponse.headers);
    if (
      !pageResponse.ok ||
      (pageLength != null && pageLength > MAX_PAGE_BYTES) ||
      !pageResponse.headers.get("content-type")?.toLowerCase().includes("text/html")
    ) {
      return unavailableSnapshot(checkedAt, sourceResponseAt);
    }
    const html = await pageResponse.text();
    const documentUrl = discoverLicensedRosterUrl(html);
    if (!documentUrl) return unavailableSnapshot(checkedAt, sourceResponseAt);

    // CivicPlus returns 404 for HEAD, so request the document and stop after
    // headers. The PDF itself is not parsed on a user request.
    const pdfResponse = await fetch(documentUrl, {
      signal: controller.signal,
      headers: { Accept: "application/pdf" },
      cache: "no-store",
    });
    sourceResponseAt = responseDate(pdfResponse.headers) ?? sourceResponseAt;
    const byteLength = contentLength(pdfResponse.headers);
    const contentType = pdfResponse.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !pdfResponse.ok ||
      !contentType.includes("application/pdf") ||
      (byteLength != null && byteLength > MAX_PDF_BYTES)
    ) {
      await pdfResponse.body?.cancel().catch(() => undefined);
      return unavailableSnapshot(checkedAt, sourceResponseAt);
    }
    const fileName = fileNameFromContentDisposition(
      pdfResponse.headers.get("content-disposition"),
    );
    await pdfResponse.body?.cancel().catch(() => undefined);
    const record: LicensedFoodTruckRosterDocument = {
      kind: "licensed_mobile_unit_roster",
      format: "pdf",
      documentUrl,
      fileName,
      dataAsOf: rosterDateFromFileName(fileName),
      byteLength,
      rosterEntries: "not_parsed_at_runtime",
      openStatus: "not_provided",
      currentLocation: "not_provided",
    };

    return {
      configured: true,
      availability: "available",
      records: [record],
      provenance: {
        ...FC_FOOD_TRUCK_ROSTER_SOURCE,
        dataUrl: documentUrl,
        checkedAt,
        sourceResponseAt,
      },
    };
  } catch {
    return unavailableSnapshot(checkedAt, sourceResponseAt);
  } finally {
    clearTimeout(timer);
  }
}

const getCachedLicensedRoster = unstable_cache(
  fetchLicensedFoodTruckRosterDocument,
  [
    "fc-food-truck-roster-document-v1",
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED ?? "disabled",
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES ?? "none",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  ],
  { revalidate: CACHE_SECONDS },
);

export async function getLicensedFoodTruckRosterDocument(): Promise<
  CountyDataSnapshot<LicensedFoodTruckRosterDocument>
> {
  // Gate before consulting a persistent cache so a disabled deployment cannot
  // receive data cached by an approved deployment.
  if (!frederickCountySourceEnabled(FC_FOOD_TRUCK_ROSTER_SOURCE.ledgerId)) {
    return disabledSnapshot();
  }
  return getCachedLicensedRoster();
}
