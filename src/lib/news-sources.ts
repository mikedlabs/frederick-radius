/**
 * News source metadata — what makes the newsroom feel like a newsroom.
 *
 * Each source gets three signals:
 *   • a "lane" — Government / Press / Community — so the desk can
 *     group stories by *kind* instead of dumping them all into one list.
 *   • a brand color + 2-letter monogram, rendered as a small pip in front
 *     of every headline. The reader's eye learns the marks fast and the
 *     desk stops reading as a feed and starts reading as a newsroom.
 *   • a media type (civic / tv / radio / print / wire / memorial / web)
 *     so the lane header can say "4 TV stations, 2 radio stations…"
 *     when we want to. Currently used only via the inferred lane, but
 *     left in the shape so future surfaces can lean on it.
 *
 * Sources we don't know about get a generic Press treatment — labeled
 * with the source's own initials, no fabricated color. The fallback is
 * the floor, not the ceiling: when a new source shows up, add it here.
 */
export type NewsLane = "gov" | "press" | "community";
export type NewsMediaType =
  | "civic"
  | "tv"
  | "radio"
  | "print"
  | "wire"
  | "memorial"
  | "web";

export type SourceMeta = {
  lane: NewsLane;
  mediaType: NewsMediaType;
  /** Color used for the brand pip + accent stripe. Pulled from each
   *  outlet's own brand where possible; tasteful muted when unknown. */
  brandColor: string;
  /** Short outlet name we render under the headline. */
  display: string;
  /** 2-letter monogram inside the brand pip. */
  monogram: string;
};

/**
 * Known sources, keyed by lowercased fragment of the raw RSS source string.
 * The matcher walks this map in declaration order and picks the first
 * fragment that appears in the lowercased input — so put more specific
 * entries first (e.g. "the city of frederick" before plain ".gov").
 */
const KNOWN: Array<[string, SourceMeta]> = [
  // ── Government / civic — civic blue family ────────────────────────
  [
    "city of frederick",
    { lane: "gov", mediaType: "civic", brandColor: "#1F4E79", display: "City of Frederick", monogram: "CF" },
  ],
  [
    "frederick county government",
    { lane: "gov", mediaType: "civic", brandColor: "#2A5D8F", display: "Frederick County Gov.", monogram: "FC" },
  ],
  [
    "fcps",
    { lane: "gov", mediaType: "civic", brandColor: "#1B6045", display: "FCPS", monogram: "FP" },
  ],
  [
    "fcpl",
    { lane: "gov", mediaType: "civic", brandColor: "#5A3F8A", display: "FCPL", monogram: "PL" },
  ],
  [
    "maryland state police",
    { lane: "gov", mediaType: "civic", brandColor: "#2F3E4D", display: "Maryland State Police", monogram: "MS" },
  ],
  [
    "sheriff",
    { lane: "gov", mediaType: "civic", brandColor: "#2F3E4D", display: "Sheriff's Office", monogram: "SO" },
  ],

  // ── Print / news outlets ──────────────────────────────────────────
  [
    "frederick news-post",
    { lane: "press", mediaType: "print", brandColor: "#C4451C", display: "Frederick News-Post", monogram: "FN" },
  ],
  [
    "fredericknewspost",
    { lane: "press", mediaType: "print", brandColor: "#C4451C", display: "Frederick News-Post", monogram: "FN" },
  ],
  [
    "baltimore sun",
    { lane: "press", mediaType: "print", brandColor: "#003E7E", display: "Baltimore Sun", monogram: "BS" },
  ],
  [
    "washington post",
    { lane: "press", mediaType: "print", brandColor: "#222222", display: "Washington Post", monogram: "WP" },
  ],
  [
    "bethesda magazine",
    { lane: "press", mediaType: "print", brandColor: "#3B5F47", display: "Bethesda Magazine", monogram: "BM" },
  ],
  [
    "bethesda beat",
    { lane: "press", mediaType: "print", brandColor: "#3B5F47", display: "Bethesda Beat", monogram: "BB" },
  ],
  [
    "patch",
    { lane: "press", mediaType: "print", brandColor: "#65A30D", display: "Patch", monogram: "PT" },
  ],

  // ── TV — each station's brand color is approximated by its network ─
  [
    "wbal",
    { lane: "press", mediaType: "tv", brandColor: "#D8252A", display: "WBAL-TV", monogram: "BL" },
  ],
  [
    "wbff",
    { lane: "press", mediaType: "tv", brandColor: "#0A2A66", display: "WBFF Fox 45", monogram: "BF" },
  ],
  [
    "wmar",
    { lane: "press", mediaType: "tv", brandColor: "#1A6CB4", display: "WMAR ABC 2", monogram: "MR" },
  ],
  [
    "fox 5 dc",
    { lane: "press", mediaType: "tv", brandColor: "#1B2A6B", display: "FOX 5 DC", monogram: "F5" },
  ],
  [
    "wusa",
    { lane: "press", mediaType: "tv", brandColor: "#C8202F", display: "WUSA 9", monogram: "U9", },
  ],
  [
    "dc news now",
    { lane: "press", mediaType: "tv", brandColor: "#1F5499", display: "DC News Now", monogram: "DC" },
  ],
  [
    "wtop",
    { lane: "press", mediaType: "tv", brandColor: "#0067A6", display: "WTOP", monogram: "TO" },
  ],
  [
    "nbc4",
    { lane: "press", mediaType: "tv", brandColor: "#6E55DC", display: "NBC4 Washington", monogram: "N4" },
  ],

  // ── Radio ─────────────────────────────────────────────────────────
  [
    "wfmd",
    { lane: "press", mediaType: "radio", brandColor: "#B58A2C", display: "930 WFMD", monogram: "FM" },
  ],
  [
    "wypr",
    { lane: "press", mediaType: "radio", brandColor: "#1A4A2A", display: "WYPR", monogram: "YP" },
  ],

  // ── Wire / aggregators ────────────────────────────────────────────
  [
    "pr newswire",
    { lane: "press", mediaType: "wire", brandColor: "#4A6A7C", display: "PR Newswire", monogram: "PR" },
  ],
  [
    "ap news",
    { lane: "press", mediaType: "wire", brandColor: "#222222", display: "Associated Press", monogram: "AP" },
  ],
  [
    "yahoo",
    { lane: "press", mediaType: "wire", brandColor: "#5F00C4", display: "Yahoo News", monogram: "YH" },
  ],

  // ── Community / memorials ─────────────────────────────────────────
  [
    "legacy",
    { lane: "community", mediaType: "memorial", brandColor: "#7A746B", display: "Legacy obituary", monogram: "LG" },
  ],
  [
    "obituary",
    { lane: "community", mediaType: "memorial", brandColor: "#7A746B", display: "Obituary", monogram: "OB" },
  ],
  [
    "ourcommunitynow",
    { lane: "community", mediaType: "web", brandColor: "#7A7458", display: "OurCommunityNow", monogram: "CO" },
  ],
  [
    "fcc.edu",
    { lane: "community", mediaType: "civic", brandColor: "#3F5A6B", display: "Frederick CC", monogram: "FC" },
  ],
];

