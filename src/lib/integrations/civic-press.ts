/**
 * Civic press releases — the City of Frederick + Frederick County newsrooms.
 *
 * Both governments run on CivicPlus, which publishes their official "News
 * Flash" press releases as RSS at their own .gov domains. This is the most
 * authoritative possible source for the thing residents most want to know
 * fast: a police arrest, a traffic advisory, a road closure, a county notice.
 * The City Police Department posts its releases to the City feed; the County
 * posts to the County feed (the same channel a Sheriff's Office release uses).
 *
 * We never store or republish body content — title + canonical .gov link +
 * publish date + the press graphic the feed already advertises. RSS is built
 * for exactly this; copyright safety comes from doing the minimum and linking
 * out. Per-feed failures are silent (one .gov down still leaves the other).
 *
 * Each item is classified into a lane from its title (the feed has no
 * category tags): `police` (arrests, investigations, the blotter), `advisory`
 * (traffic / road / water / emergency), or `civic` (everything else). The
 * /pulse can promote a genuinely urgent, fresh `police` release; ordinary
 * announcements remain in the local-updates drawer.
 */

import { createSingleFlight } from "@/lib/single-flight";
import { unstable_cache } from "next/cache";

export type CivicPressLane = "police" | "advisory" | "civic";

export type CivicPressItem = {
  title: string;
  url: string;
  /** Full publisher name, for attribution. */
  source: "City of Frederick" | "Frederick County";
  /** One-word tag for the source pip ("City" / "County"). */
  sourceShort: "City" | "County";
  /** ISO timestamp from the feed's pubDate. */
  publishedAt: string;
  /** The press-release graphic the feed enclosed, if any. */
  imageUrl?: string;
  lane: CivicPressLane;
};

export type CivicPressResult = {
  items: CivicPressItem[];
  sourceHealth: {
    degraded: boolean;
    unavailable: CivicPressItem["source"][];
  };
};

const FEEDS: ReadonlyArray<{
  source: CivicPressItem["source"];
  short: CivicPressItem["sourceShort"];
  url: string;
}> = [
  {
    source: "City of Frederick",
    short: "City",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=1&CID=All-0",
  },
  {
    source: "Frederick County",
    short: "County",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=1&CID=All-0",
  },
];

// ── Lane classifiers (title-based; the feed carries no categories) ────
// Police blotter: anything a PD / Sheriff would put out. "Frederick Police"
// is the City PD's standing byline, so it alone qualifies.
const POLICE_RE =
  /\b(police|sheriff|deput(?:y|ies)|arrest(?:ed|s)?|homicide|shoot(?:ing|s)?|stabb|robber|burglar|suspect|investigat|barrack|fugitive|amber alert|silver alert|standoff|pursuit|fatal|firearm|assault|wanted|in custody|charged|indict|missing (?:person|man|woman|teen|boy|girl|child|juvenile))\b/i;
// Time-sensitive advisories. Holiday "offices closed for Juneteenth" notices
// are explicitly NOT advisories — they're routine civic news.
const ADVISORY_RE =
  /\b(traffic advisory|road closure|road work|lane closure|detour|temporarily closed|to be closed|boil water|water main|shelter in place|evacuat|emergency|power outage|flooding|flood warning|severe weather|hazmat)\b/i;
const HOLIDAY_CLOSURE_RE = /\boffices?\s+closed\b/i;

/** Lane for a press-release title. Exported for the boundary test. */
export function classifyCivicPress(title: string): CivicPressLane {
  if (POLICE_RE.test(title)) return "police";
  if (ADVISORY_RE.test(title) && !HOLIDAY_CLOSURE_RE.test(title)) return "advisory";
  return "civic";
}

// ── Parsing (CivicPlus RSS is plain, entity-escaped text) ─────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function tagText(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return "";
  return decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
}

function parseFeed(
  xml: string,
  source: CivicPressItem["source"],
  short: CivicPressItem["sourceShort"],
): CivicPressItem[] {
  const out: CivicPressItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = tagText("title", block);
    const url = tagText("link", block);
    const pubDate = tagText("pubDate", block);
    if (!title || !url) continue;
    const when = pubDate ? new Date(pubDate) : null;
    const enclosure = block.match(/<enclosure[^>]*url="([^"]+)"/i);
    out.push({
      title,
      url,
      source,
      sourceShort: short,
      publishedAt: when && !Number.isNaN(+when) ? when.toISOString() : new Date(0).toISOString(),
      imageUrl: enclosure?.[1],
      lane: classifyCivicPress(title),
    });
  }
  return out;
}

/**
 * Every recent press release from the City + County, newest first, deduped
 * by canonical URL and capped. Returns [] if both feeds fail (callers hide
 * the surface — a blank "press" header lowers trust).
 */
const FETCH_TIMEOUT_MS = 5_000;

