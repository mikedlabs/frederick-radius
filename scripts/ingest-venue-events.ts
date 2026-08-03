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
import { pathToFileURL } from "node:url";
import {
  fetchPageSnapshot,
  fetchSquarespaceEventsResult,
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
import {
  buildRecoverableVenuePublication,
  promoteVenueInventory,
  type VenueCollectionStatus,
} from "./lib/venue-event-promotion";
import { normalizeVenueEventTimes } from "./lib/venue-event-time";
import { inferredNonMusicCategory } from "../src/lib/events/live-music";
import { lintSourceText } from "./style-lint";

const OUT = resolve("src/data/venue-events.json");
const SOURCE_INVENTORY_OUT = resolve(
  "src/data/venue-event-source-inventory.json",
);
const CONFIG = resolve("config/venue-sources.json");
const SOURCE_STATE = resolve("src/data/venue-event-source-state.json");
const MAX_IMAGE_FINGERPRINT_BYTES = 12_000_000;
const VENUE_TEXT_EXTRACTOR_VERSION = "venue-events-text-v1";
const VENUE_IMAGE_EXTRACTOR_VERSION = "venue-events-image-v1";

export type Method = "feed" | "image" | "render" | "fetch";
export type VenueSource = {
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
export type RawEvent = {
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
export type CollectResult = {
  events: RawEvent[];
  source: SourceProvenance;
  status: VenueCollectionStatus;
  modelUnavailable?: boolean;
};
type EnsureModelReady = () => Promise<boolean>;
export type VenueCollectDependencies = {
  fetchPageSnapshot: typeof fetchPageSnapshot;
  fetchSquarespaceEventsResult: typeof fetchSquarespaceEventsResult;
  extractTextEvents: (
    instructions: string,
    content: string,
  ) => Promise<RawEvent[] | null>;
  extractImageEvents: (
    instructions: string,
    imageUrl: string,
  ) => Promise<RawEvent[] | null>;
};

const DEFAULT_COLLECT_DEPENDENCIES: VenueCollectDependencies = {
  fetchPageSnapshot,
  fetchSquarespaceEventsResult,
  extractTextEvents: (instructions, content) =>
    extractJson<RawEvent[]>(instructions, content),
  extractImageEvents: (instructions, imageUrl) =>
    extractJsonFromImage<RawEvent[]>(instructions, imageUrl),
};

const SHAPE =
  `Extract UPCOMING events from this venue's page as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date and time as published, ISO if possible; use the America/New_York offset), ` +
  `"ends_at"?: string, "description"?: string (one complete, neutral sentence), "price"?: string, "ticket_url"?: string (absolute) }\n` +
  `Copy each published title exactly. A description must use only concrete facts from the source and must not use fragments, ` +
  `slogans, promotional filler, vague claims, the phrase "live experience," or an invented three-part list. ` +
  `Name the performer, format, genre, age rule, price, or another published fact instead. Preserve a factual list when the source requires it. ` +
  `Only include events clearly listed on the page with a real date. Skip past events. If none, return [].`;

const IMAGE_SHAPE =
  `This image is a venue's monthly events/music calendar. Extract every event legibly shown as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date, with time if shown; include the year ${new Date().getFullYear()} if the image omits it and use the America/New_York offset), ` +
  `"description"?: string (one complete, neutral sentence using only legible facts) }\n` +
  `Copy each published title exactly. Do not use fragments, promotional filler, vague claims, the phrase "live experience," or an invented three-part list. ` +
  `Only events you can actually read in the image, with a real date. If none are legible, return [].`;

/** Resolve the collection method, honoring the legacy render flag. */
const methodOf = (v: VenueSource): Method =>
  v.method ?? (v.render ? "render" : "fetch");

/** Stable key to dedupe an event across runs. */
const keyOf = (e: VenueEvent) =>
  `${e.venue_slug}::${(e.title ?? "").toLowerCase().trim()}::${e.starts_at ?? ""}`;

function publishableRawEvents(events: RawEvent[]): RawEvent[] {
  return (events as unknown[]).flatMap((event) => {
    if (
      !event ||
      typeof event !== "object" ||
      typeof (event as RawEvent).title !== "string" ||
      !(event as RawEvent).title?.trim() ||
      typeof (event as RawEvent).starts_at !== "string" ||
      !(event as RawEvent).starts_at?.trim()
    ) {
      return [];
    }
    const normalized = normalizeVenueEventTimes(event as RawEvent);
    return normalized ? [normalized] : [];
  });
}

/**
 * Model-written copy is optional; the event identity, time, and source are not.
 * Apply the same voice rules used by CI before a generated description enters
 * the review artifact. If the model drifts, keep the useful event and omit only
 * the unsafe sentence instead of blocking every venue's refresh.
 */
export function withSafeRadiusSummaries(events: RawEvent[]): RawEvent[] {
  return events.map((event) => {
    const description = event.description?.trim();
    if (!description) {
      const rest = { ...event };
      delete rest.description;
      delete rest.description_origin;
      return rest;
    }

    const findings = lintSourceText(
      "src/data/venue-event-summary.json",
      JSON.stringify({ description }),
    );
    if (findings.length > 0) {
      const rest = { ...event };
      delete rest.description;
      delete rest.description_origin;
      console.log(
        `  - omitted generated description for ${event.title ?? "untitled event"}: ` +
          findings.map((finding) => finding.rule).join(", "),
      );
      return rest;
    }

    return {
      ...event,
      description,
      description_origin: "radius-summary",
    };
  });
}

/**
 * Collect raw events for one venue by its declared method. The explicit
 * status lets promotion distinguish a verified empty inventory from a failed
 * read; both carry zero rows, but only the former may retire prior events.
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
      console.log(
        `  – image fingerprint unavailable (HTTP ${response.status})`,
      );
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

export async function collect(
  venue: VenueSource,
  sourceState: VenueSourceState,
  ensureModelReady: EnsureModelReady,
  hasRetainedVenueEvents: boolean,
  dependencies: VenueCollectDependencies = DEFAULT_COLLECT_DEPENDENCIES,
): Promise<CollectResult> {
  const method = methodOf(venue);

  if (method === "image") {
    if (!venue.imageUrl) {
      console.log(`  – no imageUrl configured`);
      return {
        events: [],
        source: directSource(venue.urls[0] ?? ""),
        status: "failed",
      };
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
            status: unchanged === "events" ? "unchanged" : "complete",
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
        status: "failed",
        modelUnavailable: true,
      };
    }
    const events = await dependencies.extractImageEvents(
      `Venue: ${venue.name} (Frederick County, MD).\n${IMAGE_SHAPE}`,
      venue.imageUrl,
    );
    if (!Array.isArray(events)) {
      console.log(`  – vision extraction incomplete; source will retry`);
      return {
        events: [],
        source: directSource(venue.urls[0] ?? venue.imageUrl),
        status: "failed",
      };
    }
    const publishableEvents = publishableRawEvents(events);
    if (events.length > 0 && publishableEvents.length === 0) {
      console.log(`  – vision returned no publishable rows; source will retry`);
      return {
        events: [],
        source: directSource(venue.urls[0] ?? venue.imageUrl),
        status: "failed",
      };
    }
    if (fingerprint) {
      recordVenueSourceObservation(sourceState, venue.slug, venue.imageUrl, {
        ...fingerprint,
        method,
        extractorVersion: VENUE_IMAGE_EXTRACTOR_VERSION,
        outcome: publishableEvents.length ? "events" : "empty",
      });
    }
    const n = publishableEvents.length;
    console.log(`  ✓ ${n} event(s) from image ${venue.imageUrl}`);
    return {
      events: withSafeRadiusSummaries(publishableEvents),
      source: directSource(venue.urls[0] ?? venue.imageUrl),
      status: "complete",
    };
  }

  if (method === "feed") {
    // Deterministic Squarespace JSON — no model call. Try alternatives until
    // one yields events. An empty inventory is authoritative only when every
    // configured alternative was successfully verified as empty.
    let verifiedEmptySource: SourceProvenance | null = null;
    let allAlternativesVerifiedEmpty = venue.urls.length > 0;
    for (const url of venue.urls) {
      const result = await dependencies.fetchSquarespaceEventsResult(url);
      if (result.status === "failure") {
        allAlternativesVerifiedEmpty = false;
        continue;
      }
      const events = publishableRawEvents(result.events);
      if (events.length) {
        console.log(`  ✓ ${events.length} event(s) from feed ${url}`);
        return { events, source: directSource(url), status: "complete" };
      }
      if (result.events.length) {
        console.log(`  – feed returned no valid event date-times: ${url}`);
        allAlternativesVerifiedEmpty = false;
        continue;
      }
      verifiedEmptySource ??= directSource(url);
    }
    if (verifiedEmptySource && allAlternativesVerifiedEmpty) {
      console.log(`  – feed verified with no upcoming events`);
      return {
        events: [],
        source: verifiedEmptySource,
        status: "complete",
      };
    }
    console.log(`  – feed could not be verified; prior data retained`);
    return {
      events: [],
      source: directSource(venue.urls[0] ?? ""),
      status: "failed",
    };
  }

  // render | fetch — page text → model. Try each URL; first hit wins.
  let verifiedEmptySource: SourceProvenance | null = null;
  let allAlternativesVerifiedEmpty = venue.urls.length > 0;
  for (const url of venue.urls) {
    const snapshot = await dependencies.fetchPageSnapshot(url, {
      render: method === "render",
      allowedRedirectHosts: venue.allowedRedirectHosts ?? [],
    });
    if (!snapshot) {
      allAlternativesVerifiedEmpty = false;
      continue;
    }
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
        console.log(
          `  = source unchanged (${unchanged}); Claude skipped: ${url}`,
        );
        return {
          events: [],
          source: {
            url: snapshot.requestedUrl,
            requestedUrl: snapshot.requestedUrl,
            finalUrl: snapshot.finalUrl,
          },
          status: "unchanged",
        };
      }
      if (unchanged === "empty") {
        console.log(
          `  = source unchanged (${unchanged}); Claude skipped: ${url}`,
        );
        verifiedEmptySource ??= {
          url: snapshot.requestedUrl,
          requestedUrl: snapshot.requestedUrl,
          finalUrl: snapshot.finalUrl,
        };
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
        status: "failed",
        modelUnavailable: true,
      };
    }
    const events = await dependencies.extractTextEvents(
      `Venue: ${venue.name} (Frederick County, MD).\n${SHAPE}`,
      snapshot.text,
    );
    if (!Array.isArray(events)) {
      console.log(`  – extraction incomplete; source will retry: ${url}`);
      allAlternativesVerifiedEmpty = false;
      continue;
    }
    const publishableEvents = publishableRawEvents(events);
    if (events.length > 0 && publishableEvents.length === 0) {
      console.log(
        `  – extraction had no publishable rows; source will retry: ${url}`,
      );
      allAlternativesVerifiedEmpty = false;
      continue;
    }
    recordVenueSourceObservation(sourceState, venue.slug, url, {
      ...fingerprint,
      outcome: publishableEvents.length ? "events" : "empty",
    });
    if (publishableEvents.length) {
      console.log(`  ✓ ${publishableEvents.length} event(s) from ${url}`);
      return {
        events: withSafeRadiusSummaries(publishableEvents),
        source: {
          url: snapshot.requestedUrl,
          requestedUrl: snapshot.requestedUrl,
          finalUrl: snapshot.finalUrl,
        },
        status: "complete",
      };
    }
    verifiedEmptySource ??= {
      url: snapshot.requestedUrl,
      requestedUrl: snapshot.requestedUrl,
      finalUrl: snapshot.finalUrl,
    };
    console.log(`  – 0 event(s) from ${url}`);
  }
  if (verifiedEmptySource && allAlternativesVerifiedEmpty) {
    return {
      events: [],
      source: verifiedEmptySource,
      status: "complete",
    };
  }
  return {
    events: [],
    source: directSource(venue.urls[0] ?? ""),
    status: "failed",
  };
}

async function main() {
  resetFirecrawlFallbackUsage();
  const only = process.argv[2];
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as {
    venues: VenueSource[];
  };
  // The public artifact intentionally omits exact duplicates from the known
  // Weinberg/New Spire pair. Seed promotion from the unsuppressed source
  // inventory when available so a hidden Weinberg row remains recoverable if
  // New Spire later removes its copy. Falling back to the public artifact makes
  // the first run after this migration safe for existing deployments.
  const existingPath = existsSync(SOURCE_INVENTORY_OUT)
    ? SOURCE_INVENTORY_OUT
    : OUT;
  const existing = (
    JSON.parse(readFileSync(existingPath, "utf8")) as VenueEvent[]
  ).flatMap((event) => {
    const normalized = normalizeVenueEventTimes(event);
    return normalized ? [normalized] : [];
  });
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
        !Number.isFinite(startsAt) || startsAt >= runStartedAt - 86_400_000
      );
    });
    const {
      events,
      source,
      status,
      modelUnavailable: sourceModelUnavailable,
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
    if (status === "unchanged") {
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
    const promotedRows: VenueEvent[] = [];
    for (const ev of events) {
      if (!ev.title || !ev.starts_at) continue;
      promotedRows.push({
        ...ev,
        venue_slug: venue.slug,
        venue_name: venue.name,
        category: inferredNonMusicCategory(ev.title) ?? venue.category,
        source: { ...source, fetchedAt: nowISO() },
      });
    }
    const promotion = promoteVenueInventory({
      inventory: byKey,
      venueSlug: venue.slug,
      status,
      rows: promotedRows,
      keyOf,
    });
    added += promotion.added;
    if (status === "complete") {
      console.log(
        `  ↑ promoted complete inventory (${promotedRows.length} current, ` +
          `${promotion.removed} retired)`,
      );
    }
  }

  // Keep only future-ish events: drop anything whose date clearly parsed in the past.
  const futureish = [...byKey.values()].filter((e) => {
    const t = Date.parse(e.starts_at ?? "");
    return !Number.isFinite(t) || t >= runStartedAt - 86_400_000; // keep unparseable + within last day
  });
  const {
    sourceInventory,
    publishedEvents: kept,
    suppressed,
  } = buildRecoverableVenuePublication(futureish);

  writeFileSync(
    SOURCE_INVENTORY_OUT,
    JSON.stringify(sourceInventory, null, 2) + "\n",
  );
  writeFileSync(OUT, JSON.stringify(kept, null, 2) + "\n");
  const sourceStateAfter = serializeVenueSourceState(sourceState);
  if (sourceStateAfter !== sourceStateBefore) {
    writeFileSync(SOURCE_STATE, sourceStateAfter);
  }
  console.log(
    `\nDone. +${added} new, ${unchangedSources} unchanged source(s) skipped, ` +
      `${suppressed} exact cross-venue duplicate(s) suppressed, ` +
      `${kept.length} published / ${sourceInventory.length} retained ` +
      `→ src/data/venue-events.json`,
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
