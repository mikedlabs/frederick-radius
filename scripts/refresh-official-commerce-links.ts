/**
 * Refresh official menu, order, reservation, catering, and gift-card links.
 *
 * This is deliberately separate from the model-assisted business-info agent:
 * it reads only real anchors from the official website already stored for a
 * public food/drink place and never generates a URL or refreshes unrelated
 * business facts.
 *
 *   npm run refresh:commerce-links
 *   npm run refresh:commerce-links -- --slug=the-orchard-frederick --force
 *   npm run refresh:commerce-links -- --limit=3 --dry-run
 *   npm run refresh:commerce-links -- --limit=60 --concurrency=3
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicPlaces } from "@/lib/loaders/places";
import {
  fetchPageSnapshot,
  type PageSnapshot,
} from "./lib/extract-agent";
import {
  classifyOfficialCommerceLinks,
  type ExtractedBusinessCommerceLink,
} from "./lib/official-commerce-links";
import {
  isTrustedBusinessWebsiteRedirect,
  needsRenderedBusinessSnapshot,
} from "./lib/business-info-source";
import {
  commerceCoverage,
  commerceRefreshIsFresh,
  filterCommerceLinksForPlace,
  FOOD_DRINK_CATEGORIES,
  isEligibleOfficialBusinessWebsite,
  mergeCommerceRefresh,
  mergeDistinctCommerceLinks,
  sanitizeStoredCommerceLinks,
  selectCommerceDiscoveryPages,
  shouldKeepCommerceLinkAfterProbe,
  type CommerceRefreshRecord,
} from "./lib/official-commerce-refresh";

const OUT = resolve("src/data/business-info.json");
const CFG = resolve("config/business-info.json");
const MAX_CONCURRENCY = 4;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_FOLLOW_PAGES = 2;

type Config = {
  excludeDomains: string[];
  refreshDays: number;
  defaultLimit: number;
  renderFallbackMinChars: number;
};

type Options = {
  slug?: string;
  limit: number;
  concurrency: number;
  force: boolean;
  dryRun: boolean;
  maxFollowPages: number;
};

type CrawlSuccess = {
  ok: true;
  sourceUrl: string;
  links: ExtractedBusinessCommerceLink[];
  pagesRead: number;
  rejectedLinks: number;
};

type CrawlFailure = {
  ok: false;
  reason: string;
};

function positiveInt(
  value: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function flagValue(args: string[], flag: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

function parseOptions(args: string[], cfg: Config): Options {
  const positional = args.find((arg) => !arg.startsWith("--"));
  const slug = flagValue(args, "--slug") ?? positional;
  return {
    ...(slug ? { slug } : {}),
    limit: positiveInt(flagValue(args, "--limit"), cfg.defaultLimit),
    concurrency: positiveInt(
      flagValue(args, "--concurrency"),
      DEFAULT_CONCURRENCY,
      MAX_CONCURRENCY,
    ),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    maxFollowPages: positiveInt(
      flagValue(args, "--max-follow"),
      DEFAULT_FOLLOW_PAGES,
      3,
    ),
  };
}

async function fetchAdaptive(
  url: string,
  minChars: number,
): Promise<PageSnapshot | null> {
  const plain = await fetchPageSnapshot(url, { maxChars: 12_000 });
  if (
    plain &&
    !needsRenderedBusinessSnapshot(plain, minChars) &&
    plain.links.length > 0
  ) {
    return plain;
  }
  const rendered = await fetchPageSnapshot(url, {
    render: true,
    maxChars: 12_000,
  });
  return rendered ?? plain;
}

async function crawlOfficialWebsite(
  officialUrl: string,
  cfg: Config,
  maxFollowPages: number,
  postalCode?: string,
): Promise<CrawlSuccess | CrawlFailure> {
  const home = await fetchAdaptive(officialUrl, cfg.renderFallbackMinChars);
  if (!home) return { ok: false, reason: "official site was unreadable" };
  if (
    !isEligibleOfficialBusinessWebsite(home.finalUrl, cfg.excludeDomains)
  ) {
    return {
      ok: false,
      reason: `redirected to an excluded site (${home.finalUrl})`,
    };
  }
  if (!isTrustedBusinessWebsiteRedirect(officialUrl, home.finalUrl)) {
    return {
      ok: false,
      reason: `redirected to an unrelated site (${home.finalUrl})`,
    };
  }

  const groups: ExtractedBusinessCommerceLink[][] = [
    classifyOfficialCommerceLinks(home.links, home.finalUrl),
  ];
  let pagesRead = 1;
  const followUrls = selectCommerceDiscoveryPages(
    home.links,
    home.finalUrl,
    home.finalUrl,
    maxFollowPages,
  );

  for (const followUrl of followUrls) {
    const page = await fetchAdaptive(followUrl, cfg.renderFallbackMinChars);
    if (
      !page ||
      !isTrustedBusinessWebsiteRedirect(home.finalUrl, page.finalUrl) ||
      !isEligibleOfficialBusinessWebsite(page.finalUrl, cfg.excludeDomains)
    ) {
      continue;
    }
    pagesRead += 1;
    groups.push(classifyOfficialCommerceLinks(page.links, page.finalUrl));
  }

  const discovered = filterCommerceLinksForPlace(
    mergeDistinctCommerceLinks(groups),
    { postalCode },
  );
  const probed = await Promise.all(
    discovered.map(async (link) => {
      try {
        const response = await fetch(link.url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8_000),
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
            "User-Agent":
              "FrederickRadiusMenuLinkCheck/1.0 (+https://frederickradius.app)",
          },
        });
        const keep = shouldKeepCommerceLinkAfterProbe(link, {
          status: response.status,
          finalUrl: response.url || link.url,
        });
        await response.body?.cancel().catch(() => undefined);
        return { link, keep };
      } catch {
        // A timeout, bot block, or transient network failure does not prove a
        // browser-facing link is dead. Keep it imported and unverified.
        return { link, keep: true };
      }
    }),
  );
  const links = probed.filter(({ keep }) => keep).map(({ link }) => link);

  return {
    ok: true,
    sourceUrl: home.finalUrl,
    links,
    pagesRead,
    rejectedLinks: discovered.length - links.length,
  };
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= values.length) return;
        results[index] = await worker(values[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

async function main() {
  const cfg = JSON.parse(readFileSync(CFG, "utf8")) as Config;
  const options = parseOptions(process.argv.slice(2), cfg);
  const existing = JSON.parse(
    readFileSync(OUT, "utf8"),
  ) as Record<string, CommerceRefreshRecord>;
  const nowMs = Date.now();
  const allFoodDrink = publicPlaces().filter((place) =>
    FOOD_DRINK_CATEGORIES.has(place.category),
  );
  let sanitizedStoredLinks = 0;
  if (!options.dryRun) {
    for (const place of allFoodDrink) {
      const record = existing[place.slug];
      if (!record?.commerce_links?.length) continue;
      const previous = record.commerce_links;
      const sanitized = sanitizeStoredCommerceLinks(previous, {
        postalCode: place.postal_code,
      });
      if (JSON.stringify(previous) === JSON.stringify(sanitized)) continue;
      sanitizedStoredLinks += previous.length - sanitized.length;
      if (sanitized.length) record.commerce_links = sanitized;
      else delete record.commerce_links;
    }
    if (sanitizedStoredLinks > 0) {
      console.log(
        `Removed or compacted ${sanitizedStoredLinks} stored item-level, duplicate, or ambiguous commerce links.`,
      );
    }
  }
  const officialSitePlaces = allFoodDrink.filter(
    (place) =>
      Boolean(place.website) &&
      isEligibleOfficialBusinessWebsite(
        place.website!,
        cfg.excludeDomains,
      ),
  );
  const selected = officialSitePlaces
    .filter((place) => !options.slug || place.slug === options.slug)
    .filter(
      (place) =>
        options.force ||
        !commerceRefreshIsFresh(existing[place.slug], nowMs, cfg.refreshDays),
    )
    .slice(0, options.limit);

  if (options.slug && !officialSitePlaces.some((place) => place.slug === options.slug)) {
    throw new Error(
      `${options.slug} is not a public food/drink place with an eligible official website.`,
    );
  }

  console.log(
    `${allFoodDrink.length} public food/drink places; ${officialSitePlaces.length} have an eligible official website; ${selected.length} selected.`,
  );
  const before = commerceCoverage(
    allFoodDrink.map((place) => place.slug),
    existing,
  );
  console.log(
    `Current coverage: ${before.checked}/${before.places} checked; ${before.withLinks} places with ${before.links} direct links.`,
  );
  console.log(
    `Concurrency ${options.concurrency}; up to ${options.maxFollowPages} same-site discovery pages per business${options.dryRun ? "; dry run" : ""}.`,
  );

  const crawled = await mapConcurrent(
    selected,
    options.concurrency,
    async (place) => ({
      place,
      result: await crawlOfficialWebsite(
        place.website!,
        cfg,
        options.maxFollowPages,
        place.postal_code,
      ),
    }),
  );

  let checked = 0;
  let withLinks = 0;
  let linkCount = 0;
  for (const { place, result } of crawled) {
    if (!result.ok) {
      console.log(`  ✗ ${place.slug}: ${result.reason}`);
      continue;
    }
    checked += 1;
    if (result.links.length) {
      withLinks += 1;
      linkCount += result.links.length;
    }
    const types = Array.from(new Set(result.links.map((link) => link.type)));
    console.log(
      `  ${result.links.length ? "✓" : "–"} ${place.slug}: ${result.links.length} link${result.links.length === 1 ? "" : "s"} across ${result.pagesRead} page${result.pagesRead === 1 ? "" : "s"}${types.length ? ` [${types.join(", ")}]` : ""}${result.rejectedLinks ? `; ${result.rejectedLinks} dead or unsafe omitted` : ""}`,
    );
    if (options.dryRun) {
      for (const link of result.links) {
        console.log(`      ${link.type}: ${link.url} (via ${link.source_url})`);
      }
      continue;
    }
    existing[place.slug] = mergeCommerceRefresh(existing[place.slug], {
      name: place.name,
      links: result.links,
      sourceUrl: result.sourceUrl,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!options.dryRun) {
    writeFileSync(OUT, `${JSON.stringify(existing, null, 2)}\n`);
  }
  const after = commerceCoverage(
    allFoodDrink.map((place) => place.slug),
    existing,
  );
  console.log(
    `Done. ${checked} checked; ${withLinks} had exact commerce links; ${linkCount} links found${options.dryRun ? "; no data written" : ""}.`,
  );
  if (!options.dryRun) {
    console.log(
      `Stored coverage: ${after.checked}/${after.places} checked; ${after.withLinks} places with ${after.links} direct links (${Object.entries(after.byType)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type} ${count}`)
        .join(", ") || "none"}).`,
    );
  }

  const githubSummary = process.env.GITHUB_STEP_SUMMARY;
  if (githubSummary) {
    const report = options.dryRun ? before : after;
    appendFileSync(
      githubSummary,
      [
        "## Official commerce-link refresh",
        "",
        `- Public food/drink places: ${allFoodDrink.length}`,
        `- Eligible official websites: ${officialSitePlaces.length}`,
        `- Selected this run: ${selected.length}`,
        `- Successfully checked this run: ${checked}`,
        `- Exact links found this run: ${linkCount} across ${withLinks} places`,
        `- Stored coverage: ${report.checked}/${report.places} checked; ${report.withLinks} places with ${report.links} direct links`,
        `- Stored link types: ${Object.entries(report.byType)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([type, count]) => `${type} ${count}`)
          .join(", ") || "none"}`,
        "",
        "Only anchors published on eligible official business sites were considered. No menu items, prices, or POS data were collected.",
        "",
      ].join("\n"),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
