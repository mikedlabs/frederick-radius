/**
 * Business deep-info extraction agent.
 *
 * The buried-info moat at scale. Where the civic/venue agents read a
 * hand-listed set of URLs, this one reads the website each place ALREADY
 * has on file (src/data/places-enrichment.json — 2,887 of them) and
 * pulls the things Google doesn't surface: what a place is known for,
 * its happy hour, recurring specials, published hours, and exact commerce
 * anchors for menus, ordering, reservations, catering, and gift cards.
 *
 * Public places with no decision-useful Radius copy are read first, regardless
 * of category. Once those gaps are covered, routine refreshes stay focused on
 * food/drink (where this information matters and changes most often). Every
 * batch remains bounded by the same configured limit and reads only own-domain
 * business sites, never government, directory, marketplace, or social pages.
 * Adaptive fetch: tries a plain request first (most small-business sites
 * are readable), falls back to a headless render only when the static
 * HTML comes back too thin (JS-rendered). Incremental: skips anything
 * fetched within `refreshDays` unless --force.
 *
 * Run:  npm run ingest:business                 (a batch, up to defaultLimit)
 *       npm run ingest:business -- --limit=200   (bigger batch)
 *       npm run ingest:business ayse-meze-frederick   (one place, by slug)
 *       npm run ingest:business -- --force        (re-fetch even fresh ones)
 *       npm run ingest:business -- --plan         (show the queue; spend $0)
 * Needs: ANTHROPIC_API_KEY. Scheduled by .github/workflows/ingest-business-info.yml.
 *
 * Never fabricates — the shared extractor omits anything not on the page.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractJson,
  fetchPageSnapshot,
  nowISO,
  preflightKey,
  type PageSnapshot,
} from "./lib/extract-agent";
import {
  classifyOfficialCommerceLinks,
  type ExtractedBusinessCommerceLink,
} from "./lib/official-commerce-links";
import {
  isTrustedBusinessWebsiteRedirect,
  needsRenderedBusinessSnapshot,
  preferredBusinessWebsiteUrls,
} from "./lib/business-info-source";
import {
  isRoutineBusinessInfoType,
  prioritizeBusinessInfoCandidates,
} from "./lib/business-info-priority";
import {
  hashSourceContent,
  sourceFingerprintMatches,
} from "./lib/source-content-fingerprint";
import { businessInfoSourceKind } from "./lib/business-info-source-policy";
import {
  BUSINESS_INFO_SHAPE,
  cleanExtractedBusinessInfo,
  type ExtractedBusinessInfo,
} from "./lib/business-info-copy";
import {
  mergeBusinessInfoCommerceEvidence,
  mergeBusinessInfoRefresh,
} from "./lib/business-info-refresh";
import { publicPlaceBySlug } from "@/lib/loaders/places";
import { isDestinationCategory } from "@/lib/relevance";
import {
  decisionCopyCounts,
  hasUsefulDecisionCopy,
  type CoveragePlace,
} from "@/lib/quality/coverage";

const OUT = resolve("src/data/business-info.json");
const ENR = resolve("src/data/places-enrichment.json");
const PUBLIC = resolve("src/data/places-client.json");
const CFG = resolve("config/business-info.json");
const BUSINESS_EXTRACTOR_VERSION = "business-deep-info-v2-plain-copy";

type Enrichment = Record<
  string,
  { website?: string; primary_type?: string; display_name?: string }
>;
type Cfg = {
  typeIncludes: string[];
  excludeDomains: string[];
  refreshDays: number;
  defaultLimit: number;
  renderFallbackMinChars: number;
};
type Record_ = ExtractedBusinessInfo & {
  name?: string;
  commerce_links?: ExtractedBusinessCommerceLink[];
  /** Backward compatibility for records written before deterministic anchors. */
  reservations_url?: string;
  source?: {
    url: string;
    fetchedAt: string;
    /** SHA-256 of the normalized text successfully processed by Claude. */
    contentHash?: string;
    /** Bump when the extraction instructions materially change. */
    extractorVersion?: string;
  };
};
type PublicPlace = CoveragePlace & {
  category?: string;
  feature_score?: number;
  google_rating_count?: number;
  hidden_gem?: boolean;
  local_favorite?: boolean;
  primary_type?: string;
};
type QueueCandidate = {
  slug: string;
  website: string;
  displayName: string;
  primaryType?: string;
  hasUsefulCopy: boolean;
  hasExistingSource: boolean;
  hasDecisionFact: boolean;
  fetchedAt?: string;
  importance?: number;
  routineRefresh: boolean;
  explicitRequest?: boolean;
};

function domainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Plain fetch first. Render only when the static HTML is missing or thin. */
async function fetchAdaptive(
  url: string,
  minChars: number,
): Promise<PageSnapshot | null> {
  let fallback: PageSnapshot | null = null;
  for (const candidateUrl of preferredBusinessWebsiteUrls(url)) {
    const plain = await fetchPageSnapshot(candidateUrl, { maxChars: 16_000 });
    if (!needsRenderedBusinessSnapshot(plain, minChars)) {
      return plain;
    }
    const rendered = await fetchPageSnapshot(candidateUrl, {
      render: true,
      maxChars: 16_000,
    });
    if (rendered) return rendered;
    fallback ??= plain;
  }
  return fallback;
}

function isAllowedWebsite(url: string, businessName: string, cfg: Cfg): boolean {
  if (!/^https?:/.test(url)) return false;
  const domain = domainOf(url);
  return Boolean(
    domain &&
      businessInfoSourceKind(url, businessName) === "business_website" &&
      !cfg.excludeDomains.some((excluded) => domain.includes(excluded)),
  );
}

function routineType(
  place: Pick<QueueCandidate, "primaryType"> & { category?: string },
  cfg: Cfg,
): boolean {
  return isRoutineBusinessInfoType(
    place.primaryType,
    place.category,
    cfg.typeIncludes,
  );
}

function newerRecord(current: Record_ | undefined, next: Record_): Record_ {
  if (!current) return next;
  const currentTime = Date.parse(current.source?.fetchedAt ?? "");
  const nextTime = Date.parse(next.source?.fetchedAt ?? "");
  if (Number.isNaN(currentTime)) return next;
  if (Number.isNaN(nextTime)) return current;
  return nextTime > currentTime ? next : current;
}

function placeImportance(place: PublicPlace): number {
  const editorial = place.feature_score ?? 0;
  const popularity = Math.log10((place.google_rating_count ?? 0) + 1) * 2;
  const local = place.local_favorite ? 2 : 0;
  const discovery = place.hidden_gem ? 1 : 0;
  const destination = isDestinationCategory(place.category) ? 5 : 0;
  return editorial + popularity + local + discovery + destination;
}

