/**
 * Schema validation at the live-feed boundary.
 *
 * Every iCal/RSS parser hands its candidate rows to `validateLiveEvent`
 * before they leave the integration layer. Rows that fail are dropped
 * and recorded with a structured reason so the data-health dashboard
 * can surface what the upstream feeds are doing wrong this week.
 *
 * Why Zod and why here:
 *   - The TS type `LiveEvent` is a compile-time contract only — the
 *     iCal/RSS parsers happily produce rows that TypeScript would
 *     accept (`venue_name: ""`, `geom: { lng: NaN, lat: NaN }`) but
 *     that downstream UI cannot render sanely.
 *   - We want a single source of truth that *runs at the boundary*
 *     and refuses bad data before it can render on a card.
 *   - Counts are exposed via `consumeFeedMetrics()` so the admin
 *     dashboard can show "Validation failures (last fetch)".
 *
 * Failures are by design transient — the next fetch resets the counts.
 * Persistent recording belongs on the cron path, not the request path.
 */

import { z } from "zod";

// Frederick County bounding box, generous edges so events at the
// county line don't fail a strict check. Anything outside this is
// almost certainly a feed bug (an event tagged with the parser's
// fallback lat/lng of 0,0, or a misconfigured default).
const FC_BBOX = {
  minLng: -78.0,
  maxLng: -76.8,
  minLat: 39.0,
  maxLat: 39.95,
};

const lngLatSchema = z
  .object({
    lng: z.number().finite(),
    lat: z.number().finite(),
  })
  .refine(
    (g) =>
      g.lng >= FC_BBOX.minLng &&
      g.lng <= FC_BBOX.maxLng &&
      g.lat >= FC_BBOX.minLat &&
      g.lat <= FC_BBOX.maxLat,
    { message: "geom outside Frederick County bbox" },
  );

// ISO 8601, must parse to a real Date that isn't NaN. We don't pin to
// z.string().datetime() because the upstream feeds vary: some emit Z,
// some emit +00:00, and our parser normalizes via toISOString anyway.
const isoDateSchema = z
  .string()
  .min(10)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "not a valid ISO date",
  });

export const liveEventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(2).max(220),
    description: z.string().max(1200),
    starts_at: isoDateSchema,
    ends_at: isoDateSchema,
    venue_name: z.string().min(2).max(160),
    address: z.string().max(220),
    geom: lngLatSchema,
    municipality: z.string().min(2).max(40),
    category: z.string().max(40),
    organizer: z.string().max(120),
    // MUST stay in sync with the FeedSpec source union in ical-live.ts. When it
    // drifts, the parsed events from the missing sources fail validation and are
    // SILENTLY DROPPED (city-frederick / fair / mount-airy / thurmont / parks
    // were all being dropped here despite being wired feeds).
    source: z.enum([
      "dfp",
      "celebrate",
      "county",
      "hood",
      "visit-frederick",
      "weinberg",
      "delaplaine",
      "ticketmaster",
      "bandsintown",
      "seatgeek",
      "eventbrite",
      "fcpl",
      "city-frederick",
      "fair",
      "mount-airy",
      "thurmont",
      "parks",
      "heritage-frederick",
      "monocacy",
      "msd",
      "mount-st-marys",
      "isf",
      "elc",
      "civil-war-med",
      "maryland-ensemble",
      "catoctin",
      "fcc",
    ]),
    source_label: z.string().min(1).max(120),
    url: z.string().url(),
    is_free: z.boolean(),
    /** Lifecycle status — derived at parse time from the iCal STATUS
     *  property or a title sniff. Optional + defaulted so a feed that
     *  predates this field still validates. */
    status: z.enum(["scheduled", "cancelled", "postponed"]).default("scheduled"),
    /** When the row was pulled from its source. Server fills this. */
    last_verified_at: isoDateSchema,
  })
  .refine((e) => Date.parse(e.ends_at) >= Date.parse(e.starts_at), {
    message: "ends_at before starts_at",
    path: ["ends_at"],
  });

export type ValidatedLiveEvent = z.infer<typeof liveEventSchema>;

/**
 * Per-source metrics for the current process. The admin dashboard
 * snapshots them; the next feed fetch overwrites them. This is
 * intentionally in-memory: persistence is the cron's job, not the
 * request path's, and we don't want to grow disk on every render.
 */
type SourceMetrics = {
  passed: number;
  dropped: number;
  reasons: Record<string, number>;
  last_fetched_at: string | null;
};

const METRICS = new Map<string, SourceMetrics>();

function metricsFor(source: string): SourceMetrics {
  let m = METRICS.get(source);
  if (!m) {
    m = { passed: 0, dropped: 0, reasons: {}, last_fetched_at: null };
    METRICS.set(source, m);
  }
  return m;
}

/**
 * Validate one candidate row. Returns the parsed row on success, or
 * `null` on failure (and records the reason for the dashboard).
 *
 * The caller is responsible for the feed's `source` label so the
 * dropped counts can be attributed correctly.
 */
export function validateLiveEvent(
  candidate: unknown,
  source: string,
): ValidatedLiveEvent | null {
  const m = metricsFor(source);
  const result = liveEventSchema.safeParse(candidate);
  if (result.success) {
    m.passed += 1;
    return result.data;
  }
  m.dropped += 1;
  // Roll up the first issue's path + message — that's almost always
  // the load-bearing reason and avoids exploding the reason map.
  const issue = result.error.issues[0];
  const key = issue
    ? `${issue.path.join(".") || "(root)"}: ${issue.message}`
    : "unknown";
  m.reasons[key] = (m.reasons[key] ?? 0) + 1;
  if (process.env.NODE_ENV !== "production") {

    console.warn(`[event-schema] ${source} dropped:`, key);
  }
  return null;
}

/** Called at the start of each feed pull so counts reflect the fresh fetch. */
export function resetFeedMetrics(source: string): void {
  METRICS.set(source, {
    passed: 0,
    dropped: 0,
    reasons: {},
    last_fetched_at: new Date().toISOString(),
  });
}

/** Snapshot for the admin dashboard. Returns a stable array. */
export function consumeFeedMetrics(): Array<{
  source: string;
  passed: number;
  dropped: number;
  reasons: Array<{ key: string; count: number }>;
  last_fetched_at: string | null;
}> {
  return [...METRICS.entries()]
    .map(([source, m]) => ({
      source,
      passed: m.passed,
      dropped: m.dropped,
      reasons: Object.entries(m.reasons)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      last_fetched_at: m.last_fetched_at,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}
