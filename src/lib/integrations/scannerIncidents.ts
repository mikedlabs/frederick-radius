/**
 * Frederick County live incidents — returns only the safe, public,
 * non-medical calls, from a source that needs NO account of ours.
 *
 * Primary source: the public RSS mirror the University of Maryland news-apps
 * program publishes from frederickscanner.com (latest.rss) — open data, no
 * auth, no token, no dependency on anyone's Slack workspace. We read it
 * directly, apply the same allowlist, age out, and de-dupe.
 *
 * Optional override: if a Slack bot token IS configured
 * (SCANNER_SLACK_BOT_TOKEN + SCANNER_INCIDENTS_CHANNEL), we prefer the direct
 * channel read (more real-time). Neither is required — the RSS keeps it live
 * with zero setup. Cached ~60s, fail-soft to empty like every other feed.
 */
import { unstable_cache } from "next/cache";
import {
  publicIncident,
  classifyPublicIncident,
  geocodableAddress,
  parseIncidentLine,
  type PublicIncident,
} from "@/lib/scanner/incidentFeed";
import { geocodeAddressInCounty } from "@/lib/integrations/mapboxGeocode";
import { easternWallToUtcISO } from "@/lib/tz";

/** The REAL-TIME public source: frederickscanner.com's own dispatch page. One
 *  <p> per call, in the exact pipe format the parser already handles. No auth,
 *  no lag, no token — this is the live wire. */
const DIRECT_URL = "https://frederickscanner.com/fredscannerpro/tweets.html";
/** Lagged public fallback (UMD news-apps RSS mirror), only if the direct page
 *  is unreachable. */
const RSS_URL = "https://newsappsumd.github.io/fredscanner/latest.rss";
const SCANNER_FETCH_TIMEOUT_MS = 6_000;
const DIRECT_PAGE_MARKER_RE = /\bLatest Incidents\s*:/i;
const DIRECT_EMPTY_MARKER_RE =
  /\bNew incident log started\.\s*This will start populating soon\./i;

export type ScannerIncident = PublicIncident & {
  /** LATEST dispatch post for this call (ISO) — drives freshness sort and the
   *  "updated X ago" label. A quiet call and a busy one both age out by this. */
  at: string;
  /** EARLIEST post for this call (ISO) — when it was first dispatched. Equal to
   *  `at` for a one-post call; earlier for an active call that's still updating. */
  firstAt: string;
  /** How many dispatch posts this call has produced (>=1). A growing count is
   *  the honest, unit-free signal that a call is active and escalating. */
  updates: number;
};

export type ScannerFeedSource = "direct" | "slack" | "rss";

export type ScannerIncidentsResult = {
  data: ScannerIncident[];
  /** True only when a source returned its expected, parseable shape. */
  available: boolean;
  source?: ScannerFeedSource;
  /** Provider event time or HTTP response time; see `asOfBasis`. */
  asOf?: string;
  asOfBasis?: "provider" | "retrieval";
};

/** One parsed post plus its wall-clock time, before we fold it into a call. */
export type IncidentEntry = { inc: PublicIncident; atMs: number };

/**
 * Fold a stream of individual dispatch posts into live calls. The public feed
 * posts the SAME call several times as it develops (a working fire gets a new
 * line each time the response grows); collapsing those to one entry threw that
 * lifecycle away. Here we group by kind+location, keep the earliest and latest
 * post times and the post count, and let the latest post drive the display. No
 * unit or radio codes are ever exposed — a count and a time span are the only
 * lifecycle signals, and both are already public-safe.
 */