async function loadCivicPressReleases(): Promise<CivicPressResult> {
  const feeds = await Promise.all(
    FEEDS.map(async (f) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        // 15-minute cache: a fresh police release surfaces fast without
        // hammering the .gov server (releases land a few times a day).
        const res = await fetch(f.url, {
          signal: ctrl.signal,
          next: { revalidate: 900 },
          headers: { "user-agent": "Mozilla/5.0 (FrederickRadius/1.0)" },
        });
        if (!res.ok) {
          return {
            items: [] as CivicPressItem[],
            source: f.source,
            available: false,
            detail: `HTTP ${res.status}`,
          };
        }
        return {
          items: parseFeed(await res.text(), f.source, f.short),
          source: f.source,
          available: true,
          detail: "",
        };
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        return {
          items: [] as CivicPressItem[],
          source: f.source,
          available: false,
          detail: timedOut
            ? `timed out after ${FETCH_TIMEOUT_MS}ms`
            : error instanceof Error
              ? error.message
              : String(error),
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const unavailable = feeds
    .filter((feed) => !feed.available)
    .map((feed) => feed.source);
  if (unavailable.length > 0) {
    const detail = feeds
      .filter((feed) => !feed.available)
      .map((feed) => `${feed.source}: ${feed.detail}`)
      .join("; ");
    // One summary per cached refresh. A blocked county newsroom is expected
    // to fail soft; the structured sourceHealth result remains available to
    // operators without emitting a TypeError for every page render.
    console.info(`[civic-press] unavailable this refresh (${detail}; fail-soft)`);
  }

  const seen = new Set<string>();
  const merged: CivicPressItem[] = [];
  for (const item of feeds.flatMap((feed) => feed.items)) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    merged.push(item);
  }
  merged.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return {
    items: merged.slice(0, 40),
    sourceHealth: {
      degraded: unavailable.length > 0,
      unavailable,
    },
  };
}

const loadCivicPressOnce = createSingleFlight<"current", CivicPressResult>();
const getCivicPressReleasesCached = unstable_cache(
  () =>
    loadCivicPressOnce(
      "current",
      loadCivicPressReleases,
    ),
  [
    "civic-press-adapter-v1",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  ],
  { revalidate: 900, tags: ["civic-press"] },
);

/** Health-aware result. A failed source stays cached for the same refresh
 * window, so a refused connection is not retried from every RSC render. */
export function getCivicPressReleasesResult(): Promise<CivicPressResult> {
  if (process.env.NODE_ENV === "test") {
    return loadCivicPressOnce(
      "current",
      loadCivicPressReleases,
    );
  }
  return getCivicPressReleasesCached();
}

/** Compatibility facade for existing user-facing surfaces. */
export async function getCivicPressReleases(): Promise<CivicPressItem[]> {
  return (await getCivicPressReleasesResult()).items;
}

/** Just the police-blotter releases, newest first. */
export function policeReleases(items: CivicPressItem[]): CivicPressItem[] {
  return items.filter((i) => i.lane === "police");
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const URGENT_POLICE_RE =
  /\b(amber alert|silver alert|missing (?:person|man|woman|teen|boy|girl|child|juvenile)|active shooter|shelter in place|evacuat|shoot(?:ing|s)?|stabb|homicide|armed suspect|standoff|hazmat|emergency|fatal crash)\b/i;
// The same urgent words also appear in routine public notices: active-shooter
// drills, shooting-range training, academy classes, and community meetings.
// These contexts fail closed unless the title also carries an incident action
// ("investigating", "arrested", "victim", etc.). A real public directive such
// as "shelter in place" remains eligible even when the title calls it an
// announcement.
const ROUTINE_EXERCISE_RE =
  /\b(shooting range|firearms? range|training|academy|drill|exercise|course|class|workshop|demonstration)\b/i;
const ROUTINE_COMMUNICATION_RE =
  /\b(meeting|open house|announcement|announc(?:e|es|ed|ing)|community event)\b/i;
const INCIDENT_ACTION_RE =
  /\b(investigat(?:e|es|ed|ing|ion)|respond(?:s|ed|ing)?|arrest(?:ed|s)?|charg(?:e|ed|es|ing)|victim|suspect|wounded|injured|killed|dead|fatal|wanted|in custody|seeks? (?:information|help))\b/i;
const PUBLIC_ACTION_RE =
  /\b(amber alert|silver alert|missing (?:person|man|woman|teen|boy|girl|child|juvenile)|shelter in place|evacuat|armed suspect|standoff|hazmat|fatal crash)\b/i;

/**
 * A prominent public-safety strip must be both urgent and fresh. Routine
 * police announcements, community events, and older releases stay in the
 * standing Police section instead of borrowing alert styling.
 */
export function featuredPoliceRelease(
  items: CivicPressItem[],
  now = Date.now(),
  maxAgeHours = 6,
): CivicPressItem | null {
  return policeReleases(items).find((item) => {
    if (!URGENT_POLICE_RE.test(item.title)) return false;
    const incidentAction = INCIDENT_ACTION_RE.test(item.title);
    if (ROUTINE_EXERCISE_RE.test(item.title) && !incidentAction) return false;
    if (
      ROUTINE_COMMUNICATION_RE.test(item.title)
      && !incidentAction
      && !PUBLIC_ACTION_RE.test(item.title)
    ) return false;
    const age = now - +new Date(item.publishedAt);
    return Number.isFinite(age) && age >= 0 && age <= maxAgeHours * HOUR_MS;
  }) ?? null;
}

/**
 * Recent advisory-lane releases (traffic / road closure / boil-water /
 * emergency), newest first. Road work persists for weeks, so the default
 * window is wider than police; each item still shows its post date so the
 * reader judges currency, and links to the source for the real dates.
 */
export function advisoryReleases(items: CivicPressItem[], maxAgeDays = 30): CivicPressItem[] {
  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  return items.filter((i) => i.lane === "advisory" && +new Date(i.publishedAt) >= cutoff);
}
