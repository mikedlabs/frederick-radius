/**
 * Visit Frederick (visitfrederick.org) -> live events from the destination
 * marketing organization's public events RSS feed.
 *
 * Visit Frederick runs on the Simpleview CMS. Its on-page events calendar is
 * a client-rendered widget backed by an authenticated REST API, but the same
 * data is published keyless at the standard Simpleview events RSS endpoint:
 *   GET https://www.visitfrederick.org/event/rss/
 * So discovery is "read the public feed", no token, no scraping of rendered
 * HTML. The feed carries ~30 active/upcoming listings: title, link (with a
 * stable numeric id), region + theme categories, an image, a date RANGE, and
 * a blurb.
 *
 * Honest modelling of an imperfect feed:
 *   - DATES, NOT TIMES. The feed gives each listing a calendar date range
 *     (MM/DD/YYYY to MM/DD/YYYY) but no reliable start time (times appear, if
 *     at all, only as prose inside the blurb). So we anchor each event to noon
 *     Eastern on its start day and end-of-day Eastern on its last day rather
 *     than invent a clock time. A months-long exhibition still surfaces because
 *     the pipeline keeps anything whose ends_at is in the future
 *     (isUpcomingEvent), and the per-event implausible-time guard never fires
 *     on a noon anchor.
 *   - AREA GEOCODE. The feed has no per-event coordinates, only a region tag
 *     ("Downtown Frederick"). We place each event on that town's centroid, so
 *     eventGeoConfidence resolves to "area": it lists, it never claims a
 *     precise distance (the same contract every other live feed honours).
 *   - DEDUPE IS UPSTREAM. Visit Frederick re-lists events that already arrive
 *     via the county iCal, Ticketmaster (Frederick Keys), etc. We do not dedupe
 *     here; the unified assembly's content matcher + clean-slug map collapse the
 *     overlap (same title + same day -> one card).
 *
 * Confidence is `partner` (provenance EVENT_SOURCE_REGISTRY["visit-frederick"]):
 * a curated destination-marketing feed, county-official adjacent. Fully
 * fail-soft: any network or parse failure degrades to [], never throws into the
 * events page. The pure parser is exported for unit testing against a captured
 * feed fixture, with no network.
 */
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { easternWallToUtcISO } from "@/lib/tz";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

const FEED_URL = "https://www.visitfrederick.org/event/rss/";
const FETCH_TIMEOUT_MS = 15_000;
const SOURCE_LABEL = "Visit Frederick";

// Visit Frederick region tag (lower-cased) -> our municipality slug. The feed
// tags each listing with a region; map the ones that name a town we model,
// default to the county seat for everything else (county-wide / unmapped).
const REGION_TO_MUNICIPALITY: Record<string, string> = {
  "downtown frederick": "frederick",
  frederick: "frederick",
  brunswick: "brunswick",
  thurmont: "thurmont",
  middletown: "middletown",
  walkersville: "walkersville",
  emmitsburg: "emmitsburg",
  "new market": "new-market",
  "mount airy": "mount-airy",
  myersville: "myersville",
  woodsboro: "woodsboro",
  burkittsville: "burkittsville",
  urbana: "urbana",
};

// Theme text (category tags + title) -> our event category slug. Conservative,
// first match wins; anything unmatched falls back to "community" (the public
// default the classifier and the other live adapters use).
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/winer|vineyard/i, "winery"],
  [/brewer|distiller|\bpubs?\b|tasting|\bbeer\b/i, "brewery"],
  [/farmers?\s*market|\bmarket\b/i, "market"],
  [/theat|performing|opera|\bdance\b/i, "theater"],
  [/\bmusic\b|concert|alive\s*@?\s*five|open\s*mic|band\b/i, "music"],
  [/museum|history|heritage|historic/i, "museum"],
  [/gallery|\bart\b|arts\b|exhibit|visual/i, "arts"],
  [/family|\bkids?\b|children|workshop/i, "family"],
  [/yoga|wellness|fitness|exercise/i, "wellness"],
  [/sport|\bkeys\b|\bgame\b|\brace\b|\b5k\b|\brun\b/i, "sports"],
  [/outdoor|\bhike\b|\btrail\b|\bpark\b|nature|garden/i, "outdoors"],
  [/food|culin|dining|restaurant|\bcurds?\b|\bbrunch\b/i, "food"],
  [/\bshop\b|vendor|\bsale\b/i, "shopping"],
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function firstMatch(block: string, re: RegExp): string | undefined {
  return re.exec(block)?.[1];
}

