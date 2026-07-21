/**
 * FredScanner live incidents — reads the Slack #incidents channel (the IFTTT
 * CAD feed) and returns only the safe, public, non-medical incidents.
 *
 * Ingestion is a plain server-side read of the channel history via the Slack
 * Web API, cached ~60s and fail-soft to empty — the same shape as every other
 * feed here (CHART, PulsePoint, USGS). No webhook, no table: the channel IS
 * the store. The privacy allowlist lives in lib/scanner/incidentFeed and is
 * unit-tested; this module only fetches, ages out, and de-dupes.
 *
 * Config (dormant until BOTH are set, like PulsePoint's agency id):
 *   - SCANNER_SLACK_BOT_TOKEN   a bot token with channels:history on the feed
 *   - SCANNER_INCIDENTS_CHANNEL the #incidents channel id (e.g. C06Q4SH7N3T)
 * Unset → empty result, every surface self-hides.
 */
import { unstable_cache } from "next/cache";
import { publicIncident, geocodableAddress, parseIncidentLine, type PublicIncident } from "@/lib/scanner/incidentFeed";
import { geocodeAddressInCounty } from "@/lib/integrations/mapboxGeocode";

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

async function fetchScannerIncidents(): Promise<ScannerIncident[]> {
  if (!scannerConfigured()) return [];
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

      // Collapse the same call reposted / updated within the window.
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

/**
 * Recent public scanner incidents, cached ~60s. Empty (and every surface
 * self-hides) until the bot token + channel are configured.
 */
export const getScannerIncidents = unstable_cache(
  fetchScannerIncidents,
  ["scanner-incidents-v1"],
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
