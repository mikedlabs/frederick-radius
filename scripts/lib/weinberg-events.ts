import { normalizeVenueEventDateTime } from "./venue-event-time";

const OFFICIAL_HOST = "weinbergcenter.org";
const AJAX_PATH = "/wp-admin/admin-ajax.php";
const MAX_PAGES = 20;
const MAX_CARDS = 250;
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const UA = "FrederickRadius/1.0 (+venue data ingest)";

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);

export type WeinbergVenueFilter = "weinberg-center" | "new-spire-arts";

export type WeinbergEvent = {
  title: string;
  starts_at: string;
  ticket_url?: string;
};

export type WeinbergEventsFetchResult =
  | {
      status: "success";
      events: WeinbergEvent[];
      sourceUrl: string;
      foundCards: number;
    }
  | {
      status: "failure";
      events: [];
      sourceUrl: string;
      reason: string;
    };

type ParsedPage = {
  events: WeinbergEvent[];
  cardCount: number;
  foundCards: number | null;
  invalidCards: number;
};

type WeinbergFetchOptions = {
  venueFilter: WeinbergVenueFilter;
  fetchImpl?: typeof fetch;
  maxPages?: number;
  timeoutMs?: number;
};

function cleanText(value: string | null | undefined): string {
  return decodeHtml(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    ndash: "–",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      const point = decimal
        ? Number(decimal)
        : hex
          ? Number.parseInt(hex, 16)
          : null;
      if (
        point !== null &&
        Number.isSafeInteger(point) &&
        point >= 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
      ) {
        return String.fromCodePoint(point);
      }
      return named[name?.toLowerCase() ?? ""] ?? entity;
    },
  );
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = new RegExp(`${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
  if (quoted) return decodeHtml(quoted[2] ?? "");
  const bare = new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  return bare ? decodeHtml(bare[1] ?? "") : null;
}

function tagsWithClass(html: string, className: string): string[] {
  return [...html.matchAll(/<[a-z][^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) =>
      (attribute(tag, "class") ?? "").split(/\s+/).includes(className),
    );
}

function firstTagWithId(html: string, id: string): string | null {
  return [...html.matchAll(/<[a-z][^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => attribute(tag, "id") === id) ?? null;
}

function textByClass(html: string, tagName: string, className: string): string[] {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
    "gi",
  );
  return [...html.matchAll(pattern)].flatMap((match) => {
    const element = match[0];
    const opening = element.match(new RegExp(`^<${tagName}\\b[^>]*>`, "i"))?.[0];
    if (
      !opening ||
      !(attribute(opening, "class") ?? "").split(/\s+/).includes(className)
    ) {
      return [];
    }
    return [cleanText(element.replace(opening, "").replace(new RegExp(`<\\/${tagName}>$`, "i"), ""))];
  });
}

function eventCardSegments(html: string): string[] {
  const starts = [...html.matchAll(/<[a-z][^>]*>/gi)]
    .filter((match) =>
      (attribute(match[0], "class") ?? "").split(/\s+/).includes("js-post"),
    )
    .map((match) => match.index);
  return starts.map((start, index) => html.slice(start, starts[index + 1]));
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function officialUrl(value: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(value, baseUrl);
    const host = resolved.hostname.toLowerCase().replace(/^www\./, "");
    if (resolved.protocol !== "https:" || host !== OFFICIAL_HOST) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function publishedLocalDateTime(dateText: string, timeText: string): string | null {
  const date = /^(?:[A-Za-z]+\s+)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(
    cleanText(dateText),
  );
  const time = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(cleanText(timeText));
  if (!date || !time) return null;

  const month = MONTHS.get(date[1]!.toLowerCase());
  if (!month) return null;
  const rawHour = Number(time[1]);
  const minute = Number(time[2]);
  if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) return null;
  const hour = (rawHour % 12) + (time[3]!.toUpperCase() === "PM" ? 12 : 0);
  const local =
    `${date[3]}-${String(month).padStart(2, "0")}-${String(Number(date[2])).padStart(2, "0")}` +
    ` ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return normalizeVenueEventDateTime(local);
}

/**
 * Parse one official Weinberg AJAX page. A card is all-or-nothing: if its
 * title or any published performance time cannot be represented faithfully,
 * the caller rejects the complete source read rather than publishing a
 * silently truncated calendar.
 */
export function parseWeinbergEventPage(
  html: string,
  sourceUrl: string,
): ParsedPage {
  const queryInfo = firstTagWithId(html, "query-info");
  const firstCardTag = tagsWithClass(html, "js-post")[0];
  const foundCards = positiveInteger(
    (queryInfo ? attribute(queryInfo, "data-found-posts") : null) ??
      (firstCardTag ? attribute(firstCardTag, "data-found-posts") : null),
  );
  const cards = eventCardSegments(html);
  const events: WeinbergEvent[] = [];
  let invalidCards = 0;

  for (const card of cards) {
    const title = textByClass(card, "h4", "show-title")[0] ?? "";
    const detailHref = [...card.matchAll(/<a\b[^>]*>/gi)]
      .map((match) => attribute(match[0], "href"))
      .find((href) => href?.includes("/shows/"));
    const ticketUrl = detailHref ? officialUrl(detailHref, sourceUrl) : null;
    const dates = textByClass(card, "p", "show-date");
    const times = textByClass(card, "p", "show-time");
    if (!title || !ticketUrl || dates.length === 0 || dates.length !== times.length) {
      invalidCards += 1;
      continue;
    }

    const parsedForCard: WeinbergEvent[] = [];
    for (let index = 0; index < dates.length; index += 1) {
      const startsAt = publishedLocalDateTime(
        dates[index] ?? "",
        times[index] ?? "",
      );
      if (!startsAt) {
        parsedForCard.length = 0;
        break;
      }
      parsedForCard.push({ title, starts_at: startsAt, ticket_url: ticketUrl });
    }
    if (parsedForCard.length !== dates.length) {
      invalidCards += 1;
      continue;
    }
    events.push(...parsedForCard);
  }

  return { events, cardCount: cards.length, foundCards, invalidCards };
}

