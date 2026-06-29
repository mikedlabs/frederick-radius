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
import { isInsideFrederickCounty } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

const FEED_URL = "https://www.visitfrederick.org/event/rss/";
const FETCH_TIMEOUT_MS = 15_000;
const SOURCE_LABEL = "Visit Frederick";
const USER_AGENT = "FrederickRadius/1.0 (+https://frederickradius.app)";

// Detail-page enrichment (Item 1): each RSS link points at a detail page that
// embeds schema.org Event JSON-LD with the venue, address, and coordinates the
// RSS omits. We fetch those pages with a small concurrency pool and a short
// per-page timeout, and cache each for a day (they are near-static for a given
// event id), so the cold cost is paid once per day app-wide and a warm render
// is ~30 data-cache reads. Any page that fails leaves its event on the town
// centroid (today's behaviour) — enrichment is purely additive.
const DETAIL_TIMEOUT_MS = 4_000;
const DETAIL_CONCURRENCY = 8;
const DETAIL_REVALIDATE_S = 86_400;
// Hard ceiling on the whole enrichment fan-out, independent of the per-page
// timeout × wave math. If detail pages are slow on a cold render, we return the
// un-enriched RSS rows at this point rather than let enrichment gate the events
// assembly. In-flight fetches keep running and still warm the per-page cache
// for the next render, so a slow first paint self-heals.
const DETAIL_ENRICH_BUDGET_MS = 7_000;

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
  rosemont: "rosemont",
  urbana: "urbana",
};

// Category classification, two-stage. Visit Frederick's OWN category tags are
// the most reliable signal (a human curator chose them), so map those first;
// fall back to a conservative title-keyword pass only when no tag matches.
//
// The keyword pass deliberately mirrors the proven iCal classifier's PHILOSOPHY
// (src/lib/ingest/ical.ts CATEGORY_KEYWORDS): first match wins; "pub"/"trivia"
// is a BAR, not a brewery; "tasting"/"wine" is food/drink, not a guessed
// brewery; a bare "workshop" is NOT family (adult craft classes exist); only an
// explicit museum/gallery word maps to arts/museum (a heritage FESTIVAL is
// community, not a museum). Default is "community" — an honest catch-all, never
// a guessed specific. This replaces an earlier single-haystack rule set that
// mislabelled pub trivia, wine tastings, and craft workshops.
const TAG_CATEGORY: Array<[RegExp, string]> = [
  [/live music/, "music"],
  [/minor league baseball|sports & games|^sports/, "sports"],
  [/farmers'? *market/, "market"],
  [/winer|brewer|distiller/, "brewery"],
  [/food truck|foodie|culinary/, "food"],
  [/arts? - visual|visual art|gallery/, "arts"],
  [/arts? - perform|performances?|theat/, "theater"],
  [/history & heritage|civil war|\bhistory\b|heritage|museum/, "museum"],
  [/outdoor|recreation/, "outdoors"],
  [/family friendly|\bfamily\b/, "family"],
];
const TITLE_KEYWORDS: Array<[RegExp, string]> = [
  [/\btrivia\b|\bpub\b|happy hour/i, "bar"],
  [/\bconcert\b|live music|open mic|alive\s*@?\s*five|\bband\b|\bdj\b/i, "music"],
  [/\btheat|\bplay\b|\bstage\b|comedy|\bopera\b/i, "theater"],
  [/farmers?\b.*market|makers?\b.*market/i, "market"],
  [/brewer|winer|distiller|tap(room| takeover)|beer release/i, "brewery"],
  [/\bmuseum\b|\bexhibit\b|\bgallery\b/i, "arts"],
  [/\bkids?\b|children|story time|all ages|\bfamily\b/i, "family"],
  [/\bhike\b|\btrail\b|\bnature\b|\branger\b/i, "outdoors"],
  [/\bkeys\b|baseball|\b5k\b|\brace\b/i, "sports"],
  [/food truck|\bdinner\b|\bbrunch\b|tasting|\bwine\b/i, "food"],
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
  const tagHay = cats.join(" | "); // cats are already lower-cased + trimmed
  for (const [re, slug] of TAG_CATEGORY) if (re.test(tagHay)) return slug;
  for (const [re, slug] of TITLE_KEYWORDS) if (re.test(title)) return slug;
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

/** What a detail page's schema.org Event JSON-LD adds over the RSS row. */
export type VfDetail = {
  venue_name: string;
  address: string;
  /** Precise venue coordinate, only when finite AND inside the county. */
  geom: { lng: number; lat: number } | null;
  description: string;
};

const LD_JSON_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Find the schema.org Event node in a parsed JSON-LD value (handles a bare
 *  object, an array of nodes, or an `@graph` wrapper). */
function asEventNode(parsed: unknown): Record<string, unknown> | null {
  const consider = (v: unknown): Record<string, unknown> | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const t = o["@type"];
    const isEvent =
      t === "Event" ||
      (Array.isArray(t) && t.includes("Event")) ||
      (typeof t === "string" && /(^|\W)Event$/.test(t));
    return isEvent ? o : null;
  };
  if (Array.isArray(parsed)) {
    for (const n of parsed) {
      const hit = consider(n);
      if (hit) return hit;
    }
    return null;
  }
  if (parsed && typeof parsed === "object") {
    const graph = (parsed as Record<string, unknown>)["@graph"];
    if (Array.isArray(graph)) {
      for (const n of graph) {
        const hit = consider(n);
        if (hit) return hit;
      }
    }
    return consider(parsed);
  }
  return null;
}

/**
 * Pure: extract venue/address/geo/description from a Visit Frederick detail
 * page's schema.org Event JSON-LD. Returns null when no usable Event block is
 * found. Never throws (a malformed JSON block is skipped). Exported for unit
 * testing against a captured fixture with no network.
 */
export function parseVisitFrederickDetail(html: string): VfDetail | null {
  if (!html) return null;
  LD_JSON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LD_JSON_RE.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // a non-JSON or HTML-bearing block: skip, never throw
    }
    const ev = asEventNode(parsed);
    if (!ev) continue;
    const loc = (ev.location ?? {}) as Record<string, unknown>;
    const addr = (loc.address ?? {}) as Record<string, unknown>;
    const geoRaw = (loc.geo ?? {}) as Record<string, unknown>;
    const lat = Number(geoRaw.latitude);
    const lng = Number(geoRaw.longitude);
    // Only adopt a coordinate we can vouch for: finite AND inside the county.
    const geom =
      Number.isFinite(lat) && Number.isFinite(lng) && isInsideFrederickCounty(lat, lng)
        ? { lng, lat }
        : null;
    const region = [addr.addressRegion, addr.postalCode]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      .join(" ");
    const address = [addr.streetAddress, addr.addressLocality, region]
      .map((p) => (typeof p === "string" ? p.trim() : p === region ? region : ""))
      .filter(Boolean)
      .join(", ");
    return {
      venue_name: typeof loc.name === "string" ? loc.name.trim() : "",
      address,
      geom,
      description: typeof ev.description === "string" ? ev.description.trim() : "",
    };
  }
  return null;
}

