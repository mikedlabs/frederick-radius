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
 * Focused on food/drink by default (where this info matters and exists),
 * filtered to own-domain business sites (not gov/aggregator/social).
 * Adaptive fetch: tries a plain request first (most small-business sites
 * are readable), falls back to a headless render only when the static
 * HTML comes back too thin (JS-rendered). Incremental: skips anything
 * fetched within `refreshDays` unless --force.
 *
 * Run:  npm run ingest:business                 (a batch, up to defaultLimit)
 *       npm run ingest:business -- --limit=200   (bigger batch)
 *       npm run ingest:business ayse-meze-frederick   (one place, by slug)
 *       npm run ingest:business -- --force        (re-fetch even fresh ones)
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
} from "./lib/business-info-source";
import { getPlaceBySlug, publicPlaces } from "@/lib/loaders/places";

const OUT = resolve("src/data/business-info.json");
const ENR = resolve("src/data/places-enrichment.json");
const CFG = resolve("config/business-info.json");

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
type Info = {
  known_for?: string;
  happy_hour?: string;
  specials?: string[];
  hours_text?: string;
  notable?: string;
};
type Record_ = Info & {
  name?: string;
  commerce_links?: ExtractedBusinessCommerceLink[];
  /** Backward compatibility for records written before deterministic anchors. */
  reservations_url?: string;
  source: { url: string; fetchedAt: string };
};

const SHAPE =
  `Extract these from this local business's own website. Include ONLY facts ` +
  `clearly stated on the page — omit any field that isn't. Return JSON:\n` +
  `{\n` +
  `  "known_for": string — one complete sentence stating the strongest useful fact about what the place is known for; add a second fact only when it changes the decision,\n` +
  `  "happy_hour": string — days + times + what's discounted, verbatim where possible (e.g. "Mon–Fri 4–6pm: $5 drafts, $7 wells"),\n` +
  `  "specials": string[] — recurring weekly specials (e.g. "Taco Tuesday", "half-price bottles Wednesday"),\n` +
  `  "hours_text": string — operating hours as published,\n` +
  `  "notable": string — one complete sentence with another useful supported detail, such as patio access, a dog policy, a recurring music night, or parking\n` +
  `}\n` +
  `Use complete sentences for known_for and notable. Do not write fragments, slogans, promotional filler, or an automatic three-part list. ` +
  `Do not return URLs; links are collected directly from real page anchors. ` +
  `Never invent prices, times, or dishes. If nothing applies, return {}.`;

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
  const plain = await fetchPageSnapshot(url, { maxChars: 16_000 });
  if (!needsRenderedBusinessSnapshot(plain, minChars)) {
    return plain;
  }
  const rendered = await fetchPageSnapshot(url, { render: true, maxChars: 16_000 });
  return rendered ?? plain;
}

function cleanExtractedInfo(value: unknown): Info {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const text = (key: keyof Info): string | undefined => {
    const candidate = raw[key];
    return typeof candidate === "string" && candidate.trim()
      ? candidate.trim()
      : undefined;
  };
  const specials = Array.isArray(raw.specials)
    ? raw.specials
        .filter(
          (candidate): candidate is string =>
            typeof candidate === "string" && Boolean(candidate.trim()),
        )
        .map((candidate) => candidate.trim())
    : undefined;

  return {
    ...(text("known_for") ? { known_for: text("known_for") } : {}),
    ...(text("happy_hour") ? { happy_hour: text("happy_hour") } : {}),
    ...(specials?.length ? { specials } : {}),
    ...(text("hours_text") ? { hours_text: text("hours_text") } : {}),
    ...(text("notable") ? { notable: text("notable") } : {}),
  };
}

async function main() {
  // Fail fast + clear if the key is missing/invalid/out-of-credit, so a
  // bad CI run shows one actionable line instead of a buried stack trace.
  if (!(await preflightKey())) return;
  const positional = process.argv[2];
  const only = positional && !positional.startsWith("--") ? positional : undefined;
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const force = process.argv.includes("--force");

  const cfg = JSON.parse(readFileSync(CFG, "utf8")) as Cfg;
  const enr = JSON.parse(readFileSync(ENR, "utf8")) as Enrichment;
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Record_>;
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : cfg.defaultLimit;
  const publicSlugs = new Set(publicPlaces().map((place) => place.slug));

  const eligible = Object.entries(enr).filter(([slug, r]) => {
    if (only && slug !== only) return false;
    if (!r.website || !/^https?:/.test(r.website)) return false;
    const d = domainOf(r.website);
    if (!d || cfg.excludeDomains.some((x) => d.includes(x))) return false;
    // Scheduled batches spend model calls only on a place that survives the
    // canonical public loader. Legacy aliases remain eligible when they
    // resolve to a public place; excluded, out-of-county, or removed rows do
    // not consume the bounded daily budget. An explicit one-slug run remains
    // available for investigation.
    if (!only) {
      const place = getPlaceBySlug(slug);
      if (!place || !publicSlugs.has(place.slug)) return false;
    }
    if (only) return true;
    return cfg.typeIncludes.some((t) => (r.primary_type ?? "").includes(t));
  });

  const cutoff = Date.now() - cfg.refreshDays * 86_400_000;
  const todo = eligible
    .filter(([slug]) => {
      if (force || only) return true;
      const e = existing[slug];
      return !e || !e.source?.fetchedAt || Date.parse(e.source.fetchedAt) < cutoff;
    })
    .slice(0, limit);

  console.log(
    `${eligible.length} eligible food/drink businesses; ${todo.length} to read this run (limit ${limit}).`,
  );

  let updated = 0;
  for (const [slug, r] of todo) {
    const snapshot = await fetchAdaptive(
      r.website!,
      cfg.renderFallbackMinChars,
    );
    if (!snapshot) {
      console.log(`  ✗ ${slug}: unreadable (${domainOf(r.website!)})`);
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
    if (!isTrustedBusinessWebsiteRedirect(r.website!, snapshot.finalUrl)) {
      console.log(
        `  ✗ ${slug}: redirected to unrelated source (${finalDomain})`,
      );
      continue;
    }
    const extracted = await extractJson<unknown>(
      `Business: ${r.display_name ?? slug} (Frederick County, MD).\n${SHAPE}`,
      snapshot.text,
    );
    const info = cleanExtractedInfo(extracted);
    const commerceLinks = classifyOfficialCommerceLinks(
      snapshot.links,
      snapshot.finalUrl,
    );
    const has =
      info.known_for ||
      info.happy_hour ||
      (info.specials && info.specials.length) ||
      info.hours_text ||
      info.notable ||
      commerceLinks.length;
    if (!has) {
      console.log(`  – ${slug}: nothing extractable`);
      continue;
    }
    existing[slug] = {
      ...info,
      name: r.display_name,
      ...(commerceLinks.length ? { commerce_links: commerceLinks } : {}),
      source: { url: snapshot.finalUrl, fetchedAt: nowISO() },
    };
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
    `\nDone. ${updated} updated, ${Object.keys(existing).length} total → src/data/business-info.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
