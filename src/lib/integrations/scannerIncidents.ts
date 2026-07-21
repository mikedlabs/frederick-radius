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

/** Public open-data RSS of Frederick County fire/rescue calls (UMD news apps,
 *  scraped from frederickscanner.com; refreshed ~every 30 min). */
const RSS_URL = "https://newsappsumd.github.io/fredscanner/latest.rss";

export type ScannerIncident = PublicIncident & {
  /** Message timestamp (ISO) so callers can sort and age it out. */
  at: string;
};

const token = () => process.env.SCANNER_SLACK_BOT_TOKEN || "";
const channel = () => process.env.SCANNER_INCIDENTS_CHANNEL || "";

/** Hard cap: nothing older than this ever surfaces, whatever the caller does. */
const MAX_AGE_MS = 60 * 60 * 1000;

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

async function fetchFromSlack(): Promise<ScannerIncident[]> {
  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel())}&limit=80`,
      { headers: { Authorization: `Bearer ${token()}` }, next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; messages?: SlackMessage[] };
    if (!data.ok || !Array.isArray(data.messages)) return [];

    const now = Date.now();
    const seen = new Set<string>();
    const out: ScannerIncident[] = [];
    for (const m of data.messages) {
      const tsSec = Number(m.ts);
      if (!Number.isFinite(tsSec)) continue;
      const atMs = tsSec * 1000;
      if (now - atMs > MAX_AGE_MS) continue;

      const line = lineFromMessage(m);
      if (!line) continue;
      const inc = publicIncident(line);
      if (!inc) continue;

      const key = `${inc.kind}|${inc.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...inc, at: new Date(atMs).toISOString() });
    }
    out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return out;
  } catch {
    return [];
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
async function fetchFromRss(): Promise<ScannerIncident[]> {
  try {
    const res = await fetch(RSS_URL, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split(/<item[\s>]/i).slice(1);

    const now = Date.now();
    const seen = new Set<string>();
    const out: ScannerIncident[] = [];
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

      const atMs = pub ? Date.parse(pub) : now;
      if (Number.isFinite(atMs) && now - atMs > MAX_AGE_MS) continue;

      const key = `${inc.kind}|${inc.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...inc, at: new Date(Number.isFinite(atMs) ? atMs : now).toISOString() });
    }
    out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return out;
  } catch {
    return [];
  }
}

/** Prefer the direct Slack read when a token is configured (more real-time);
 *  otherwise the public RSS mirror, which needs no setup. */
async function fetchScannerIncidents(): Promise<ScannerIncident[]> {
  if (scannerConfigured()) {
    const slack = await fetchFromSlack();
    if (slack.length > 0) return slack;
  }
  return fetchFromRss();
}

/**
 * Recent public scanner incidents, cached ~60s. Live with zero setup off the
 * public RSS; a configured Slack token takes over for real-time.
 * (v2: source now RSS-by-default, not Slack-only.)
 */
export const getScannerIncidents = unstable_cache(
  fetchScannerIncidents,
  ["scanner-incidents-v2"],
  { revalidate: 60, tags: ["scanner-incidents"] },
);

export type GeocodedIncident = ScannerIncident & { lng: number; lat: number };

/**
 * Recent public incidents that resolved to a real in-county coordinate — the
 * data behind the live map layer. Geocoding runs through the shared, 30-day
 * cached, county-gated Mapbox geocoder, so recurring roads cost nothing after
 * the first hit and an unresolvable block simply gets no pin (never a wrong
 * one). Capped per call so a cold cache can't fan out unboundedly.
 */
export async function getGeocodedScannerIncidents(): Promise<GeocodedIncident[]> {
  const incidents = await getScannerIncidents();
  if (incidents.length === 0) return [];

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
  return out;
}
