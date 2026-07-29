/**
 * Current Alert Center feeds from the City of Frederick and Frederick County
 * Health Department.
 *
 * CivicPlus publishes one RSS feed per active-alert category. Presence in
 * these feeds is the provider's explicit active state; publication age alone
 * does not expire an item (an annual burn ban can legitimately stay active
 * for months). When an item disappears from the current feed, Radius simply
 * stops returning it.
 *
 * These feeds are useful official signals, not complete emergency coverage.
 * The Health Department categories in particular cover only that department's
 * burn-ban, closing, and health notices.
 */

import type {
  OfficialOperationalSignalBase,
  OfficialSignalProvenance,
} from "./official-signal-contract";

export type OfficialCivicAlertKind =
  | "city-emergency"
  | "health-burn-ban"
  | "health-closing"
  | "health-notice";

export type OfficialCivicAlert = OfficialOperationalSignalBase & {
  kind: OfficialCivicAlertKind;
  state: "active";
  active: true;
};

type FeedDefinition = {
  id: OfficialCivicAlertKind;
  publisher: string;
  scope: OfficialCivicAlert["scope"];
  url: string;
  publicPageUrl: string;
  hostname: string;
  coverageNote: string;
};

export type OfficialCivicAlertSourceHealth = {
  id: OfficialCivicAlertKind;
  publisher: string;
  available: boolean;
  asOf: string | null;
  activeCount: number;
};

export type OfficialCivicAlertsResult = {
  alerts: OfficialCivicAlert[];
  /** At least one official category returned a valid RSS document. */
  available: boolean;
  /** One or more configured categories failed or changed shape. */
  degraded: boolean;
  /**
   * Always false: these narrow Alert Center categories are not a complete
   * inventory of City/County emergency information.
   */
  coverageComplete: false;
  coverageNote: string;
  sourceHealth: OfficialCivicAlertSourceHealth[];
};

export const OFFICIAL_CIVIC_ALERT_FEEDS: readonly FeedDefinition[] = [
  {
    id: "city-emergency",
    publisher: "City of Frederick",
    scope: "city",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=63&CID=City-Emergencies-4",
    publicPageUrl:
      "https://www.cityoffrederickmd.gov/AlertCenter.aspx?CID=City-Emergencies-4",
    hostname: "www.cityoffrederickmd.gov",
    coverageNote:
      "City Alert Center emergency category only; it is not complete emergency coverage.",
  },
  {
    id: "health-burn-ban",
    publisher: "Frederick County Health Department",
    scope: "county",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Burn-Ban-4",
    publicPageUrl:
      "https://health.frederickcountymd.gov/AlertCenter.aspx?CID=Burn-Ban-4",
    hostname: "health.frederickcountymd.gov",
    coverageNote:
      "Health Department burn-ban category only; it is not complete emergency coverage.",
  },
  {
    id: "health-closing",
    publisher: "Frederick County Health Department",
    scope: "county",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Closings-5",
    publicPageUrl:
      "https://health.frederickcountymd.gov/AlertCenter.aspx?CID=Closings-5",
    hostname: "health.frederickcountymd.gov",
    coverageNote:
      "Health Department closing category only; it is not complete county closure coverage.",
  },
  {
    id: "health-notice",
    publisher: "Frederick County Health Department",
    scope: "county",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Health-Notices-1",
    publicPageUrl:
      "https://health.frederickcountymd.gov/AlertCenter.aspx?CID=Health-Notices-1",
    hostname: "health.frederickcountymd.gov",
    coverageNote:
      "Health Department notices only; it is not complete public-health or emergency coverage.",
  },
] as const;

const COVERAGE_NOTE =
  "Official City Alert Center and Health Department categories are checked independently. They do not represent complete City or County emergency coverage.";

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function tagText(tag: string, block: string): string {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  if (!match) return "";
  return decodeEntities(
    match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
  );
}

