import RAW from "@/data/business-info.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import {
  detectProvider,
  isCommerceSearchLink,
} from "@/lib/commerce/links";
import {
  commerceDestinationKey,
  dedupeCommerceDestinations,
} from "@/lib/commerce/canonical";
import type {
  CommerceLink,
  CommerceLinkType,
} from "@/lib/commerce/types";
import { deepCleanStrings } from "@/lib/format/text";
import { businessInfoSourceKind } from "../../../scripts/lib/business-info-source-policy";

/**
 * Business deep-info loader.
 *
 * Reads what the business-info agent (scripts/ingest-business-info.ts)
 * pulled from each place's own website — the buried stuff Google's
 * listing doesn't carry: what a place is known for, its happy hour,
 * recurring specials, published hours. Keyed by place slug, with source
 * + freshness so the UI can show "via theirsite.com · updated 2w ago".
 *
 * Empty until the agent runs (needs ANTHROPIC_API_KEY); every helper
 * degrades to null/[] so surfaces render fine in the meantime.
 */
export type BusinessInfo = {
  known_for?: string;
  happy_hour?: string;
  specials?: string[];
  hours_text?: string;
  reservations_url?: string;
  commerce_links?: BusinessInfoCommerceLink[];
  commerce_source?: {
    /** Final official page whose real anchors were inspected. */
    url: string;
    /** Separate from prose/hours freshness; a link crawl verifies links only. */
    checkedAt: string;
  };
  notable?: string;
  name?: string;
  source?: { url: string; fetchedAt: string };
};

export type BusinessInfoCommerceLink = {
  type: Extract<
    CommerceLinkType,
    "menu" | "order" | "reservation" | "catering" | "gift_card"
  >;
  url: string;
  anchor_text?: string;
  source_url: string;
};

// Boundary cleaning, never render-time (same pass fieldNotes.ts runs):
// business-info.json is agent-written, so its strings bypass cleanFeedText
// and the ESLint JSXText em-dash guard. Normalize on read — the Milkhouse
// happy-hour string shipped a raw em dash to the page before this pass.
const DATA = deepCleanStrings(RAW as Record<string, BusinessInfo>);

// Wrong-business quarantine (UX audit P0): the info agent read the WEBSITE
// the misbound Google listing pointed at, so a quarantined slug's "deep
// info" is the other business's menu/specials/hours (the-cozy-creamery
// record was carrying Thurmont Kountry Kitchen's broasted-chicken deal,
// "via thurmontkountrykitchen.com"). Same clearEnrichment set the place
// loader consumes — every accessor here must honor it.
const QUARANTINED = new Set(
  Object.entries(
    (OVERRIDES_RAW as { patch?: Record<string, { clearEnrichment?: boolean }> }).patch ?? {},
  )
    .filter(([, p]) => p.clearEnrichment)
    .map(([slug]) => slug),
);

/** Deep info for one place, or null if the agent hasn't read it yet. */
export function businessInfoFor(slug: string): BusinessInfo | null {
  if (QUARANTINED.has(slug)) return null;
  return DATA[slug] ?? null;
}

/**
 * Convert source-backed commerce facts from the business-info feed into the
 * same model as curated place links. These links came from the business's
 * official website, but they were extracted rather than human-verified, so
 * they retain imported provenance and never receive a Verified label.
 */