export function aggregate(entries: IncidentEntry[]): ScannerIncident[] {
  const now = Date.now();
  const groups = new Map<
    string,
    { inc: PublicIncident; first: number; last: number; count: number }
  >();
  for (const { inc, atMs } of entries) {
    if (now - atMs > MAX_AGE_MS) continue;
    const key = `${inc.kind}|${inc.location}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { inc, first: atMs, last: atMs, count: 1 });
      continue;
    }
    g.count += 1;
    if (atMs < g.first) g.first = atMs;
    if (atMs >= g.last) {
      g.last = atMs;
      g.inc = inc; // newest post drives the shown time/kind
    }
  }
  const out: ScannerIncident[] = [];
  for (const g of groups.values()) {
    out.push({
      ...g.inc,
      at: new Date(g.last).toISOString(),
      firstAt: new Date(g.first).toISOString(),
      updates: g.count,
    });
  }
  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return out;
}

const token = () => process.env.SCANNER_SLACK_BOT_TOKEN || "";
const channel = () => process.env.SCANNER_INCIDENTS_CHANNEL || "";

/**
 * How far back the LIST (dispatch board) reaches. Public, non-medical calls are
 * relatively rare, so a 1-hour window left the board blank most of the day even
 * though there were real crashes/fires/wires that morning. 12 hours keeps it a
 * useful "recent public-safety activity" log — rarely empty during the day —
 * while every row carries its own clock time so nothing reads as more current
 * than it is. The MAP shows the same window (so past calls are visible where
 * they happened), but pins older than RECENT_MS render as "past" — dimmed and
 * not pulsing — so an active scene still stands out (see LiveIncidents).
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** A pin newer than this pulses as active; older ones show dimmed as past. */
export const RECENT_INCIDENT_MS = 60 * 60 * 1000;

export function scannerConfigured(): boolean {
  return Boolean(token() && channel());
}

type SlackMessage = {
  ts?: string;
  text?: string;
  attachments?: { text?: string; fallback?: string; pretext?: string; title?: string }[];
  blocks?: unknown;
};

/** Every string a Slack message might carry the dispatch line in, in priority
 *  order: message text, then each attachment's text/fallback/pretext/title,
 *  then any string found inside blocks. Robust to however IFTTT nests it. */
export function messageCandidates(m: SlackMessage): string[] {
  const out: string[] = [];
  if (typeof m.text === "string") out.push(m.text);
  for (const a of m.attachments ?? []) {
    for (const v of [a.text, a.fallback, a.pretext, a.title]) {
      if (typeof v === "string") out.push(v);
    }
  }
  // Blocks can nest text arbitrarily; pull every string out defensively.
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  if (m.blocks) walk(m.blocks);
  return out;
}

/** The dispatch line from a message: the first candidate that PARSES as one
 *  (whatever field it lives in), else the first non-empty candidate. */
function lineFromMessage(m: SlackMessage): string | null {
  const cands = messageCandidates(m).map((s) => s.replace(/^attachment:\s*/i, "").trim());
  const parsed = cands.find((s) => parseIncidentLine(s));
  if (parsed) return parsed;
  return cands.find((s) => s.length > 0) ?? null;
}

function responseDate(res: Response): string | undefined {
  const raw = res.headers.get("date");
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function newestIncidentAt(incidents: readonly ScannerIncident[]): string | undefined {
  return incidents
    .map((incident) => incident.at)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function successfulScannerResult(
  source: ScannerFeedSource,
  data: ScannerIncident[],
  retrievedAt?: string,
): ScannerIncidentsResult {
  const providerAsOf = newestIncidentAt(data);
  return {
    data,
    available: true,
    source,
    ...(retrievedAt
      ? { asOf: retrievedAt, asOfBasis: "retrieval" as const }
      : providerAsOf
        ? { asOf: providerAsOf, asOfBasis: "provider" as const }
        : {}),
  };
}

async function fetchFromSlack(signal: AbortSignal): Promise<ScannerIncidentsResult> {
  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel())}&limit=80`,
      {
        headers: { Authorization: `Bearer ${token()}` },
        signal,
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return { data: [], available: false, source: "slack" };
    const data = (await res.json()) as { ok?: boolean; messages?: SlackMessage[] };
    if (!data.ok || !Array.isArray(data.messages)) {
      return { data: [], available: false, source: "slack" };
    }

    const entries: IncidentEntry[] = [];
    for (const m of data.messages) {
      const tsSec = Number(m.ts);
      if (!Number.isFinite(tsSec)) continue;
      const atMs = tsSec * 1000;

      const line = lineFromMessage(m);
      if (!line) continue;
      const inc = publicIncident(line);
      if (!inc) continue;
      entries.push({ inc, atMs });
    }
    return successfulScannerResult("slack", aggregate(entries), responseDate(res));
  } catch {
    return { data: [], available: false, source: "slack" };
  }
}

/** Pull one tag's inner text from an RSS <item> chunk (handles CDATA). */
function rssTag(chunk: string, tag: string): string {
  const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/**
 * Read the public RSS mirror. Each item: title = "TYPE: 8:23 pm",
 * description = "LOCATION, Bldg:… Radio: 9C Units: E31". We split those into
 * the parts the shared allowlist expects, then classify.
 */
async function fetchFromRss(signal: AbortSignal): Promise<ScannerIncidentsResult> {
  try {
    const res = await fetch(RSS_URL, {
      signal,
      next: { revalidate: 60 },
    });
    if (!res.ok) return { data: [], available: false, source: "rss" };
    const xml = await res.text();
    if (!/<(?:rss|feed)\b/i.test(xml)) {
      return { data: [], available: false, source: "rss" };
    }
    const items = xml.split(/<item[\s>]/i).slice(1);

    const entries: IncidentEntry[] = [];
    for (const chunk of items) {
      const title = rssTag(chunk, "title");
      const desc = rssTag(chunk, "description");
      const pub = rssTag(chunk, "pubDate");
      // "BUILDING FIRE: 8:45 pm" → type + clock time.
      const tm = title.match(/^(.*?):\s*(\d{1,2}:\d{2}\s*(?:am|pm))\s*$/i);
      if (!tm) continue;
      const type = tm[1].trim();
      const time = tm[2].trim();
      // Location = everything before Radio:/Units:, minus Bldg/Apt noise.
      const location = desc
        .split(/\b(?:radio|units)\s*:/i)[0]
        .replace(/,?\s*(?:bldg|apt\/unit)\s*:[^,]*/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const inc = classifyPublicIncident(type, location, time);
      if (!inc) continue;

      const atMs = pub ? Date.parse(pub) : NaN;
      if (!Number.isFinite(atMs)) continue;
      entries.push({ inc, atMs });
    }
    return successfulScannerResult("rss", aggregate(entries), responseDate(res));
  } catch {
    return { data: [], available: false, source: "rss" };
  }
}

/** Timestamp (ms) for a direct-page line from its "(posted MM/DD/YYYY)" date +
 *  the clock time. The page prints Eastern wall-clock, so resolve it through
 *  America/New_York — DST-aware. A hardcoded -04:00 (the old code) read every
 *  EST-months call an hour early, which mislabels "how long ago" and can flip
 *  a call across the 1h recent/stale boundary. */
function directTimestamp(line: string, clock: string): number | null {
  const dm = line.match(/posted\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const tm = clock.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!dm || !tm) return null;
  let h = parseInt(tm[1], 10) % 12;
  if (/pm/i.test(tm[3])) h += 12;
  const ms = Date.parse(
    easternWallToUtcISO(+dm[3], +dm[1], +dm[2], h, parseInt(tm[2], 10)),
  );
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Read frederickscanner.com's live dispatch page directly. Returns the public
 * incidents on success (even [] on a quiet hour), or null if the page is
 * unreachable — so a real fetch failure falls back, but a genuinely quiet
 * window doesn't show stale data.
 */
async function fetchFromDirect(signal: AbortSignal): Promise<ScannerIncidentsResult> {
  try {
    const res = await fetch(DIRECT_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)" },
      signal,
      next: { revalidate: 60 },
    });
    if (!res.ok) return { data: [], available: false, source: "direct" };
    const html = await res.text();
    const paragraphMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const lines = paragraphMatches
      .map((m) =>
        m[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&#?\w+;/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 120); // newest-first; only the recent head matters
    const hasDispatchLine = lines.some(
      (line) =>
        parseIncidentLine(line) !== null &&
        /\bposted\s+\d{1,2}\/\d{1,2}\/\d{4}\b/i.test(line),
    );
    const hasValidEmptyBoard =
      DIRECT_PAGE_MARKER_RE.test(html) &&
      DIRECT_EMPTY_MARKER_RE.test(html);
    // The direct endpoint occasionally answers 200 with a generic HTML error
    // page. A paragraph alone is not evidence that the dispatch board loaded:
    // require either a dated dispatch-shaped row or the board's explicit empty
    // sentinel before suppressing the Slack/RSS fallback.
    if (!hasDispatchLine && !hasValidEmptyBoard) {
      return { data: [], available: false, source: "direct" };
    }

    const entries: IncidentEntry[] = [];
    for (const line of lines) {
      const inc = publicIncident(line);
      if (!inc) continue;
      const atMs = directTimestamp(line, inc.time);
      if (atMs === null) continue;
      entries.push({ inc, atMs });
    }
    return successfulScannerResult("direct", aggregate(entries), responseDate(res));
  } catch {
    return { data: [], available: false, source: "direct" };
  }
}

/** Live from frederickscanner.com directly; a configured Slack token or the
 *  lagged RSS mirror only stand in if the direct page is unreachable. */
export async function loadScannerIncidentsResult(): Promise<ScannerIncidentsResult> {
  // Direct → optional Slack → RSS is one fallback chain, so it gets one shared
  // deadline. A dead primary cannot consume a fresh timeout and then hand two
  // more full waits to its fallbacks.
  const signal = AbortSignal.timeout(SCANNER_FETCH_TIMEOUT_MS);
  const direct = await fetchFromDirect(signal);
  if (direct.available) return direct;
  if (scannerConfigured()) {
    const slack = await fetchFromSlack(signal);
    if (slack.available) return slack;
  }
  return fetchFromRss(signal);
}

/**
 * Recent public scanner incidents, cached ~60s. Live with zero setup off the
 * public RSS; a configured Slack token takes over for real-time.
 * (v2: source now RSS-by-default, not Slack-only.)
 */
export const getScannerIncidentsResult = unstable_cache(
  loadScannerIncidentsResult,
  // v5 adds explicit availability and rejects malformed 200 responses.
  ["scanner-incidents-v5"],
  { revalidate: 60, tags: ["scanner-incidents"] },
);

/** Compatibility wrapper for existing detail surfaces. */
export async function getScannerIncidents(): Promise<ScannerIncident[]> {
  return (await getScannerIncidentsResult()).data;
}

export type GeocodedIncident = ScannerIncident & { lng: number; lat: number };

export type GeocodedScannerIncidentsResult = Omit<ScannerIncidentsResult, "data"> & {
  data: GeocodedIncident[];
  rawCount: number;
  geocodedCount: number;
};

/**
 * Recent public incidents that resolved to a real in-county coordinate — the
 * data behind the live map layer. Geocoding runs through the shared, 30-day
 * cached, county-gated Mapbox geocoder, so recurring roads cost nothing after
 * the first hit and an unresolvable block simply gets no pin (never a wrong
 * one). Capped per call so a cold cache can't fan out unboundedly.
 */
export async function getGeocodedScannerIncidentsResult(): Promise<GeocodedScannerIncidentsResult> {
  const result = await getScannerIncidentsResult();
  const incidents = result.data;
  if (incidents.length === 0) {
    return {
      ...result,
      data: [],
      rawCount: 0,
      geocodedCount: 0,
    };
  }

  const out: GeocodedIncident[] = [];
  await Promise.all(
    incidents.slice(0, 24).map(async (inc) => {
      const addr = geocodableAddress(inc.location);
      if (!addr) return;
      const coord = await geocodeAddressInCounty(addr);
      if (coord) out.push({ ...inc, lng: coord.lng, lat: coord.lat });
    }),
  );
  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return {
    ...result,
    data: out,
    rawCount: incidents.length,
    geocodedCount: out.length,
  };
}

/** Compatibility wrapper for map and Pulse consumers. */
export async function getGeocodedScannerIncidents(): Promise<GeocodedIncident[]> {
  return (await getGeocodedScannerIncidentsResult()).data;
}
