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
    /** Where and when this crawl actually looked. Used ONLY to date a record
     *  that would otherwise carry published links and no timestamp at all. */
    observed?: { url: string; checkedAt: string };
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

  // Never publish a record that cannot be dated.
  //
  // This function intentionally does not advance `source.fetchedAt` — the
  // caller that failed a Claude extraction relies on the stale stamp to force
  // a retry — and it treats `commerce_source` as belonging to the dedicated
  // commerce crawl. Both are right, and together they left a gap: a place
  // being seen for the FIRST time, whose extraction failed but whose home page
  // yielded links, was written with commerce_links and no timestamp of any
  // kind. Five such rows accumulated on bot/business-info-refresh and failed
  // the artifact-evidence gate, which requires every published row to be
  // datable so one fresh row cannot make a stale batch look current. That gate
  // is correct, so the record has to carry its date.
  //
  // Only stamps when there is nothing to lose: an existing commerce_source or
  // source stamp always wins, so a dedicated crawl's timestamp is never
  // overwritten by an incidental one.
  if (
    next.commerce_links?.length
    && input.observed
    && !next.commerce_source?.checkedAt
    && !next.source?.fetchedAt
  ) {
    next.commerce_source = {
      url: input.observed.url,
      checkedAt: input.observed.checkedAt,
    };
  }
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
