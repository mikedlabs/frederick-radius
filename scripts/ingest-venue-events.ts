/**
 * Venue events extraction agent.
 *
 * Many Frederick venues only post their lineups on their own site — and
 * each in a different shape. This agent collects them by the cleanest
 * method available per venue (declared in config/venue-sources.json),
 * dedupes against what's known, and writes src/data/venue-events.json
 * with source + freshness — which the events feed + answer engine read.
 *
 * Collection methods, cleanest first:
 *   feed   — a structured Squarespace ?format=json events collection,
 *            parsed DETERMINISTICALLY (no model call): exact, free, stable.
 *   image  — the calendar is published only as a graphic; read with
 *            Claude vision from the venue's imageUrl.
 *   render — JS-rendered/403 page → headless browser → model extraction.
 *   fetch  — static HTML → model extraction.
 *
 * Run:  npm run ingest:venues            (all venues)
 *       npm run ingest:venues banyan     (one venue)
 * Needs: ANTHROPIC_API_KEY (feed-only venues don't, but the run preflights
 * once). Scheduled by .github/workflows/ingest-venues.yml.
 *
 * Social-only venues aren't scraped here (ToS/access) — see
 * docs/EXTRACTION_PLATFORM.md for the partnership/vision/human path.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchPageSnapshot,
  fetchSquarespaceEvents,
  extractJson,
  extractJsonFromImage,
  formatFirecrawlFallbackUsageSummary,
  nowISO,
  preflightKey,
  resetFirecrawlFallbackUsage,
} from "./lib/extract-agent";
import {
  hashSourceBytes,
  hashSourceContent,
} from "./lib/source-content-fingerprint";
import {
  emptyVenueSourceState,
  parseVenueSourceState,
  recordVenueSourceObservation,
  serializeVenueSourceState,
  unchangedVenueSourceOutcome,
  type ModelVenueMethod,
  type VenueSourceState,
} from "./lib/venue-source-state";
import { inferredNonMusicCategory } from "../src/lib/events/live-music";

const OUT = resolve("src/data/venue-events.json");
const CONFIG = resolve("config/venue-sources.json");
const SOURCE_STATE = resolve("src/data/venue-event-source-state.json");
const MAX_IMAGE_FINGERPRINT_BYTES = 12_000_000;
const VENUE_TEXT_EXTRACTOR_VERSION = "venue-events-text-v1";
const VENUE_IMAGE_EXTRACTOR_VERSION = "venue-events-image-v1";

type Method = "feed" | "image" | "render" | "fetch";
type VenueSource = {
  slug: string;
  name: string;
  category?: string;
  method?: Method;
  urls: string[];
  imageUrl?: string;
  /** Exact reviewed redirect destinations beyond the configured source host. */
  allowedRedirectHosts?: string[];
  // Legacy flag kept for back-compat: render:true == method "render".
  render?: boolean;
};
type RawEvent = {
  title?: string;
  starts_at?: string; // ISO or plain date/time as published
  ends_at?: string;
  description?: string;
  description_origin?: "source-excerpt" | "radius-summary";
  price?: string;
  ticket_url?: string;
};
type VenueEvent = RawEvent & {
  venue_slug: string;
  venue_name: string;
  category?: string;
  source: SourceProvenance & { fetchedAt: string };
};
type SourceProvenance = {
  /** Canonical publisher URL retained for existing readers and citations. */
  url: string;
  requestedUrl: string;
  finalUrl: string;
};
type CollectResult = {
  events: RawEvent[];
  source: SourceProvenance;
  modelUnavailable?: boolean;
  sourceUnchanged?: boolean;
};
type EnsureModelReady = () => Promise<boolean>;

const SHAPE =
  `Extract UPCOMING events from this venue's page as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date and time as published, ISO if possible), ` +
  `"ends_at"?: string, "description"?: string (one complete, neutral sentence), "price"?: string, "ticket_url"?: string (absolute) }\n` +
  `Copy each published title exactly. A description must use only facts from the source and must not use fragments, ` +
  `slogans, promotional filler, or an invented three-part list. Preserve a factual list when the source requires it. ` +
  `Only include events clearly listed on the page with a real date. Skip past events. If none, return [].`;

