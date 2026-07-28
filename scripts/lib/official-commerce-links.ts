/**
 * Deterministic commerce-link discovery for official business websites.
 *
 * The model may summarize facts from page text, but it must never reconstruct
 * a URL. This module keeps the exact href from a real anchor, resolves relative
 * links against the fetched page, rejects unsafe schemes, and classifies only
 * strong menu/order/reservation/catering/gift-card signals.
 */

export type PageAnchor = {
  url: string;
  text: string;
};

export type ExtractedBusinessCommerceLink = {
  type: "menu" | "order" | "reservation" | "catering" | "gift_card";
  url: string;
  /** Exact, cleaned anchor text for audit/debugging; not Radius-authored copy. */
  anchor_text?: string;
  /** The official page on which this anchor was found. */
  source_url: string;
};

const ENTITY_NAMES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  const decodePoint = (point: number, fallback: string): string =>
    Number.isInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : fallback;
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        const point = Number.parseInt(entity.slice(2), 16);
        return decodePoint(point, match);
      }
      if (entity.startsWith("#")) {
        const point = Number.parseInt(entity.slice(1), 10);
        return decodePoint(point, match);
      }
      return ENTITY_NAMES[entity.toLowerCase()] ?? match;
    },
  );
}

function cleanAnchorText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Resolve and validate a real anchor href. Hash-only and unsafe links drop. */
export function normalizePageAnchor(
  href: string,
  text: string,
  baseUrl: string,
): PageAnchor | null {
  const cleanedHref = decodeHtmlEntities(href).trim();
  if (!cleanedHref || cleanedHref.startsWith("#")) return null;

  let url: URL;
  try {
    url = new URL(cleanedHref, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  url.hash = "";

  return {
    url: url.toString(),
    text: cleanAnchorText(text),
  };
}

/**
 * Extract anchors from static HTML without adding a DOM dependency. The fetch
 * layer separately reads rendered anchors through Playwright for JS sites.
 */
export function extractPageAnchors(
  html: string,
  baseUrl: string,
  maxLinks = 500,
): PageAnchor[] {
  const anchors: PageAnchor[] = [];
  const seen = new Set<string>();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const attribute = (attrs: string, name: string): string => {
    const match = attrs.match(
      new RegExp(
        `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
        "i",
      ),
    );
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  };

  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && anchors.length < maxLinks) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const bodyText = cleanAnchorText(body);
    const anchor = normalizePageAnchor(
      attribute(attrs, "href"),
      bodyText ||
        attribute(attrs, "aria-label") ||
        attribute(attrs, "title"),
      baseUrl,
    );
    if (!anchor) continue;
    const key = `${anchor.url}\n${anchor.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push(anchor);
  }
  return anchors;
}

const SEARCH_PATHS = [
  ["opentable.com", /^\/s(?:\/|$)/],
  ["doordash.com", /^\/search(?:\/|$)/],
  ["ubereats.com", /^\/search(?:\/|$)/],
  ["grubhub.com", /^\/search(?:\/|$)/],
] as const;

function isProviderSearch(url: URL): boolean {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  return SEARCH_PATHS.some(
    ([domain, pattern]) =>
      (host === domain || host.endsWith(`.${domain}`)) && pattern.test(path),
  );
}

const COMMERCE_PROVIDER_DOMAINS = [
  "opentable.com",
  "resy.com",
  "exploretock.com",
  "toasttab.com",
  "chownow.com",
  "olo.com",
  "clover.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "squareup.com",
  "square.site",
] as const;

function isCommerceProviderHost(host: string): boolean {
  return COMMERCE_PROVIDER_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

type Candidate = ExtractedBusinessCommerceLink & {
  score: number;
  index: number;
};

function classifyAnchor(
  anchor: PageAnchor,
  sourceUrl: string,
  index: number,
): Candidate | null {
  let url: URL;
  try {
    url = new URL(anchor.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (isProviderSearch(url)) return null;

  const text = anchor.text.toLowerCase();
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let path = url.pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the literal URL path. A malformed percent escape must not crash a
    // whole ingestion batch, and the classifier can still use anchor text.
  }
  const signal = `${text} ${host} ${path.replace(/[-_/]+/g, " ")}`;
  const fromText = (pattern: RegExp) => pattern.test(text);
  const fromUrl = (pattern: RegExp) => pattern.test(`${host} ${path}`);

  let type: ExtractedBusinessCommerceLink["type"] | null = null;
  let score = 0;

  // A provider homepage is not a business capability even when the official
  // site labels it "Order" or "Reservations." Require a business-specific
  // destination instead of creating another disguised provider search.
  if (isCommerceProviderHost(host) && (!path || path === "/")) return null;

  if (
    fromText(/\b(?:e[- ]?gift|gift cards?|gift certificates?)\b/) ||
    fromUrl(/(?:^|[-_/])(?:e-?gift|gift-?cards?|gift-?certificates?)(?:[-_/]|$)/)
  ) {
    type = "gift_card";
    score = fromText(/\bgift\b/) ? 120 : 75;
  } else if (
    fromText(/\bcater(?:ing|ed|er)?\b/) ||
    fromUrl(/(?:^|[-_/])cater(?:ing)?(?:[-_/]|$)/)
  ) {
    type = "catering";
    score = fromText(/\bcater/) ? 115 : 70;
  } else if (
    fromText(/\b(?:reservations?|reserve(?: a table)?|book a table|table booking)\b/) ||
    fromUrl(/(?:^|[-_/])(?:reservations?|reserve)(?:[-_/]|$)/)
  ) {
    type = "reservation";
    score = fromText(/\b(?:reserv|book a table|table booking)/) ? 110 : 72;
  } else if (
    fromText(
      /\b(?:order online|online ordering|start (?:an )?order|order (?:now|pickup|delivery)|take[- ]?out|pickup (?:and|or) delivery)\b/,
    ) ||
    fromUrl(
      /(?:^|[-_/])(?:order(?:ing|-online)?|online-ordering|takeout|take-out|pickup)(?:[-_/]|$)/,
    )
  ) {
    type = "order";
    score = fromText(/\border|take[- ]?out|pickup/) ? 105 : 68;
  } else if (
    fromText(/\b(?:view |our |food |drink |lunch |dinner |brunch )?menus?\b/) ||
    fromUrl(/(?:^|[-_/])menus?(?:[-_/]|$)/)
  ) {
    type = "menu";
    score = fromText(/\bmenus?\b/) ? 100 : 65;
  }

  if (!type || !signal.trim()) return null;
  if (url.protocol === "https:") score += 2;

  return {
    type,
    url: url.toString(),
    ...(anchor.text ? { anchor_text: anchor.text } : {}),
    source_url: sourceUrl,
    score,
    index,
  };
}

/**
 * Classify anchors and return every distinct real commerce URL. Highest-signal
 * links come first within each type so the loader can expose one calm primary
 * action while the raw record still preserves the full set.
 */
export function classifyOfficialCommerceLinks(
  anchors: PageAnchor[],
  sourceUrl: string,
): ExtractedBusinessCommerceLink[] {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return [];
  }
  if (source.protocol !== "https:" && source.protocol !== "http:") return [];

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  anchors.forEach((anchor, index) => {
    const candidate = classifyAnchor(anchor, source.toString(), index);
    if (!candidate) return;
    const key = `${candidate.type}::${candidate.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  });

  const typeOrder = Array.from(
    new Set(
      [...candidates]
        .sort((a, b) => a.index - b.index)
        .map(({ type }) => type),
    ),
  );
  return typeOrder.flatMap((type) =>
    candidates
      .filter((candidate) => candidate.type === type)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((candidate) => ({
        type: candidate.type,
        url: candidate.url,
        ...(candidate.anchor_text
          ? { anchor_text: candidate.anchor_text }
          : {}),
        source_url: candidate.source_url,
      })),
  );
}
