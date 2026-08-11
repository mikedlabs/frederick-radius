/**
 * Deterministic commerce-link discovery for official business websites.
 *
 * The model may summarize facts from page text, but it must never reconstruct
 * a URL. This module keeps the exact href from a real anchor, resolves relative
 * links against the fetched page, rejects unsafe schemes, and classifies only
 * strong menu/order/reservation/catering/gift-card signals.
 */
import { dedupeCommerceDestinations } from "@/lib/commerce/canonical";
import { isKnownThirdPartyBusinessSource } from "./business-info-source-policy";

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
  "sevenrooms.com",
  "tableagent.com",
  "toasttab.com",
  "chownow.com",
  "olo.com",
  "clover.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "squareup.com",
  "square.site",
  "order.online",
  "spoton.com",
  "menufy.com",
  "sliceapp.com",
  "ezcater.com",
] as const;

function isCommerceProviderHost(host: string): boolean {
  return COMMERCE_PROVIDER_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

const PROVIDER_ACCOUNT_PATH_SEGMENTS = new Set([
  "account",
  "accounts",
  "admin",
  "dashboard",
  "login",
  "manage",
  "management",
  "my",
  "profile",
]);

/** Provider account and management pages describe the signed-in user, not a
 * business. They can carry action-looking words such as "Reservations," so
 * reject them by URL structure before anchor text is considered. */
function isProviderAccountOrManagementUrl(url: URL): boolean {
  if (!isCommerceProviderHost(normalizedHost(url.hostname))) return false;
  const firstSegment = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find(Boolean);
  return Boolean(
    firstSegment && PROVIDER_ACCOUNT_PATH_SEGMENTS.has(firstSegment),
  );
}

/**
 * A provider may be the stored evidence page for a previously vetted action,
 * but only when the URL identifies one business. Generic provider home,
 * search, account, and reservation-management pages are not place evidence.
 */
function commerceProviderEntityKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = normalizedHost(url.hostname);
  if (
    !isCommerceProviderHost(host) ||
    isProviderSearch(url) ||
    isProviderAccountOrManagementUrl(url)
  ) {
    return null;
  }

  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (hostMatches(host, "opentable.com")) {
    const restaurantIndex = segments.indexOf("r");
    const slug = restaurantIndex >= 0 ? segments[restaurantIndex + 1] : null;
    if (slug) return `opentable:${slug}`;
    const restref = url.searchParams.get("restref") ?? url.searchParams.get("rid");
    return restref?.trim()
      ? `opentable:${restref.trim().toLowerCase()}`
      : null;
  }

  if (hostMatches(host, "resy.com")) {
    const venueIndex = segments.indexOf("venues");
    const slug = venueIndex >= 0 ? segments[venueIndex + 1] : null;
    return slug ? `resy:${slug}` : null;
  }

  if (hostMatches(host, "exploretock.com")) {
    const slug = segments[0];
    return slug && !["about", "blog", "city", "search", "team"].includes(slug)
      ? `tock:${slug}`
      : null;
  }

  if (hostMatches(host, "sevenrooms.com")) {
    const venueIndex = segments.findIndex((segment) =>
      ["reservations", "venues"].includes(segment),
    );
    const slug = venueIndex >= 0 ? segments[venueIndex + 1] : null;
    const queryVenue = url.searchParams.get("venue") ?? url.searchParams.get("venues");
    return slug
      ? `sevenrooms:${slug}`
      : queryVenue?.trim()
        ? `sevenrooms:${queryVenue.trim().toLowerCase()}`
        : null;
  }

  if (hostMatches(host, "tableagent.com")) {
    const entityIndex = segments.findIndex((segment) =>
      ["restaurant", "restaurants", "venue", "venues"].includes(segment),
    );
    const slug = entityIndex >= 0 ? segments[entityIndex + 1] : null;
    return slug ? `tableagent:${slug}` : null;
  }

  if (hostMatches(host, "toasttab.com")) {
    if (host.startsWith("tables.")) {
      const restaurantIndex = segments.indexOf("restaurants");
      const restaurantId =
        restaurantIndex >= 0 ? segments[restaurantIndex + 1] : null;
      return restaurantId ? `toast-tables:${restaurantId}` : null;
    }
    const structuralPrefix = ["online", "order", "catering"];
    let slug: string | undefined;
    if (segments[0] === "local" && segments[1] === "order") {
      slug = segments[2];
    } else if (structuralPrefix.includes(segments[0] ?? "")) {
      slug = segments[1];
    } else if (
      ![
        "account",
        "giftcards",
        "login",
        "restaurants",
        "search",
      ].includes(segments[0] ?? "")
    ) {
      slug = segments[0];
    }
    return slug ? `toast:${slug}` : null;
  }

  if (hostMatches(host, "chownow.com")) {
    const orderIndex = segments.indexOf("order");
    const merchantId = orderIndex >= 0 ? segments[orderIndex + 1] : null;
    const locationIndex = segments.indexOf("locations");
    const locationId = locationIndex >= 0 ? segments[locationIndex + 1] : null;
    return merchantId
      ? `chownow:${merchantId}${locationId ? `:${locationId}` : ""}`
      : null;
  }

  if (hostMatches(host, "olo.com")) {
    const tenant = host.endsWith(".olo.com")
      ? host.slice(0, -".olo.com".length).split(".").pop()
      : null;
    if (!tenant || ["app", "order", "www"].includes(tenant)) return null;
    const menuIndex = segments.indexOf("menu");
    const store = menuIndex >= 0 ? segments[menuIndex + 1] : null;
    return store ? `olo:${tenant}:${store}` : null;
  }

  if (hostMatches(host, "clover.com")) {
    const orderingIndex = segments.indexOf("online-ordering");
    const slug = orderingIndex >= 0 ? segments[orderingIndex + 1] : null;
    return slug ? `clover:${slug}` : null;
  }

  if (hostMatches(host, "doordash.com")) {
    const storeIndex = segments.indexOf("store");
    const id = storeIndex >= 0 ? segments[storeIndex + 2] : null;
    return id ? `doordash:${id}` : null;
  }

  if (hostMatches(host, "ubereats.com")) {
    const storeIndex = segments.indexOf("store");
    const id = storeIndex >= 0 ? segments[storeIndex + 2] : null;
    return id ? `ubereats:${id}` : null;
  }

  if (hostMatches(host, "grubhub.com")) {
    const restaurantIndex = segments.indexOf("restaurant");
    const id = restaurantIndex >= 0 ? segments[restaurantIndex + 2] : null;
    return id ? `grubhub:${id}` : null;
  }

  if (hostMatches(host, "squareup.com")) {
    const entityIndex = segments.findIndex((segment) =>
      ["gift", "store"].includes(segment),
    );
    const id = entityIndex >= 0 ? segments[entityIndex + 1] : null;
    return id ? `square:${segments[entityIndex]}:${id}` : null;
  }

  if (hostMatches(host, "square.site")) {
    const tenant = host.endsWith(".square.site")
      ? host.slice(0, -".square.site".length).split(".").pop()
      : null;
    return tenant && !["app", "www"].includes(tenant)
      ? `square-site:${tenant}`
      : null;
  }

  if (hostMatches(host, "order.online")) {
    const businessIndex = segments.indexOf("business");
    const slug = businessIndex >= 0 ? segments[businessIndex + 1] : null;
    return slug ? `order-online:${slug}` : null;
  }

  if (hostMatches(host, "spoton.com")) {
    const tenant = host.endsWith(".spoton.com")
      ? host.slice(0, -".spoton.com".length).split(".").pop()
      : null;
    const slug = segments[0];
    if (tenant && !["app", "order", "www"].includes(tenant)) {
      return `spoton:${tenant}`;
    }
    return tenant === "order" && slug?.startsWith("so-")
      ? `spoton:${slug}`
      : null;
  }

  if (hostMatches(host, "menufy.com")) {
    const tenant = host.endsWith(".menufy.com")
      ? host.slice(0, -".menufy.com".length).split(".").pop()
      : null;
    return tenant && !["app", "www"].includes(tenant)
      ? `menufy:${tenant}`
      : null;
  }

  if (hostMatches(host, "sliceapp.com")) {
    const menuIndex = segments.lastIndexOf("menu");
    const restaurantIndex = segments.indexOf("restaurants");
    const slug =
      menuIndex > 0
        ? segments[menuIndex - 1]
        : restaurantIndex >= 0
          ? segments[restaurantIndex + 1]
          : null;
    return slug ? `slice:${slug}` : null;
  }

  if (hostMatches(host, "ezcater.com")) {
    const cateringIndex = segments.indexOf("catering");
    const slug =
      cateringIndex >= 0 && segments.length >= cateringIndex + 3
        ? segments[segments.length - 1]
        : null;
    return slug ? `ezcater:${slug}` : null;
  }

  return null;
}