async function main() {
  const positional = process.argv[2];
  const only = positional && !positional.startsWith("--") ? positional : undefined;
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const force = process.argv.includes("--force");
  const planOnly = process.argv.includes("--plan");

  const cfg = JSON.parse(readFileSync(CFG, "utf8")) as Cfg;
  const enr = JSON.parse(readFileSync(ENR, "utf8")) as Enrichment;
  const publicRows = JSON.parse(readFileSync(PUBLIC, "utf8")) as PublicPlace[];
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Record_>;
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : cfg.defaultLimit;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive whole number");
  }

  const requestedSlug = only
    ? publicPlaceBySlug(only)?.slug ?? only
    : undefined;
  const copyCounts = decisionCopyCounts(publicRows);

  // Old extraction runs sometimes wrote a folded/legacy slug. Treat those
  // records as evidence already read for the surviving place, so a duplicate
  // alias cannot spend a second model call.
  const existingByCanonical = new Map<string, Record_>();
  for (const [slug, info] of Object.entries(existing)) {
    const canonical = publicPlaceBySlug(slug)?.slug ?? slug;
    existingByCanonical.set(
      canonical,
      newerRecord(existingByCanonical.get(canonical), info),
    );
  }

  const eligible: QueueCandidate[] = publicRows.flatMap((place) => {
    if (requestedSlug && place.slug !== requestedSlug) return [];
    if (
      !place.website ||
      !isAllowedWebsite(place.website, place.name, cfg)
    ) return [];
    const prior = existingByCanonical.get(place.slug);
    return [{
      slug: place.slug,
      website: place.website,
      displayName: place.name,
      primaryType: place.primary_type,
      hasUsefulCopy: hasUsefulDecisionCopy(place, copyCounts),
      hasExistingSource: Boolean(prior?.source?.url),
      hasDecisionFact: Boolean(prior?.known_for?.trim()),
      fetchedAt: prior?.source?.fetchedAt,
      importance: placeImportance(place),
      routineRefresh: routineType(
        { primaryType: place.primary_type, category: place.category },
        cfg,
      ),
      explicitRequest: Boolean(only),
    }];
  });

  // Preserve the old one-slug diagnostic for a non-public enrichment row.
  // Scheduled work never reaches this branch and remains tied to the exact
  // canonical public artifact.
  if (only && eligible.length === 0) {
    const row = enr[only];
    if (
      row?.website &&
      isAllowedWebsite(row.website, row.display_name ?? only, cfg)
    ) {
      const prior = existing[only];
      eligible.push({
        slug: only,
        website: row.website,
        displayName: row.display_name ?? only,
        primaryType: row.primary_type,
        hasUsefulCopy: false,
        hasExistingSource: Boolean(prior?.source?.url),
        hasDecisionFact: Boolean(prior?.known_for?.trim()),
        fetchedAt: prior?.source?.fetchedAt,
        importance: 0,
        routineRefresh: true,
        explicitRequest: true,
      });
    }
  }

  const todo = prioritizeBusinessInfoCandidates(eligible, {
    force: force || Boolean(only),
    limit,
    refreshDays: cfg.refreshDays,
  });
  const reasonCounts = Object.fromEntries(
    [...new Set(todo.map((row) => row.priorityReason))].map((reason) => [
      reason,
      todo.filter((row) => row.priorityReason === reason).length,
    ]),
  );
  console.log(
    `${eligible.length} eligible business sites; ${todo.length} selected ` +
      `(limit ${limit}; ${JSON.stringify(reasonCounts)}).`,
  );
  if (planOnly) {
    for (const row of todo) {
      console.log(`  ${row.priorityReason}\t${row.slug}\t${row.website}`);
    }
    console.log("\nPlan only. No pages fetched and no model calls made.");
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let modelReady: boolean | undefined;
  const ensureModelReady = async (): Promise<boolean> => {
    if (modelReady !== undefined) return modelReady;
    // Delay the paid liveness ping until a changed payload actually needs the
    // model. A fully unchanged batch therefore makes zero Anthropic calls.
    modelReady = await preflightKey();
    return modelReady;
  };

  for (const candidate of todo) {
    const { slug } = candidate;
    const snapshot = await fetchAdaptive(
      candidate.website,
      cfg.renderFallbackMinChars,
    );
    if (!snapshot) {
      console.log(`  ✗ ${slug}: unreadable (${domainOf(candidate.website)})`);
      continue;
    }
    const finalDomain = domainOf(snapshot.finalUrl);
    if (
      !finalDomain ||
      cfg.excludeDomains.some((domain) => finalDomain.includes(domain))
    ) {
      console.log(`  ✗ ${slug}: redirected to excluded source (${finalDomain})`);
      continue;
    }
    if (!isTrustedBusinessWebsiteRedirect(candidate.website, snapshot.finalUrl)) {
      console.log(
        `  ✗ ${slug}: redirected to unrelated source (${finalDomain})`,
      );
      continue;
    }
    if (
      businessInfoSourceKind(snapshot.finalUrl, candidate.displayName) !==
      "business_website"
    ) {
      console.log(
        `  ✗ ${slug}: final host is not bound to this business (${finalDomain})`,
      );
      continue;
    }
    const contentHash = hashSourceContent(snapshot.text);
    const prior = existingByCanonical.get(slug);
    if (
      sourceFingerprintMatches(
        prior?.source
          ? {
              contentHash: prior.source.contentHash,
              finalUrl: prior.source.url,
              extractorVersion: prior.source.extractorVersion,
            }
          : undefined,
        {
          contentHash,
          finalUrl: snapshot.finalUrl,
          extractorVersion: BUSINESS_EXTRACTOR_VERSION,
        },
      )
    ) {
      const commerceLinks = classifyOfficialCommerceLinks(
        snapshot.links,
        snapshot.finalUrl,
      );
      const refreshed: Record_ = mergeBusinessInfoCommerceEvidence(prior, {
        name: candidate.displayName,
        commerceLinks,
      });
      refreshed.source = {
        url: snapshot.finalUrl,
        fetchedAt: nowISO(),
        contentHash,
        extractorVersion: BUSINESS_EXTRACTOR_VERSION,
      };
      existing[slug] = refreshed;
      existingByCanonical.set(slug, refreshed);
      unchanged += 1;
      console.log(`  = ${slug}: source unchanged; Claude skipped`);
      continue;
    }

    if (!(await ensureModelReady())) break;
    const extracted = await extractJson<unknown>(
      `Business: ${candidate.displayName} (Frederick County, MD).\n${BUSINESS_INFO_SHAPE}`,
      snapshot.text,
    );
    const cleanup = cleanExtractedBusinessInfo(extracted);
    const { info } = cleanup;
    if (cleanup.rewritten.length > 0) {
      console.log(
        `  ~ ${slug}: plain-copy cleanup (${cleanup.rewritten.join(", ")})`,
      );
    }
    for (const dropped of cleanup.dropped) {
      console.log(
        `  - ${slug}: ${dropped.field} withheld by data/copy gate ` +
          `(${dropped.rules.join(", ")})`,
      );
    }
    const commerceLinks = classifyOfficialCommerceLinks(
      snapshot.links,
      snapshot.finalUrl,
    );
    if (extracted === null) {
      // A failed model response must never advance the content fingerprint or
      // replace previously reviewed facts. Deterministic anchors may still be
      // refreshed, but the stale source timestamp remains so the next run
      // retries Claude instead of waiting another refresh window.
      if (commerceLinks.length) {
        const preserved: Record_ = mergeBusinessInfoCommerceEvidence(prior, {
          name: candidate.displayName,
          commerceLinks,
        });
        existing[slug] = preserved;
        existingByCanonical.set(slug, preserved);
      }
      console.log(`  – ${slug}: extraction incomplete; source will retry`);
      continue;
    }
    const has =
      info.known_for ||
      info.happy_hour ||
      (info.specials && info.specials.length) ||
      info.hours_text ||
      info.notable ||
      commerceLinks.length;
    if (!has) {
      const checked: Record_ = mergeBusinessInfoRefresh(prior, {
        name: candidate.displayName,
        info: {},
        commerceLinks,
        source: {
          url: snapshot.finalUrl,
          fetchedAt: nowISO(),
          contentHash,
          extractorVersion: BUSINESS_EXTRACTOR_VERSION,
        },
      });
      existing[slug] = checked;
      existingByCanonical.set(slug, checked);
      updated++;
      console.log(`  – ${slug}: nothing extractable; source fingerprint stored`);
      continue;
    }
    const next: Record_ = mergeBusinessInfoRefresh(prior, {
      name: candidate.displayName,
      info,
      commerceLinks,
      source: {
        url: snapshot.finalUrl,
        fetchedAt: nowISO(),
        contentHash,
        extractorVersion: BUSINESS_EXTRACTOR_VERSION,
      },
    });
    existing[slug] = next;
    existingByCanonical.set(slug, next);
    updated++;
    const tags = [
      info.happy_hour ? "happy-hour" : null,
      info.known_for ? "known-for" : null,
      info.specials?.length ? "specials" : null,
      commerceLinks.length ? `${commerceLinks.length}-commerce-links` : null,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`  ✓ ${slug}${tags ? ` [${tags}]` : ""}`);
  }

  writeFileSync(OUT, JSON.stringify(existing, null, 2) + "\n");
  console.log(
    `\nDone. ${updated} updated, ${unchanged} unchanged source(s) skipped, ` +
      `${Object.keys(existing).length} total → src/data/business-info.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