const IMAGE_SHAPE =
  `This image is a venue's monthly events/music calendar. Extract every event legibly shown as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date, with time if shown; include the year ${new Date().getFullYear()} if the image omits it), ` +
  `"description"?: string (one complete, neutral sentence using only legible facts) }\n` +
  `Copy each published title exactly. Do not use fragments, promotional filler, or an invented three-part list. ` +
  `Only events you can actually read in the image, with a real date. If none are legible, return [].`;

/** Resolve the collection method, honoring the legacy render flag. */
const methodOf = (v: VenueSource): Method => v.method ?? (v.render ? "render" : "fetch");

/** Stable key to dedupe an event across runs. */
const keyOf = (e: VenueEvent) => `${e.venue_slug}::${(e.title ?? "").toLowerCase().trim()}::${e.starts_at ?? ""}`;

/**
 * Collect raw events for one venue by its declared method. Returns the
 * events plus the source URL to stamp on each. Never throws: a failed
 * fetch/extract yields [] so the caller leaves prior data untouched.
 */
function directSource(url: string): SourceProvenance {
  return { url, requestedUrl: url, finalUrl: url };
}

function loadVenueSourceState(): VenueSourceState {
  if (!existsSync(SOURCE_STATE)) return emptyVenueSourceState();
  return parseVenueSourceState(
    JSON.parse(readFileSync(SOURCE_STATE, "utf8")) as unknown,
  );
}

