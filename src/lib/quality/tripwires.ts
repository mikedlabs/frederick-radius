import "server-only";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import { photoUrl } from "@/lib/integrations/google-places";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isEventToday } from "@/lib/eventWhenLabel";
import { askFrederick } from "@/lib/ask/answer";
import ENRICHMENT from "@/data/places-enrichment.json" with { type: "json" };
import BUSINESS_INFO from "@/data/business-info.json" with { type: "json" };
import VENUE_EVENTS from "@/data/venue-events.json" with { type: "json" };

/**
 * End-to-end tripwires — the daily checks for the failure classes that
 * degrade POLITELY and therefore stay invisible.
 *
 * July 2026, one week: Google rotated its photo names and every thumbnail
 * app-wide quietly became the initials tile; the transit feed renamed a
 * field and /transit rendered zero routes; the FCPL ingest outgrew its
 * time budget and died mid-run for two months; the ask box lost its date
 * grounding and told a Reddit user it didn't know what day it was. Every
 * one was found by a human notice, not a system. These checks make each
 * class a red line on the existing anomaly channel instead.
 *
 * Contract: each check is FAIL-SOFT and returns [] when the thing it
 * needs isn't available in this environment (no Google key, no network),
 * so the cron can never be broken by its own watchdog.
 */

type EnrichmentRow = { photo_names?: string[] };

/**
 * Sample real photo names across the catalog and fetch them at thumbnail
 * size. Healthy: most resolve (the proxy's self-heal covers stragglers).
 * Red: half or more fail — the token-rotation class that took down every
 * thumbnail. Deterministic sample (every Nth slug, sorted) so the same
 * places are probed day over day and a flap is visible as a flap.
 */
export async function photoTripwire(sample = 6): Promise<Anomaly[]> {
  const rows = Object.entries(ENRICHMENT as Record<string, EnrichmentRow>)
    .filter(([, v]) => Array.isArray(v.photo_names) && v.photo_names.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.floor(rows.length / sample));
  const picks = Array.from({ length: sample }, (_, i) => rows[Math.min(i * step, rows.length - 1)]);

  let failed = 0;
  const failures: string[] = [];
  for (const [slug, v] of picks) {
    const url = photoUrl(v.photo_names![0], 80);
    if (!url) return []; // no key in this environment — nothing to measure
    try {
      const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        failed++;
        failures.push(`${slug}:${res.status}`);
      }
    } catch {
      failed++;
      failures.push(`${slug}:fetch-error`);
    }
  }
  if (failed * 2 < picks.length) return [];
  return [
    {
      source: "google-photos",
      kind: "photo_rot",
      detail: `${failed}/${picks.length} sampled photo names failed upstream (${failures.join(", ")}) — the dataset's photo references have rotated; thumbnails are on the self-heal path or the placeholder. Regenerate photo names.`,
    },
  ];
}

/** The /transit zero-routes class: the upstream schema changed and the
 *  normalizer silently dropped every route. Healthy is ~15 route groups;
 *  single digits means the feed or the mapping broke. */