function plainText(value: string, maxLength: number): string {
  const text = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function officialSummary(value: string, maxLength: number): string {
  const text = plainText(value, Number.MAX_SAFE_INTEGER);
  if (text.length <= maxLength) return text;

  const window = text.slice(0, maxLength);
  const sentenceEnds = [...window.matchAll(/[.!?](?=\s|$)/g)];
  const lastSentenceEnd = sentenceEnds.at(-1)?.index;
  if (
    lastSentenceEnd !== undefined &&
    lastSentenceEnd >= Math.min(80, Math.floor(maxLength * 0.45))
  ) {
    return window.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastWordBreak = window.lastIndexOf(" ");
  const safeEnd = lastWordBreak >= Math.floor(maxLength * 0.7)
    ? lastWordBreak
    : maxLength - 1;
  return `${window.slice(0, safeEnd).trimEnd()}…`;
}

function isoOrNull(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function officialItemUrl(
  rawUrl: string,
  definition: FeedDefinition,
): string | null {
  try {
    const parsed = new URL(rawUrl, definition.publicPageUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== definition.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function stableId(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export type ParsedOfficialAlertFeed = {
  valid: boolean;
  asOf: string | null;
  alerts: OfficialCivicAlert[];
};

/**
 * Parse one current-alert RSS document. A valid channel with zero items is a
 * successful empty feed, not an upstream failure and not proof that no other
 * emergency exists.
 */
export function parseOfficialAlertFeed(
  xml: string,
  definition: FeedDefinition,
  retrievedAt = new Date().toISOString(),
): ParsedOfficialAlertFeed {
  if (!/<rss(?:\s|>)/i.test(xml) || !/<channel(?:\s|>)/i.test(xml)) {
    return { valid: false, asOf: null, alerts: [] };
  }

  const asOf = isoOrNull(tagText("lastBuildDate", xml));
  const providerUpdatedAt = asOf;
  const alerts: OfficialCivicAlert[] = [];
  const itemPattern = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    const block = itemMatch[1];
    const title = plainText(tagText("title", block), 180);
    const itemUrl = officialItemUrl(tagText("link", block), definition);
    if (!title || !itemUrl) continue;

    const rawDescription = tagText("description", block);
    // The municipal RSS pages invite subscription but do not publish a broad
    // republication license. Keep only a short factual excerpt and always
    // hand the reader back to the canonical official notice.
    const summary = officialSummary(rawDescription, 240);
    const publishedAt = isoOrNull(tagText("pubDate", block));
    const provenance: OfficialSignalProvenance = {
      publisher: definition.publisher,
      authority: "official-government",
      sourceKind: "official-rss",
      sourceUrl: definition.url,
      canonicalUrl: itemUrl,
      retrievedAt,
      providerUpdatedAt,
      confidence: "official",
    };

    alerts.push({
      id: `${definition.id}-${stableId(itemUrl)}`,
      kind: definition.id,
      title,
      summary,
      url: itemUrl,
      scope: definition.scope,
      state: "active",
      active: true,
      publishedAt,
      occurredAt: null,
      expiresAt: null,
      confidence: "official",
      provenance,
    });
  }

  return { valid: true, asOf, alerts };
}

type LoadOfficialCivicAlertOptions = {
  deadlineMs?: number;
  revalidateSeconds?: number;
  now?: Date;
};

export async function getOfficialCivicAlertsResult({
  deadlineMs = 5_000,
  revalidateSeconds = 300,
  now = new Date(),
}: LoadOfficialCivicAlertOptions = {}): Promise<OfficialCivicAlertsResult> {
  const retrievedAt = now.toISOString();
  const feeds = await Promise.all(
    OFFICIAL_CIVIC_ALERT_FEEDS.map(async (definition) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs);
      try {
        const response = await fetch(definition.url, {
          headers: {
            Accept: "application/rss+xml, application/xml;q=0.9",
            "User-Agent":
              "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
          },
          signal: controller.signal,
          next: { revalidate: revalidateSeconds },
        });
        if (!response.ok) {
          return {
            definition,
            parsed: {
              valid: false,
              asOf: null,
              alerts: [] as OfficialCivicAlert[],
            },
          };
        }
        return {
          definition,
          parsed: parseOfficialAlertFeed(
            await response.text(),
            definition,
            retrievedAt,
          ),
        };
      } catch {
        return {
          definition,
          parsed: {
            valid: false,
            asOf: null,
            alerts: [] as OfficialCivicAlert[],
          },
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const alerts = feeds
    .flatMap((feed) => feed.parsed.alerts)
    .sort((left, right) => {
      const leftTime = left.publishedAt
        ? Date.parse(left.publishedAt)
        : Number.NEGATIVE_INFINITY;
      const rightTime = right.publishedAt
        ? Date.parse(right.publishedAt)
        : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    });
  const validCount = feeds.filter((feed) => feed.parsed.valid).length;

  return {
    alerts,
    available: validCount > 0,
    degraded: validCount < feeds.length,
    coverageComplete: false,
    coverageNote: COVERAGE_NOTE,
    sourceHealth: feeds.map(({ definition, parsed }) => ({
      id: definition.id,
      publisher: definition.publisher,
      available: parsed.valid,
      asOf: parsed.asOf,
      activeCount: parsed.alerts.length,
    })),
  };
}

export async function getOfficialCivicAlerts(
  options: LoadOfficialCivicAlertOptions = {},
): Promise<OfficialCivicAlert[]> {
  return (await getOfficialCivicAlertsResult(options)).alerts;
}
