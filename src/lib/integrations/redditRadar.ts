/**
 * Community radar — what r/frederickmd is talking about, for the OWNER only.
 *
 * Source: the subreddit's official RSS feed, which Reddit publishes for
 * syndication. We read TITLES + LINKS only (no comment scraping, no content
 * storage), cache for ~15 minutes, send a descriptive User-Agent, and every
 * row links OUT to Reddit — the legitimate, traffic-driving use of the feed.
 *
 * DELIBERATELY ADMIN-ONLY: the live feed mixes real catalog leads ("the new
 * Sardis is open") with unverified accusations against named local businesses.
 * The owner's judgment is the only safe filter, so this powers /admin/radar
 * and nothing public. Do not wire it into a public surface without an explicit
 * owner decision and a curation layer.
 *
 * Fail-soft: any fetch/parse trouble returns [] and the page says so quietly.
 */
import { unstable_cache } from "next/cache";
import {
  fairFrictionTopics,
  type FairFrictionTopic,
} from "@/lib/fair/community-intelligence";

export { fairFrictionTopics, type FairFrictionTopic } from "@/lib/fair/community-intelligence";

const FEED_URL = "https://www.reddit.com/r/frederickmd/.rss";
const FAIR_FEED_URL =
  'https://www.reddit.com/r/frederickmd/search.rss?q=%22Great%20Frederick%20Fair%22&restrict_sr=on&sort=new&t=all';
const UA = "frederick-radius:community-radar:v1.0 (local guide; contact hello@frederickradius.app)";

export type RadarPost = {
  title: string;
  url: string;
  /** Human "how long ago" label, formatted at fetch time (cached ≤15 min, so
   *  at most that much drift — fine for a morning-scan surface). */
  agoLabel: string;
  /** Epoch ms, for sorting/recency checks. */
  atMs: number;
  /** True when the title smells like a catalog lead (opening/closing/new…). */
  lead: boolean;
  /** True when the post is someone ASKING for a recommendation — the same
   *  intent Ask Frederick answers, so these are live data-gap signals. */
  ask: boolean;
  /** Catalog places the title mentions (matched against places-client names),
   *  so chatter about a place we already list is visible at a glance. */
  about: string[];
};

export type FairRadarPost = RadarPost & {
  /** Topic hints are triage labels only. The linked post remains unverified. */
  topics: FairFrictionTopic[];
};

/** Titles that likely mean a place opened/closed/changed — the catalog leads. */
const LEAD_RE =
  /\b(open(s|ed|ing)?|closed?|closing|closes|shut(ting)? down|coming soon|grand opening|soft open|now serving|replac(es|ed|ing)|new (restaurant|bar|brewery|cafe|coffee|shop|store|spot|place))\b/i;

/** Someone asking for a recommendation — Ask Frederick's exact intent, live. */
const ASK_RE =
  /\b(recommend|recommendation|suggestion|where (can|do|should)|looking for|best (place|spot)|any good|anyone know (a|of|where)|does anyone|is there a)\b/i;

// ── Catalog cross-match ─────────────────────────────────────────────────
// Which of OUR places a post is talking about. Names are matched whole-word
// and only when distinctive enough that a match is meaningful: multi-word
// names ≥5 chars, or single words ≥6 chars that aren't everyday nouns.
import placesData from "@/data/places-client.json";

const NAME_STOP = new Set([
  "the", "frederick", "market", "main", "street", "park", "company", "house",
  "villa", "center", "club", "east", "west", "north", "south", "urbana",
  "common", "commons", "city", "county", "brunswick", "middletown",
]);

type CatalogPlace = { name: string };

const PLACE_PATTERNS: { name: string; re: RegExp }[] = (placesData as CatalogPlace[])
  .map((p) => {
    const n = p.name.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (n.length < 5) return null;
    const words = n.split(/\s+/);
    if (words.length === 1 && (NAME_STOP.has(n.toLowerCase()) || n.length < 6)) return null;
    try {
      return { name: p.name, re: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") };
    } catch {
      return null;
    }
  })
  .filter((x): x is { name: string; re: RegExp } => x !== null);

/** Catalog place names a title mentions (capped — a title is short). */
export function catalogMentions(title: string): string[] {
  const out: string[] = [];
  for (const p of PLACE_PATTERNS) {
    if (p.re.test(title)) {
      out.push(p.name);
      if (out.length >= 3) break;
    }
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function ago(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Parse the Atom feed into radar posts. Pure (xml + now in), spec-covered. */
export function parseRadarEntries(xml: string, now: number): RadarPost[] {
  const posts: RadarPost[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const t = e.match(/<title>([\s\S]*?)<\/title>/);
    const link = e.match(/<link href="([^"]+)"/);
    const upd = e.match(/<updated>([^<]+)<\/updated>/);
    if (!t || !link) continue;
    const title = decode(t[1]).trim();
    const url = decode(link[1]);
    // Only real post permalinks — never anything else the feed might carry.
    if (!title || !/^https:\/\/www\.reddit\.com\/r\/frederickmd\/comments\//.test(url)) continue;
    const atMs = upd ? Date.parse(upd[1]) : NaN;
    posts.push({
      title: title.slice(0, 200),
      url,
      atMs: Number.isFinite(atMs) ? atMs : now,
      agoLabel: ago(Number.isFinite(atMs) ? atMs : now, now),
      lead: LEAD_RE.test(title),
      ask: ASK_RE.test(title),
      about: catalogMentions(title),
    });
  }
  posts.sort((a, b) => b.atMs - a.atMs);
  return posts;
}

async function fetchRedditRadar(): Promise<RadarPost[]> {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": UA },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRadarEntries(await res.text(), Date.now());
  } catch {
    return [];
  }
}

async function fetchFairRedditRadar(): Promise<FairRadarPost[]> {
  try {
    const res = await fetch(FAIR_FEED_URL, {
      headers: { "User-Agent": UA },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return parseRadarEntries(await res.text(), Date.now()).map((post) => ({
      ...post,
      topics: fairFrictionTopics(post.title),
    }));
  } catch {
    return [];
  }
}

/** r/frederickmd's current front page (titles + links), cached ~15 min. */
export const getRedditRadar = unstable_cache(fetchRedditRadar, ["reddit-radar-v1"], {
  revalidate: 900,
});

/**
 * Exact public RSS search for Fair posts. Titles and Reddit permalinks only;
 * no author names, post bodies, comments, or public auto-publishing.
 */
export const getFairRedditRadar = unstable_cache(
  fetchFairRedditRadar,
  ["reddit-fair-radar-v1"],
  { revalidate: 3600 },
);
