/**
 * Municipal civic extraction agent.
 *
 * The 12 towns don't publish RSS/iCal/JSON feeds, so we can't ingest
 * them the normal way. This script closes the parity gap: for each town
 * in config/municipal-civic-sources.json with configured URL(s), it
 *
 *   1. fetches the town's official gov page(s),
 *   2. strips them to text,
 *   3. asks Claude to extract a STRICT JSON shape (town hall, public
 *      works, trash/recycling, permits, police non-emergency, utilities)
 *      — and to OMIT anything not clearly on the page (no guessing),
 *   4. writes src/data/municipal-civic.json with a source URL +
 *      fetched-at timestamp on every record (provenance + freshness).
 *
 * Run:  npm run ingest:civic           (all configured towns)
 *       npm run ingest:civic brunswick (one town)
 * Needs: ANTHROPIC_API_KEY in the environment.
 * Schedule: .github/workflows/ingest-civic.yml runs it daily and commits
 *           the refreshed JSON.
 *
 * Design note: uses plain fetch against the Anthropic Messages API (no
 * SDK dependency for a build-time script). Never fabricates — if a fetch
 * fails or the page has nothing, the town is left as-is and logged.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AnthropicProviderError,
  extractJsonStrict,
  fetchPageSnapshot,
  formatFirecrawlFallbackUsageSummary,
  preflightKey,
  resetFirecrawlFallbackUsage,
} from "./lib/extract-agent";

const MODEL = process.env.CIVIC_INGEST_MODEL || "claude-haiku-4-5-20251001";
const OUT = resolve("src/data/municipal-civic.json");
const CONFIG = resolve("config/municipal-civic-sources.json");

type TownSource = {
  slug: string;
  name: string;
  searchHint?: string;
  urls: string[];
  /** Exact reviewed redirect destinations beyond the configured source host. */
  allowedRedirectHosts?: string[];
};

type SourceProvenance = {
  url: string;
  requestedUrl: string;
  finalUrl: string;
};

const EXTRACTION_SCHEMA = `{
  "townHall":       { "label": "Town Hall", "phone"?: string, "website"?: string, "hours"?: string, "address"?: string },
  "publicWorks":    { "label": "Public Works", "phone"?: string, "website"?: string },
  "trashRecycling": { "label": "Trash & Recycling", "phone"?: string, "website"?: string, "schedule"?: string },
  "permits":        { "label": "Permits & Zoning", "phone"?: string, "website"?: string },
  "utilities":      { "label": "Water / Utilities", "phone"?: string, "website"?: string },
  "police":         { "label": "Police (non-emergency)", "phone"?: string, "website"?: string }
}`;

async function extract(
  townName: string,
  sourceUrl: string,
  text: string,
): Promise<Record<string, unknown> | null> {
  const instructions =
    `You are extracting civic contact info for the Town of ${townName}, Maryland ` +
    `from its official government webpage at ${sourceUrl}.\n\n` +
    `Return ONLY a JSON object matching this shape (omit any field you cannot find ON THIS PAGE — do not guess, do not invent phone numbers or hours):\n${EXTRACTION_SCHEMA}\n\n` +
    `Rules: phone as digits-with-dashes; website as absolute URLs only; "schedule" is a short plain-English trash/recycling pickup rule if present; omit the whole object for any category not present. If nothing civic is found, return {}.`;

  const extracted = await extractJsonStrict<Record<string, unknown>>(
    instructions,
    text,
    {
      model: MODEL,
      maxTokens: 1024,
    },
  );
  if (!extracted) {
    throw new AnthropicProviderError(
      `Claude returned no usable JSON for ${townName}`,
      {
        kind: "response",
        status: 200,
        attempts: 1,
      },
    );
  }
  return extracted;
}

async function main() {
  resetFirecrawlFallbackUsage();
  // Civic has no deterministic/model-free path. A rejected key or provider
  // outage must fail the scheduled run before sources are fetched or the
  // existing snapshot is written, rather than producing a green no-op.
  const providerReady = await preflightKey({ failInCi: false });
  if (!providerReady) {
    throw new Error(
      "Municipal civic ingest stopped because the Anthropic preflight failed.",
    );
  }

  const only = process.argv[2];
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as { towns: TownSource[] };
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>;
  const towns = cfg.towns.filter((t) => (only ? t.slug === only : true));

  let updated = 0;
  for (const town of towns) {
    if (!town.urls?.length) {
      console.log(`• ${town.name}: no URLs configured — skipped`);
      continue;
    }
    console.log(`• ${town.name}: ${town.urls.length} url(s)`);
    const merged: Record<string, unknown> = { slug: town.slug, name: town.name };
    let primarySource: SourceProvenance | null = null;
    for (const url of town.urls) {
      const snapshot = await fetchPageSnapshot(url, {
        maxChars: 18_000,
        allowedRedirectHosts: town.allowedRedirectHosts ?? [],
      });
      if (!snapshot) continue;
      const extracted = await extract(
        town.name,
        snapshot.finalUrl,
        snapshot.text,
      );
      if (extracted && Object.keys(extracted).length > 0) {
        Object.assign(merged, extracted); // later URLs fill gaps
        primarySource ??= {
          url: snapshot.requestedUrl,
          requestedUrl: snapshot.requestedUrl,
          finalUrl: snapshot.finalUrl,
        };
        console.log(`  ✓ extracted ${Object.keys(extracted).length} categories from ${url}`);
      }
    }
    const hasData = Object.keys(merged).some((k) => k !== "slug" && k !== "name");
    if (hasData) {
      const source =
        primarySource ?? {
          url: town.urls[0],
          requestedUrl: town.urls[0],
          finalUrl: town.urls[0],
        };
      merged.source = { ...source, fetchedAt: new Date().toISOString() };
      existing[town.slug] = merged;
      updated++;
    } else {
      console.log(`  – nothing extracted; leaving ${town.slug} unchanged`);
    }
  }

  writeFileSync(OUT, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nDone. ${updated} town(s) updated → src/data/municipal-civic.json`);
  console.log(formatFirecrawlFallbackUsageSummary());
}

main().catch((error) => {
  if (error instanceof AnthropicProviderError) {
    console.error(
      `Municipal civic ingest stopped: ${error.message}` +
        (error.status ? ` (HTTP ${error.status})` : "") +
        `. Attempts: ${error.attempts}.`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