/** All category tag values in one item block, decoded + trimmed + lower-cased. */
function categoriesOf(block: string): string[] {
  const out: string[] = [];
  const re = /<category>([\s\S]*?)<\/category>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(decodeEntities(m[1]).trim().toLowerCase());
  return out;
}

function pickMunicipality(cats: string[]): string {
  for (const c of cats) {
    const hit = REGION_TO_MUNICIPALITY[c];
    if (hit) return hit;
  }
  return "frederick";
}

function pickCategory(cats: string[], title: string): string {
  const hay = `${cats.join(" ")} ${title}`;
  for (const [re, slug] of CATEGORY_RULES) if (re.test(hay)) return slug;
  return "community";
}

/** [year, month, day] from an MM/DD/YYYY string. */
function ymd(date: string): [number, number, number] | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!m) return null;
  return [Number(m[3]), Number(m[1]), Number(m[2])];
}

/**
 * Pure: normalize the Visit Frederick events RSS into LiveEvent[]. Exported so
 * a unit test can run it against a captured feed fixture with no network.
 * `now` stamps last_verified_at (injectable for deterministic tests).
 */
export function normalizeVisitFrederickRss(xml: string, now: Date = new Date()): LiveEvent[] {
  if (!xml || !xml.includes("<item")) return [];
  const out: LiveEvent[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(xml))) {
    const block = im[1];
    const rawTitle = firstMatch(block, /<title>([\s\S]*?)<\/title>/);
    const link = firstMatch(block, /<link>([\s\S]*?)<\/link>/)?.trim();
    const descRaw = firstMatch(block, /<description>([\s\S]*?)<\/description>/) ?? "";
    if (!rawTitle || !link) continue;
    const title = decodeEntities(rawTitle).trim();
    if (!title) continue;

    // Dates live in the scaffold BEFORE the <p> blurb (the blurb can carry its
    // own MM/DD or times we must not mistake for the event's range). Scan only
    // the head; first date = start, last = end (single-day items repeat it).
    const head = descRaw.split(/<p[\s>]/i)[0] ?? descRaw;
    const dates = head.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
    const start = ymd(dates[0] ?? "");
    const end = ymd(dates[dates.length - 1] ?? "") ?? start;
    if (!start || !end) continue; // no honest time anchor -> skip

    const starts_at = easternWallToUtcISO(start[0], start[1], start[2], 12, 0, 0);
    const ends_at = easternWallToUtcISO(end[0], end[1], end[2], 23, 59, 59);

    // Blurb: inner text of the first <p>, tags stripped, entities decoded.
    const blurb = firstMatch(descRaw, /<p[^>]*>([\s\S]*?)<\/p>/i) ?? "";
    const description = decodeEntities(blurb.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

    const cats = categoriesOf(block);
    const municipality = pickMunicipality(cats);
    const centroid = MUNICIPALITY_BY_SLUG[municipality]?.centroid;
    if (!centroid) continue; // unmapped slug: skip rather than guess a coord
    const idNum = /\/(\d+)\/?$/.exec(link)?.[1] ?? link;

    out.push({
      id: `vf-${idNum}`,
      title,
      description,
      starts_at,
      ends_at,
      // No clean venue field in the feed; the title often carries "… at <venue>"
      // which normalizeTitle handles downstream. Leave blank rather than fabricate.
      venue_name: "",
      address: "",
      // Town centroid -> eventGeoConfidence resolves to "area": lists, never
      // claims a precise distance.
      geom: { lng: centroid.lng, lat: centroid.lat },
      municipality,
      category: pickCategory(cats, title),
      organizer: SOURCE_LABEL,
      source: "visit-frederick",
      source_label: SOURCE_LABEL,
      url: link,
      is_free: cats.includes("free"),
      status: "scheduled" as const,
      last_verified_at: now.toISOString(),
    });
  }
  return out;
}

/**
 * Fetch + normalize the Visit Frederick events RSS. Returns [] (never throws
 * into the events page) on any network, status, or parse failure. HTTP-cached
 * upstream (next.revalidate 3600) so concurrent /today + /events renders share
 * one fetch.
 */
export async function fetchVisitFrederick(): Promise<LiveEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      next: { revalidate: 3600 },
      headers: { "User-Agent": "FrederickRadius/1.0 (+https://frederickradius.app)" },
    });
    if (!res.ok) {
      console.error(`[visit-frederick] HTTP ${res.status}`);
      return [];
    }
    return normalizeVisitFrederickRss(await res.text());
  } catch (err) {
    console.error("[visit-frederick] fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