export function commerceLinksFromBusinessInfo(
  slug: string,
  info: BusinessInfo | null,
): CommerceLink[] {
  if (!info) return [];

  const businessName = info.name?.trim();
  const isOwnedBusinessSource = (rawUrl: string | undefined): boolean =>
    Boolean(
      businessName &&
        rawUrl &&
        businessInfoSourceKind(rawUrl, businessName) === "business_website",
    );
  const commerceRecordSource = info.commerce_source?.url ?? info.source?.url;
  const mayUseStoredCommerceLinks = isOwnedBusinessSource(
    commerceRecordSource,
  );

  const allowedTypes = new Set<BusinessInfoCommerceLink["type"]>([
    "menu",
    "order",
    "reservation",
    "catering",
    "gift_card",
  ]);
  const seen = new Set<string>();
  const typeCounts = new Map<BusinessInfoCommerceLink["type"], number>();
  const links: CommerceLink[] = [];

  const menuLabel = (anchorText: string | undefined): string | undefined => {
    const text = anchorText?.replace(/\s+/g, " ").trim();
    if (!text) return undefined;
    if (/\bkids?(?:'|’)?\b/i.test(text)) return "Kids menu";
    if (/\bbrunch\b/i.test(text)) return "Brunch menu";
    if (/\blunch\b/i.test(text)) return "Lunch menu";
    if (/\bdinner\b/i.test(text)) return "Dinner menu";
    if (/\bdessert\b/i.test(text)) return "Dessert menu";
    if (/\b(?:drink|cocktail|wine|beer|tapped)\b/i.test(text)) {
      return "Drinks menu";
    }
    if (/\bpdf\b/i.test(text)) return "Menu PDF";
    return undefined;
  };

  const add = (
    type: BusinessInfoCommerceLink["type"],
    rawUrl: string | undefined,
    anchorText?: string,
  ) => {
    if (!rawUrl?.trim()) return;
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (!url.hostname || url.username || url.password) return;
    url.hash = "";
    const provider = detectProvider(url.toString());
    if (isCommerceSearchLink({ provider, url: url.toString() })) return;
    const key = commerceDestinationKey(url.toString());
    if (!key) return;
    if (seen.has(key)) return;
    const typeCount = typeCounts.get(type) ?? 0;
    const typeLimit = type === "menu" ? 4 : 1;
    if (typeCount >= typeLimit) return;
    const label = type === "menu" ? menuLabel(anchorText) : undefined;

    links.push({
      place_id: slug,
      type,
      url: url.toString(),
      provider,
      ...(label ? { label } : {}),
      source: "imported",
      last_verified_at:
        info.commerce_source?.checkedAt ?? info.source?.fetchedAt,
      notes: "Published on the business's official website.",
    });
    seen.add(key);
    typeCounts.set(type, typeCount + 1);
  };

  // The extractor preserves classified anchors in score order. Keep one
  // action for each commerce type, but retain a few meaningfully different
  // official menu documents (main, kids, brunch, drinks) on the detail page.
  for (const raw of dedupeCommerceDestinations(info.commerce_links ?? [])) {
    if (
      !mayUseStoredCommerceLinks ||
      !raw ||
      typeof raw !== "object" ||
      !allowedTypes.has(raw.type) ||
      typeof raw.url !== "string" ||
      !isOwnedBusinessSource(raw.source_url)
    ) {
      continue;
    }
    add(raw.type, raw.url, raw.anchor_text);
  }

  // Backward compatibility for the two records written before direct anchor
  // collection. It fills only when no deterministic reservation link exists.
  if (isOwnedBusinessSource(info.source?.url)) {
    add("reservation", info.reservations_url);
  }
  return links;
}

/** Commerce facts for one place, honoring the same enrichment quarantine. */
export function businessInfoCommerceLinks(slug: string): CommerceLink[] {
  return commerceLinksFromBusinessInfo(slug, businessInfoFor(slug));
}

/** Whether a place has any surface-worthy buried info on file. */
export function hasBusinessInfo(slug: string): boolean {
  if (QUARANTINED.has(slug)) return false;
  const d = DATA[slug];
  return Boolean(
    d && (d.known_for || d.happy_hour || d.specials?.length || d.notable),
  );
}

/** Every place with a happy hour on file — powers a future "happy hour
 *  near me right now" surface (the answer-engine slice the brief wants). */
export function placesWithHappyHour(): Array<{ slug: string } & BusinessInfo> {
  return Object.entries(DATA)
    .filter(([slug, d]) => Boolean(d.happy_hour) && !QUARANTINED.has(slug))
    .map(([slug, d]) => ({ slug, ...d }));
}

/** "updated 2w ago" style label from an ISO timestamp. */
export function freshnessLabel(iso?: string): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
