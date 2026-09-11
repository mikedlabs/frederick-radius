import {
  classifyOfficialCommerceLinks,
  isSafeOfficialCommerceDestination,
  type ExtractedBusinessCommerceLink,
  type PageAnchor,
} from "./official-commerce-links";
import { businessInfoSourceKind } from "./business-info-source-policy";
import { dedupeCommerceDestinations } from "@/lib/commerce/canonical";

export const FOOD_DRINK_CATEGORIES = new Set([
  "bar",
  "bakery",
  "brewery",
  "coffee",
  "ice-cream",
  "pizza",
  "restaurant",
  "winery",
]);

export type CommerceSource = {
  /** Final official page whose anchors were inspected. */
  url: string;
  /** This timestamp applies only to commerce-link discovery. */
  checkedAt: string;
};

export type CommerceRefreshRecord = {
  name?: string;
  commerce_links?: ExtractedBusinessCommerceLink[];
  commerce_source?: CommerceSource;
  /** Source for prose/hours/specials, which commerce refreshes never mutate. */
  source?: { url: string; fetchedAt: string };
  [key: string]: unknown;
};

export type CommerceCoverage = {
  places: number;
  checked: number;
  withLinks: number;
  links: number;
  byType: Record<string, number>;
};

export function commerceCoverage(
  slugs: string[],
  records: Record<string, CommerceRefreshRecord>,
): CommerceCoverage {
  let checked = 0;
  let withLinks = 0;
  let links = 0;
  const byType: Record<string, number> = {};
  for (const slug of slugs) {
    const record = records[slug];
    if (record?.commerce_source?.checkedAt) checked += 1;
    const directLinks = Array.isArray(record?.commerce_links)
      ? record.commerce_links
      : [];
    if (directLinks.length) withLinks += 1;
    links += directLinks.length;
    for (const link of directLinks) {
      if (!link?.type) continue;
      byType[link.type] = (byType[link.type] ?? 0) + 1;
    }
  }
  return { places: slugs.length, checked, withLinks, links, byType };
}

function normalizedHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function excludedHostMatches(host: string, rawRule: string): boolean {
  const rule = rawRule.toLowerCase().trim().replace(/^www\./, "");
  if (!rule) return false;
  if (rule.startsWith(".")) {
    const domain = rule.slice(1);
    return host === domain || host.endsWith(`.${domain}`);
  }
  if (rule.includes(".")) {
    return host === rule || host.endsWith(`.${rule}`);
  }
  return host.includes(rule);
}

/** Reject directories, social profiles, government pages, and unsafe URLs. */
export function isEligibleOfficialBusinessWebsite(
  url: string,
  businessName: string,
  excludedDomains: string[],
): boolean {
  const host = normalizedHostname(url);
  if (!host) return false;
  if (businessInfoSourceKind(url, businessName) !== "business_website") {
    return false;
  }
  return !excludedDomains.some((rule) => excludedHostMatches(host, rule));
}

export function commerceRefreshIsFresh(
  record: CommerceRefreshRecord | undefined,
  nowMs: number,
  refreshDays: number,
): boolean {
  const checked = record?.commerce_source?.checkedAt;
  if (!checked) return false;
  const checkedMs = Date.parse(checked);
  if (!Number.isFinite(checkedMs)) return false;
  return checkedMs >= nowMs - refreshDays * 86_400_000;
}

/**
 * Merge a successful commerce crawl without changing the freshness/source of
 * descriptions, hours, specials, or any other business facts.
 */
export function mergeCommerceRefresh(
  existing: CommerceRefreshRecord | undefined,
  input: {
    name: string;
    links: ExtractedBusinessCommerceLink[];
    sourceUrl: string;
    checkedAt: string;
  },
): CommerceRefreshRecord {
  const next: CommerceRefreshRecord = {
    ...(existing ?? {}),
    name: input.name,
    commerce_source: {
      url: input.sourceUrl,
      checkedAt: input.checkedAt,
    },
  };
  if (input.links.length) {
    next.commerce_links = input.links;
  } else {
    delete next.commerce_links;
  }
  return next;
}

function sameSiteFamily(left: string, right: string): boolean {
  const a = normalizedHostname(left);
  const b = normalizedHostname(right);
  return Boolean(
    a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)),
  );
}

const DISCOVERY_TEXT =
  /\b(?:dining|eat(?:\s*(?:&|and)\s*drink)?|food(?:\s*(?:&|and)\s*drink)?|our food|restaurants?)\b/i;
const DISCOVERY_PATH =
  /(?:^|[-_/])(?:dining|eat-and-drink|eat-drink|food-and-drink|food-drink|our-food|restaurants?)(?:[-_/]|$)/i;
const REJECT_FOLLOW_PATH =
  /(?:^|[-_/])(?:account|admin|archive|author|blog|blogs|cart|categories|category|checkout|login|privacy|search|tag|tags|terms)(?:[-_/]|$)/i;
