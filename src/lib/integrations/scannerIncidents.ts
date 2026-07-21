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
import { publicIncident, type PublicIncident } from "@/lib/scanner/incidentFeed";

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
  attachments?: { text?: string; fallback?: string; pretext?: string }[];
};

/** The IFTTT bot puts the dispatch line in an attachment; fall back to text. */
function lineFromMessage(m: SlackMessage): string | null {
  const att = m.attachments?.find((a) => a.text || a.fallback || a.pretext);
  const raw = (att?.text || att?.fallback || att?.pretext || m.text || "").trim();
  return raw || null;
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