async function readBoundedText(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return null;
  const text = await response.text();
  return Buffer.byteLength(text, "utf8") <= MAX_RESPONSE_BYTES ? text : null;
}

async function boundedFetch(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function failure(sourceUrl: string, reason: string): WeinbergEventsFetchResult {
  return { status: "failure", events: [], sourceUrl, reason };
}

/**
 * Read every upcoming card through the same official endpoint used by the
 * Weinberg site's Load More button. This is deterministic, bounded, and free
 * of model or discovery-provider output. A partial pagination result fails
 * closed so the caller retains the last-known-good inventory.
 */
export async function fetchWeinbergEventsResult(
  sourceUrl: string,
  options: WeinbergFetchOptions,
): Promise<WeinbergEventsFetchResult> {
  const canonicalSource = officialUrl(sourceUrl, sourceUrl);
  if (!canonicalSource) return failure(sourceUrl, "invalid official source URL");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxPages = Math.min(Math.max(options.maxPages ?? MAX_PAGES, 1), MAX_PAGES);

  const landing = await boundedFetch(
    fetchImpl,
    canonicalSource,
    { headers: { "User-Agent": UA }, redirect: "follow" },
    timeoutMs,
  );
  if (!landing?.ok) return failure(canonicalSource, "landing page unavailable");
  const finalSource = officialUrl(landing.url || canonicalSource, canonicalSource);
  if (!finalSource) return failure(canonicalSource, "landing page redirected off source");
  const landingHtml = await readBoundedText(landing);
  if (!landingHtml) return failure(finalSource, "landing page exceeded safety limit");

  const nonceTag = firstTagWithId(landingHtml, "more_posts_nonce");
  const nonce = nonceTag ? attribute(nonceTag, "value")?.trim() : undefined;
  const wrapper = tagsWithClass(landingHtml, "js-post-container")[0];
  const postType = wrapper ? attribute(wrapper, "data-post-type")?.trim() : undefined;
  const pageSize = tagsWithClass(landingHtml, "js-post")
    .filter((tag) => !(attribute(tag, "class") ?? "").split(/\s+/).includes("sticky"))
    .length;
  if (!nonce || postType !== "shows" || pageSize < 1 || pageSize > 25) {
    return failure(finalSource, "pagination metadata unavailable");
  }

  const endpoint = new URL(AJAX_PATH, finalSource).toString();
  const events: WeinbergEvent[] = [];
  let expectedCards: number | null = null;
  let collectedCards = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const body = new URLSearchParams({
      postType,
      postsPerPage: String(pageSize),
      postOffset: String(collectedCards),
      taxQuery: JSON.stringify({ event_venues: [options.venueFilter] }),
      search: "",
      morePostsNonce: nonce,
      action: "ag_ajax_more_post",
    });
    const response = await boundedFetch(
      fetchImpl,
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": UA,
        },
        body,
        redirect: "follow",
      },
      timeoutMs,
    );
    if (!response?.ok) return failure(finalSource, "pagination request failed");
    const responseUrl = officialUrl(response.url || endpoint, endpoint);
    if (!responseUrl) return failure(finalSource, "pagination redirected off source");
    const raw = await readBoundedText(response);
    if (!raw) return failure(finalSource, "pagination response exceeded safety limit");

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return failure(finalSource, "pagination returned invalid JSON");
    }
    const pageHtml =
      payload && typeof payload === "object" &&
      (payload as { success?: unknown }).success === true &&
      typeof (payload as { data?: unknown }).data === "string"
        ? (payload as { data: string }).data
        : null;
    if (pageHtml === null) return failure(finalSource, "pagination response was incomplete");

    const parsed = parseWeinbergEventPage(pageHtml, finalSource);
    if (parsed.foundCards === null || parsed.invalidCards > 0) {
      return failure(finalSource, "official event cards could not be parsed completely");
    }
    expectedCards ??= parsed.foundCards;
    if (parsed.foundCards !== expectedCards || expectedCards > MAX_CARDS) {
      return failure(finalSource, "official event count changed during pagination");
    }
    if (parsed.cardCount === 0) {
      if (collectedCards === expectedCards) break;
      return failure(finalSource, "pagination ended before every event card was read");
    }
    collectedCards += parsed.cardCount;
    events.push(...parsed.events);
    if (collectedCards >= expectedCards) break;
  }

  if (expectedCards === null || collectedCards !== expectedCards) {
    return failure(finalSource, "pagination limit reached before completion");
  }
  const unique = new Map(events.map((event) => [
    `${event.title.toLocaleLowerCase("en-US")}\u0000${event.starts_at}`,
    event,
  ]));
  return {
    status: "success",
    events: [...unique.values()],
    sourceUrl: finalSource,
    foundCards: expectedCards,
  };
}