const PRESS_FALLBACK_COLOR = "#6F6A63";
const GOV_FALLBACK_COLOR = "#2A5D8F";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "for", "in", "on", "at", "to", "by",
  "with", "from", "tv", "news", "today", "now", "magazine", "free", "talk",
  "channel", "media", "post", "online",
]);

function monogramFor(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));

  if (tokens.length === 0) return "??";
  if (tokens.length === 1) {
    const t = tokens[0];
    return (t[0] + (t[1] ?? t[0])).toUpperCase();
  }
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

/**
 * Resolve a raw RSS source string to display metadata.
 * Always returns something — known sources get their brand treatment,
 * unknowns fall through to a tasteful neutral Press chip with the
 * source's own derived initials so nothing renders as "??".
 */
export function sourceMeta(raw: string): SourceMeta {
  const s = (raw || "").toLowerCase();
  for (const [needle, meta] of KNOWN) {
    if (s.includes(needle)) return meta;
  }
  // Any .gov fallback → government lane, no specific brand mark.
  if (/\.gov\b/.test(s)) {
    return {
      lane: "gov",
      mediaType: "civic",
      brandColor: GOV_FALLBACK_COLOR,
      display: raw,
      monogram: monogramFor(raw),
    };
  }
  // Everything else: neutral Press chip with derived initials.
  return {
    lane: "press",
    mediaType: "web",
    brandColor: PRESS_FALLBACK_COLOR,
    display: raw,
    monogram: monogramFor(raw),
  };
}

export const LANE_META: Record<
  NewsLane,
  { label: string; tagline: string; color: string }
> = {
  gov: {
    label: "Government",
    tagline: "Official county, city, school, and law-enforcement releases.",
    color: "#2A5D8F",
  },
  press: {
    label: "Press & Broadcast",
    tagline: "Newsrooms, TV stations, radio, and wires covering Frederick County.",
    color: "#C4451C",
  },
  community: {
    label: "Community",
    tagline: "Memorials, neighborhood notices, civic posts.",
    color: "#7A746B",
  },
};