export async function transitTripwire(): Promise<Anomaly[]> {
  try {
    const routes = await getFrederickTransitRoutes();
    if (routes.length >= 8) return [];
    return [
      {
        source: "transit-frederick",
        kind: "transit_empty",
        detail: `Transit normalizer returned ${routes.length} route group(s) (healthy ≈ 15). Upstream schema drift or feed outage — /transit is degraded.`,
      },
    ];
  } catch (err) {
    return [
      {
        source: "transit-frederick",
        kind: "transit_empty",
        detail: `Transit fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/** A county with zero public events on ANY day means the assembly (not one
 *  feed — the whole unified pipeline) broke. */
export async function eventsTripwire(now: Date = new Date()): Promise<Anomaly[]> {
  try {
    const { publicEvents } = await assembleUnifiedEvents(now);
    const today = publicEvents.filter((e) => isEventToday(e.starts_at, now)).length;
    if (today > 0) return [];
    return [
      {
        source: "unified-events",
        kind: "events_empty",
        detail: "assembleUnifiedEvents returned ZERO public events for today — the unified pipeline (feeds + classification + time-sanity) is broken upstream of every events surface.",
      },
    ];
  } catch (err) {
    return [
      {
        source: "unified-events",
        kind: "events_empty",
        detail: `assembleUnifiedEvents threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/** One canary ask a day: the question from the Reddit screenshot. Red on a
 *  missing answer, date-blindness, or raw markdown reaching users. Costs
 *  one cached model call daily. */
export async function askCanaryTripwire(): Promise<Anomaly[]> {
  try {
    const res = await askFrederick("Music tonight");
    if (!res.configured) return []; // no AI provider in this environment
    const problems: string[] = [];
    if (!res.answer) problems.push("no answer");
    if (res.answer && /don'?t (have|know) (today'?s|the) date/i.test(res.answer)) problems.push("date-blindness");
    if (res.answer && /\*\*|`/.test(res.answer)) problems.push("raw markdown");
    if (problems.length === 0) return [];
    return [
      {
        source: "ask-frederick",
        kind: "ask_degraded",
        detail: `Canary ask ("Music tonight") degraded: ${problems.join(", ")}. Answer: ${(res.answer ?? "").slice(0, 140)}`,
      },
    ];
  } catch (err) {
    return [
      {
        source: "ask-frederick",
        kind: "ask_degraded",
        detail: `askFrederick threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/**
 * The scheduled extraction agents (business deep-info, venue lineups)
 * commit their output to the repo — so a HEALTHY pipeline means the
 * bundled JSON carries recent fetchedAt stamps. When the newest stamp
 * ages past the window, the agent has stopped extracting, whatever its
 * workflow badge claims: the business-info agent ran 49 straight GREEN
 * no-ops over seven weeks with an empty ANTHROPIC_API_KEY secret before
 * a human noticed the data was frozen (July 2026). This makes "the moat
 * stopped growing" a red line on the same channel as everything else.
 *
 * Windows are generous multiples of each agent's daily schedule so a
 * few no-runner days (account-level Actions limits) don't flap.
 */
export function ingestFreshnessTripwire(now: Date = new Date()): Anomaly[] {
  const out: Anomaly[] = [];
  const check = (
    name: string,
    stamps: Array<string | undefined>,
    maxDays: number,
    hint: string,
  ) => {
    const newest = stamps.filter(Boolean).sort().at(-1);
    if (!newest) return; // dataset empty/never run — nothing to measure
    const days = Math.floor((now.getTime() - Date.parse(newest)) / 86_400_000);
    if (Number.isFinite(days) && days > maxDays) {
      out.push({
        source: name,
        kind: "ingest_stale",
        detail: `${name} newest fetchedAt is ${days}d old (window ${maxDays}d) — the extraction agent has stopped committing. ${hint}`,
      });
    }
  };
  check(
    "business-info",
    Object.values(BUSINESS_INFO as Record<string, { source?: { fetchedAt?: string } }>).map(
      (v) => v.source?.fetchedAt,
    ),
    10,
    "Check the ingest-business-info workflow and the ANTHROPIC_API_KEY repo secret.",
  );
  check(
    "venue-events",
    (VENUE_EVENTS as Array<{ source?: { fetchedAt?: string } }>).map((v) => v.source?.fetchedAt),
    10,
    "Check the ingest-venues workflow and the ANTHROPIC_API_KEY repo secret.",
  );
  return out;
}

export type TripwireReport = {
  anomalies: Anomaly[];
  /** One line per check: name + green/red. */
  checks: Array<{ name: string; green: boolean }>;
};

/** Run every tripwire (concurrently — they're independent networks). */
export async function runTripwires(now: Date = new Date()): Promise<TripwireReport> {
  const [photos, transit, events, ask] = await Promise.all([
    photoTripwire(),
    transitTripwire(),
    eventsTripwire(now),
    askCanaryTripwire(),
  ]);
  const ingest = ingestFreshnessTripwire(now);
  return {
    anomalies: [...photos, ...transit, ...events, ...ask, ...ingest],
    checks: [
      { name: "photos", green: photos.length === 0 },
      { name: "transit", green: transit.length === 0 },
      { name: "events-today", green: events.length === 0 },
      { name: "ask-canary", green: ask.length === 0 },
      { name: "ingest-freshness", green: ingest.length === 0 },
    ],
  };
}