async function fetchImageFingerprint(
  imageUrl: string,
): Promise<{ contentHash: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const response = await fetch(imageUrl, {
      headers: { "User-Agent": "FrederickRadius/1.0 (+venue data ingest)" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!response.ok) {
      console.log(`  – image fingerprint unavailable (HTTP ${response.status})`);
      return null;
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMAGE_FINGERPRINT_BYTES
    ) {
      console.log(`  – image exceeds fingerprint safety limit`);
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_FINGERPRINT_BYTES) {
      console.log(`  – image fingerprint payload is empty or too large`);
      return null;
    }
    return {
      contentHash: hashSourceBytes(bytes),
      finalUrl: response.url || imageUrl,
    };
  } catch {
    // Fingerprinting is a cost guard, not a new availability dependency. If
    // the local fetch cannot read the image, Claude vision keeps its previous
    // server-side URL path and the run simply cannot skip this source.
    console.log(`  – image fingerprint unavailable; vision fallback retained`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function collect(
  venue: VenueSource,
  sourceState: VenueSourceState,
  ensureModelReady: EnsureModelReady,
  hasRetainedVenueEvents: boolean,
): Promise<CollectResult> {
  const method = methodOf(venue);

  if (method === "image") {
    if (!venue.imageUrl) {
      console.log(`  – no imageUrl configured`);
      return { events: [], source: directSource(venue.urls[0] ?? "") };
    }
    const fingerprint = await fetchImageFingerprint(venue.imageUrl);
    if (fingerprint) {
      const unchanged = unchangedVenueSourceOutcome(
        sourceState,
        venue.slug,
        venue.imageUrl,
        {
          ...fingerprint,
          method,
          extractorVersion: VENUE_IMAGE_EXTRACTOR_VERSION,
        },
      );
      if (unchanged) {
        if (unchanged === "empty" || hasRetainedVenueEvents) {
          console.log(
            `  = image source unchanged (${unchanged}); Claude vision skipped`,
          );
          return {
            events: [],
            source: directSource(venue.urls[0] ?? venue.imageUrl),
            sourceUnchanged: unchanged === "events",
          };
        }
        console.log(
          `  – image source unchanged but no current rows remain; re-extracting`,
        );
      }
    }
    if (!(await ensureModelReady())) {
      return {
        events: [],
        source: directSource(venue.urls[0] ?? venue.imageUrl),
        modelUnavailable: true,
      };
    }
    const events = await extractJsonFromImage<RawEvent[]>(
      `Venue: ${venue.name} (Frederick County, MD).\n${IMAGE_SHAPE}`,
      venue.imageUrl,
    );
    if (!Array.isArray(events)) {
      console.log(`  – vision extraction incomplete; source will retry`);
      return {
        events: [],
        source: directSource(venue.urls[0] ?? venue.imageUrl),
      };
    }
    if (fingerprint) {
      recordVenueSourceObservation(sourceState, venue.slug, venue.imageUrl, {
        ...fingerprint,
        method,
        extractorVersion: VENUE_IMAGE_EXTRACTOR_VERSION,
        outcome: events.length ? "events" : "empty",
      });
    }
    const n = Array.isArray(events) ? events.length : 0;
    console.log(`  ✓ ${n} event(s) from image ${venue.imageUrl}`);
    return {
      events: events.map((event) => ({
        ...event,
        ...(event.description
          ? { description_origin: "radius-summary" as const }
          : {}),
      })),
      source: directSource(venue.urls[0] ?? venue.imageUrl),
    };
  }

  if (method === "feed") {
    // Deterministic Squarespace JSON — no model call. Try each URL until
    // one yields events.
    for (const url of venue.urls) {
      const events = await fetchSquarespaceEvents(url);
      if (events.length) {
        console.log(`  ✓ ${events.length} event(s) from feed ${url}`);
        return { events, source: directSource(url) };
      }
    }
    console.log(`  – feed returned no upcoming events`);
    return { events: [], source: directSource(venue.urls[0] ?? "") };
  }

  // render | fetch — page text → model. Try each URL; first hit wins.
  for (const url of venue.urls) {
    const snapshot = await fetchPageSnapshot(url, {
      render: method === "render",
      allowedRedirectHosts: venue.allowedRedirectHosts ?? [],
    });
    if (!snapshot) continue;
    const fingerprint = {
      contentHash: hashSourceContent(snapshot.text),
      finalUrl: snapshot.finalUrl,
      method: method as ModelVenueMethod,
      extractorVersion: VENUE_TEXT_EXTRACTOR_VERSION,
    };
    const unchanged = unchangedVenueSourceOutcome(
      sourceState,
      venue.slug,
      url,
      fingerprint,
    );
    if (unchanged) {
      if (unchanged === "events" && hasRetainedVenueEvents) {
        console.log(`  = source unchanged (${unchanged}); Claude skipped: ${url}`);
        return {
          events: [],
          source: {
            url: snapshot.requestedUrl,
            requestedUrl: snapshot.requestedUrl,
            finalUrl: snapshot.finalUrl,
          },
          sourceUnchanged: true,
        };
      }
      if (unchanged === "empty") {
        console.log(`  = source unchanged (${unchanged}); Claude skipped: ${url}`);
        continue;
      }
      console.log(
        `  – source unchanged but no current rows remain; re-extracting: ${url}`,
      );
    }
    if (!(await ensureModelReady())) {
      return {
        events: [],
        source: directSource(url),
        modelUnavailable: true,
      };
    }
    const events = await extractJson<RawEvent[]>(
      `Venue: ${venue.name} (Frederick County, MD).\n${SHAPE}`,
      snapshot.text,
    );
    if (!Array.isArray(events)) {
      console.log(`  – extraction incomplete; source will retry: ${url}`);
      continue;
    }
    recordVenueSourceObservation(sourceState, venue.slug, url, {
      ...fingerprint,
      outcome: events.length ? "events" : "empty",
    });
    if (events.length) {
      console.log(`  ✓ ${events.length} event(s) from ${url}`);
      return {
        events: events.map((event) => ({
          ...event,
          ...(event.description
            ? { description_origin: "radius-summary" as const }
            : {}),
        })),
        source: {
          url: snapshot.requestedUrl,
          requestedUrl: snapshot.requestedUrl,
          finalUrl: snapshot.finalUrl,
        },
      };
    }
    console.log(`  – 0 event(s) from ${url}`);
  }
  return { events: [], source: directSource(venue.urls[0] ?? "") };
}

async function main() {
  resetFirecrawlFallbackUsage();
  const only = process.argv[2];
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as { venues: VenueSource[] };
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as VenueEvent[];
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));
  const venues = cfg.venues.filter((v) => (only ? v.slug === only : true));
  const sourceState = loadVenueSourceState();
  const sourceStateBefore = serializeVenueSourceState(sourceState);

  let modelReady: boolean | undefined;
  let modelUnavailable = false;
  const ensureModelReady = async (): Promise<boolean> => {
    if (modelReady !== undefined) return modelReady;
    // The key gates only changed MODEL-ASSISTED sources. Feed collectors and
    // successfully fingerprinted unchanged sources need no Anthropic call.
    modelReady = await preflightKey({ failInCi: false });
    return modelReady;
  };

  let added = 0;
  let unchangedSources = 0;
  const runStartedAt = Date.now();
  for (const venue of venues) {
    const hasSource = venue.urls?.length || venue.imageUrl;
    if (!hasSource) {
      console.log(`• ${venue.name}: no source configured — skipped`);
      continue;
    }
    console.log(`• ${venue.name} [${methodOf(venue)}]`);
    const hasRetainedVenueEvents = [...byKey.values()].some((event) => {
      if (event.venue_slug !== venue.slug) return false;
      const startsAt = Date.parse(event.starts_at ?? "");
      return (
        !Number.isFinite(startsAt) ||
        startsAt >= runStartedAt - 86_400_000
      );
    });
    const {
      events,
      source,
      modelUnavailable: sourceModelUnavailable,
      sourceUnchanged,
    } = await collect(
      venue,
      sourceState,
      ensureModelReady,
      hasRetainedVenueEvents,
    );
    if (sourceModelUnavailable) {
      modelUnavailable = true;
      console.log(`  – model unavailable; prior venue data retained`);
    }
    if (sourceUnchanged) {
      const fetchedAt = nowISO();
      for (const [key, event] of byKey) {
        if (event.venue_slug !== venue.slug) continue;
        byKey.set(key, {
          ...event,
          source: {
            ...event.source,
            ...source,
            fetchedAt,
          },
        });
      }
      unchangedSources += 1;
    }
    for (const ev of events) {
      if (!ev.title || !ev.starts_at) continue;
      const full: VenueEvent = {
        ...ev,
        venue_slug: venue.slug,
        venue_name: venue.name,
        category: inferredNonMusicCategory(ev.title) ?? venue.category,
        source: { ...source, fetchedAt: nowISO() },
      };
      const k = keyOf(full);
      if (!byKey.has(k)) added++;
      byKey.set(k, full); // refresh freshness even if known
    }
  }

  // Keep only future-ish events: drop anything whose date clearly parsed in the past.
  const kept = [...byKey.values()].filter((e) => {
    const t = Date.parse(e.starts_at ?? "");
    return !Number.isFinite(t) || t >= runStartedAt - 86_400_000; // keep unparseable + within last day
  });

  writeFileSync(OUT, JSON.stringify(kept, null, 2) + "\n");
  const sourceStateAfter = serializeVenueSourceState(sourceState);
  if (sourceStateAfter !== sourceStateBefore) {
    writeFileSync(SOURCE_STATE, sourceStateAfter);
  }
  console.log(
    `\nDone. +${added} new, ${unchangedSources} unchanged source(s) skipped, ` +
      `${kept.length} total → src/data/venue-events.json`,
  );
  console.log(
    sourceStateAfter === sourceStateBefore
      ? "Venue source fingerprints unchanged."
      : "Venue source fingerprints updated.",
  );
  console.log(formatFirecrawlFallbackUsageSummary());
  if (modelUnavailable && process.env.CI) {
    console.error(
      "Deterministic and unchanged venue sources were preserved, but at least one changed model-assisted source could not run.",
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