const FILE_PATH = /\.(?:pdf|jpe?g|png|gif|webp|svg|zip)(?:$|\?)/i;

/**
 * Pick a very small number of same-site index pages that may reveal exact
 * menu/ordering anchors. This is intentionally not a general web spider.
 */
export function selectCommerceDiscoveryPages(
  anchors: PageAnchor[],
  officialUrl: string,
  currentPageUrl: string,
  maxPages: number,
): string[] {
  if (maxPages <= 0) return [];
  const current = (() => {
    try {
      const url = new URL(currentPageUrl);
      url.hash = "";
      return url.toString();
    } catch {
      return currentPageUrl;
    }
  })();
  const scored: Array<{ url: string; score: number; index: number }> = [];
  const seen = new Set<string>();

  anchors.forEach((anchor, index) => {
    let url: URL;
    try {
      url = new URL(anchor.url);
    } catch {
      return;
    }
    if (
      !sameSiteFamily(officialUrl, url.toString()) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      FILE_PATH.test(`${url.pathname}${url.search}`) ||
      REJECT_FOLLOW_PATH.test(url.pathname)
    ) {
      return;
    }
    url.hash = "";
    const candidate = url.toString();
    if (candidate === current || seen.has(candidate)) return;
    const textMatch = DISCOVERY_TEXT.test(anchor.text);
    const pathMatch = DISCOVERY_PATH.test(url.pathname);
    if (!textMatch && !pathMatch) return;
    seen.add(candidate);
    scored.push({
      url: candidate,
      score: (textMatch ? 2 : 0) + (pathMatch ? 1 : 0),
      index,
    });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxPages)
    .map(({ url }) => url);
}

export function mergeDistinctCommerceLinks(
  groups: ExtractedBusinessCommerceLink[][],
): ExtractedBusinessCommerceLink[] {
  const merged: ExtractedBusinessCommerceLink[] = [];
  const maxByType: Record<ExtractedBusinessCommerceLink["type"], number> = {
    menu: 4,
    order: 2,
    reservation: 2,
    catering: 2,
    gift_card: 2,
  };
  const typeCounts = new Map<ExtractedBusinessCommerceLink["type"], number>();
  for (const link of dedupeCommerceDestinations(groups.flat())) {
    const count = typeCounts.get(link.type) ?? 0;
    if (count >= maxByType[link.type]) continue;
    merged.push(link);
    typeCounts.set(link.type, count + 1);
  }
  return merged;
}

/**
 * Drop a clearly different location when an official multi-location site puts
 * several stores on one page. A five-digit ZIP in the destination is strong,
 * deterministic evidence; names alone are too ambiguous to use as a filter.
 */
export function filterCommerceLinksForPlace(
  links: ExtractedBusinessCommerceLink[],
  context: { postalCode?: string },
): ExtractedBusinessCommerceLink[] {
  const postalCode = context.postalCode?.trim();
  if (!postalCode || !/^\d{5}$/.test(postalCode)) return links;
  return links.filter((link) => {
    let value = link.url;
    try {
      value = decodeURIComponent(value);
    } catch {
      // The literal URL can still be checked safely.
    }
    const zips = Array.from(
      value.matchAll(/(?:^|[^0-9])(\d{5})(?=[^0-9]|$)/g),
      (match) => match[1]!,
    );
    return zips.length === 0 || zips.includes(postalCode);
  });
}

/**
 * Re-run already stored anchors through the current deterministic classifier.
 * This lets a stricter release remove item-level links or reclassify a
 * "View menu" anchor without re-downloading every official site.
 */
export function sanitizeStoredCommerceLinks(
  links: ExtractedBusinessCommerceLink[] | undefined,
  context: { postalCode?: string } = {},
): ExtractedBusinessCommerceLink[] {
  if (!links?.length) return [];
  const classified = links.flatMap((link) =>
    classifyOfficialCommerceLinks(
      [{ url: link.url, text: link.anchor_text ?? "" }],
      link.source_url,
    ),
  );
  return filterCommerceLinksForPlace(
    mergeDistinctCommerceLinks([classified]),
    context,
  );
}

/**
 * Reject only a definitive dead destination or a redirect that leaves the
 * source site's trusted destination boundary. Transient failures, bot blocks,
 * and rate limits remain as imported links because a normal browser may still
 * open them; the public UI never labels extracted links as verified.
 */
export function shouldKeepCommerceLinkAfterProbe(
  link: ExtractedBusinessCommerceLink,
  probe: { status: number; finalUrl: string },
): boolean {
  if (probe.status === 404 || probe.status === 410) return false;
  return isSafeOfficialCommerceDestination(
    link.source_url,
    probe.finalUrl,
    link.type,
  );
}
