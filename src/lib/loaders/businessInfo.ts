import RAW from "@/data/business-info.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import {
  detectProvider,
  isCommerceSearchLink,
} from "@/lib/commerce/links";
import type {
  CommerceLink,
  CommerceLinkType,
} from "@/lib/commerce/types";
import { deepCleanStrings } from "@/lib/format/text";

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
  notable?: string;
  name?: string;
  source: { url: string; fetchedAt: string };
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

  const allowedTypes = new Set<BusinessInfoCommerceLink["type"]>([
    "menu",
    "order",
    "reservation",
    "catering",
    "gift_card",
  ]);
  const seenTypes = new Set<BusinessInfoCommerceLink["type"]>();
  const links: CommerceLink[] = [];

  const add = (
    type: BusinessInfoCommerceLink["type"],
    rawUrl: string | undefined,
  ) => {
    if (seenTypes.has(type) || !rawUrl?.trim()) return;
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

    links.push({
      place_id: slug,
      type,
      url: url.toString(),
      provider,
      source: "imported",
      last_verified_at: info.source.fetchedAt,
      notes: "Published on the business's official website.",
    });
    seenTypes.add(type);
  };

  // The extractor preserves every classified anchor in score order. The
  // public commerce block stays calm by exposing the strongest link per type.
  for (const raw of info.commerce_links ?? []) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !allowedTypes.has(raw.type) ||
      typeof raw.url !== "string"
    ) {
      continue;
    }
    add(raw.type, raw.url);
  }

  // Backward compatibility for the two records written before direct anchor
  // collection. It fills only when no deterministic reservation link exists.
  add("reservation", info.reservations_url);
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
