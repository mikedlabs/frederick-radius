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
 * /pulse breaking strip surfaces the latest `police` release; the lanes are
 * exported so other surfaces can lean on `advisory` later.
 */

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
export async function getCivicPressReleases(): Promise<CivicPressItem[]> {
  const feeds = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        // 15-minute cache: a fresh police release surfaces fast without
        // hammering the .gov server (releases land a few times a day).
        const res = await fetch(f.url, {
          next: { revalidate: 900 },
          headers: { "user-agent": "Mozilla/5.0 (FrederickRadius/1.0)" },
        });
        if (!res.ok) return [];
        return parseFeed(await res.text(), f.source, f.short);
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  const merged: CivicPressItem[] = [];
  for (const item of feeds.flat()) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    merged.push(item);
  }
  merged.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return merged.slice(0, 40);
}

/** Just the police-blotter releases, newest first. */
export function policeReleases(items: CivicPressItem[]): CivicPressItem[] {
  return items.filter((i) => i.lane === "police");
}

const DAY_MS = 86_400_000;

/**
 * The single freshest police release, but only if it's recent enough to
 * earn the prominent "breaking" treatment (default 10 days). Older blotter
 * items still appear in the standing Police section, just not up top.
 */
export function latestPoliceRelease(
  items: CivicPressItem[],
  maxAgeDays = 10,
): CivicPressItem | null {
  const latest = policeReleases(items)[0];
  if (!latest) return null;
  const age = Date.now() - +new Date(latest.publishedAt);
  return age <= maxAgeDays * DAY_MS ? latest : null;
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
