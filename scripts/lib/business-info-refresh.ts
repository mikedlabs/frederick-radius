import type { ExtractedBusinessCommerceLink } from "./official-commerce-links";
import {
  mergeDistinctCommerceLinks,
  sanitizeStoredCommerceLinks,
} from "./official-commerce-refresh";
import type { ExtractedBusinessInfo } from "./business-info-copy";

export type BusinessInfoRecord = ExtractedBusinessInfo & {
  name?: string;
  commerce_links?: ExtractedBusinessCommerceLink[];
  commerce_source?: {
    url: string;
    checkedAt: string;
  };
  reservations_url?: string;
  source?: {
    url: string;
    fetchedAt: string;
    contentHash?: string;
    extractorVersion?: string;
  };
};

const REFRESHED_FACT_FIELDS = [
  "known_for",
  "happy_hour",
  "specials",
  "hours_text",
  "notable",
] as const;

/**
 * Add newly observed home-page actions without erasing previously collected
 * deep-page actions. Existing links are re-run through today's classifier, so
 * preservation never revives an item link, directory action, or other now-
 * rejected destination. `commerce_source` remains the timestamp of the
 * dedicated commerce crawl.
 */
export function mergeBusinessInfoCommerceEvidence(
  prior: BusinessInfoRecord | undefined,
  input: {
    name: string;
    commerceLinks: ExtractedBusinessCommerceLink[];
  },
): BusinessInfoRecord {
  const next: BusinessInfoRecord = {
    ...(prior ?? {}),
    name: input.name,
  };
  const preserved = sanitizeStoredCommerceLinks(prior?.commerce_links);
  const links = mergeDistinctCommerceLinks([
    input.commerceLinks,
    preserved,
  ]);
  if (links.length) next.commerce_links = links;
  else delete next.commerce_links;
  return next;
}

/**
 * Replace only the model-extracted facts and their source fingerprint. Never
 * make a one-page prose refresh destructive to separately verified commerce
 * provenance or useful deep links.
 */
export function mergeBusinessInfoRefresh(
  prior: BusinessInfoRecord | undefined,
  input: {
    name: string;
    info: ExtractedBusinessInfo;
    commerceLinks: ExtractedBusinessCommerceLink[];
    source: NonNullable<BusinessInfoRecord["source"]>;
  },
): BusinessInfoRecord {
  const next = mergeBusinessInfoCommerceEvidence(prior, input);
  for (const field of REFRESHED_FACT_FIELDS) delete next[field];
  Object.assign(next, input.info);
  next.source = input.source;
  return next;
}