const BLOCKED_EXTERNAL_DESTINATION_DOMAINS = [
  "yelp.com",
  "tripadvisor.com",
  "restaurantguru.com",
  "allmenus.com",
  "menupix.com",
  "sirved.com",
  "happycow.net",
  "findmeglutenfree.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "google.com",
] as const;

const TRUSTED_MENU_ASSET_DOMAINS = [
  "static1.squarespace.com",
  "static.wixstatic.com",
  "filesusr.com",
  "cdn.prod.website-files.com",
] as const;

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isSameSiteFamily(left: string, right: string): boolean {
  const a = normalizedHost(left);
  const b = normalizedHost(right);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * An official page may link to its own site, a business-specific commerce
 * provider, or a narrowly allowlisted site-builder asset host for a menu PDF.
 * It may not turn an unrelated directory/aggregator URL into a Radius action
 * merely because the anchor text says "menu."
 */
export function isSafeOfficialCommerceDestination(
  sourceUrl: string,
  destinationUrl: string,
  type: ExtractedBusinessCommerceLink["type"],
): boolean {
  let source: URL;
  let destination: URL;
  try {
    source = new URL(sourceUrl);
    destination = new URL(destinationUrl);
  } catch {
    return false;
  }
  if (
    !["http:", "https:"].includes(source.protocol) ||
    !["http:", "https:"].includes(destination.protocol) ||
    !source.hostname ||
    !destination.hostname ||
    destination.username ||
    destination.password
  ) {
    return false;
  }

  const sourceHost = normalizedHost(source.hostname);
  const destinationHost = normalizedHost(destination.hostname);
  if (
    BLOCKED_EXTERNAL_DESTINATION_DOMAINS.some((domain) =>
      hostMatches(destinationHost, domain),
    )
  ) {
    return false;
  }
  if (isCommerceProviderHost(destinationHost)) {
    // Redirect validation is stricter than a host allowlist. A provider-wide
    // directory or search result is not a business action, even when a stale
    // restaurant URL redirected there successfully.
    return commerceProviderEntityKey(destination.toString()) !== null;
  }
  if (isSameSiteFamily(sourceHost, destinationHost)) return true;

  const path = destination.pathname.toLowerCase();
  return (
    type === "menu" &&
    path.endsWith(".pdf") &&
    TRUSTED_MENU_ASSET_DOMAINS.some((domain) =>
      hostMatches(destinationHost, domain),
    )
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

  const sourceProviderEntity = commerceProviderEntityKey(sourceUrl);
  if (sourceProviderEntity) {
    const destinationProviderEntity = commerceProviderEntityKey(url.toString());
    if (destinationProviderEntity !== sourceProviderEntity) return null;
  }

  const text = anchor.text.toLowerCase();
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let path = url.pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the literal URL path. A malformed percent escape must not crash a
    // whole ingestion batch, and the classifier can still use anchor text.
  }
  const itemQueryKeys = [
    "item",
    "itemid",
    "matchitemname",
    "product",
    "productid",
  ];
  const isItemDeepLink =
    itemQueryKeys.some((key) => url.searchParams.has(key)) ||
    /(?:^|\/)(?:menu-item|items?|product-list|products?)(?:\/|$)/i.test(path) ||
    /\/menus\/[^/]+\/\d+(?:\/|$)/i.test(path) ||
    (anchor.text.length > 100 && /[$€£]\s*\d/.test(anchor.text));
  const isNonActionPath =
    /[\[\]{}]/.test(path) ||
    /(?:^|\/)(?:account|admin|archive|author|blog|blogs|cart|categories|category|checkout|login|search|tag|tags)(?:\/|$)/i.test(
      path,
    ) ||
    /(?:^|\/)(?:locations?|restaurants?|stores?)\/?$/i.test(path);
  if (isItemDeepLink || isNonActionPath) return null;

  const signal = `${text} ${host} ${path.replace(/[-_/]+/g, " ")}`;
  const fromText = (pattern: RegExp) => pattern.test(text);
  const fromUrl = (pattern: RegExp) => pattern.test(`${host} ${path}`);
  const menuText = fromText(
    /\b(?:view |our |food |drink |lunch |dinner |brunch )?menus?\b/,
  );
  const orderText = fromText(
    /\b(?:order online|online ordering|start (?:an )?order|order (?:now|pickup|delivery)|take[- ]?out|pickup (?:and|or) delivery)\b/,
  );
  const menuUrl = fromUrl(/(?:^|[-_/])menus?(?:[-_/]|$)/);
  const orderUrl = fromUrl(
    /(?:^|[-_/])(?:order(?:ing|-online)?|online-ordering|takeout|take-out|pickup)(?:[-_/]|$)/,
  );

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
  } else if (orderText) {
    type = "order";
    score = 105;
  } else if (menuText) {
    type = "menu";
    score = 100;
  } else if (orderUrl) {
    type = "order";
    score = 68;
  } else if (menuUrl) {
    type = "menu";
    score = 65;
  }

  if (!type || !signal.trim()) return null;
  // A navigation item on a followed dining page can point back to the
  // business homepage with text such as "Menu." The homepage is not an exact
  // menu/action destination, so do not turn that ambiguous backlink into a
  // Radius commerce button.
  let sourceHost = "";
  try {
    sourceHost = new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
  if (type === "reservation" && isMismatchedNumberedEntity(sourceUrl, url)) {
    return null;
  }
  if (
    path === "/" &&
    isSameSiteFamily(sourceHost, url.hostname)
  ) {
    return null;
  }
  if (!isSafeOfficialCommerceDestination(sourceUrl, url.toString(), type)) {
    return null;
  }
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
 * Civic platforms commonly link every facility page to one generic
 * reservations department. Different numeric resource IDs are strong proof
 * that the destination is not a booking action for the place being viewed
 * (for example, Dog Parks /192 -> generic Reservations /298).
 */
function isMismatchedNumberedEntity(sourceUrl: string, destination: URL): boolean {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return true;
  }
  if (!isSameSiteFamily(source.hostname, destination.hostname)) return false;
  const sourceId = source.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];
  const destinationId = destination.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];
  return Boolean(sourceId && destinationId && sourceId !== destinationId);
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
  if (
    isKnownThirdPartyBusinessSource(sourceUrl) &&
    !commerceProviderEntityKey(sourceUrl)
  ) {
    return [];
  }
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

  const distinctCandidates = dedupeCommerceDestinations(candidates);
  const typeOrder = Array.from(
    new Set(
      [...distinctCandidates]
        .sort((a, b) => a.index - b.index)
        .map(({ type }) => type),
    ),
  );
  return typeOrder.flatMap((type) =>
    distinctCandidates
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