/** Run `fn` over `items` with at most `limit` in flight; preserves order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Fetch one detail page and parse its JSON-LD. Fail-soft → null. Cached a day
 *  per URL (detail pages are near-static for a given event id). */
async function fetchVisitFrederickDetail(url: string): Promise<VfDetail | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DETAIL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: DETAIL_REVALIDATE_S },
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    return parseVisitFrederickDetail(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + normalize the Visit Frederick events RSS, then enrich each row from
 * its detail page (venue, address, precise geo, fuller description). Returns []
 * (never throws into the events page) on any RSS network/parse failure;
 * degrades to the un-enriched RSS rows if enrichment as a whole fails. The RSS
 * is HTTP-cached (revalidate 3600) and each detail page a day, so concurrent
 * /today + /events renders share cache entries.
 */
export async function fetchVisitFrederick(): Promise<LiveEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let base: LiveEvent[];
  try {
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      next: { revalidate: 3600 },
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.error(`[visit-frederick] HTTP ${res.status}`);
      return [];
    }
    base = normalizeVisitFrederickRss(await res.text());
  } catch (err) {
    console.error("[visit-frederick] fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
  if (base.length === 0) return base;

  // Enrich each row from its detail page. Fail-soft PER PAGE (a failed page
  // keeps the centroid row the RSS produced), bounded by an OVERALL wall-time
  // budget (return un-enriched rows if it trips), and wrapped so any thrown
  // error returns the un-enriched feed — the worst case equals prior behaviour.
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const enrich = mapWithConcurrency(base, DETAIL_CONCURRENCY, async (e) => {
      const d = e.url ? await fetchVisitFrederickDetail(e.url) : null;
      if (!d) return e;
      const description = d.description.length > e.description.length ? d.description : e.description;
      return {
        ...e,
        venue_name: d.venue_name || e.venue_name,
        address: d.address || e.address,
        description,
        // Precise coord -> mark "geocoded" so the card shows a real distance.
        // No coord -> stay on the town centroid (no placement -> "area").
        ...(d.geom ? { geom: d.geom, placement: "geocoded" as const } : {}),
      };
    });
    const budget = new Promise<LiveEvent[]>((resolve) => {
      budgetTimer = setTimeout(() => resolve(base), DETAIL_ENRICH_BUDGET_MS);
    });
    return await Promise.race([enrich, budget]);
  } catch (err) {
    console.error("[visit-frederick] enrichment failed, using un-enriched feed:", err);
    return base;
  } finally {
    clearTimeout(budgetTimer);
  }
}
