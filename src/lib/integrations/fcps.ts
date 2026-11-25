import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Frederick County Public Schools — closures, delays, dismissals.
 * The district publishes weather + emergency updates via web alerts and
 * SchoolMessenger. We use their public RSS feed.
 *
 * Endpoint can be overridden via env: FCPS_FEED_URL
 */

// FCPS exposes its current news-summary RSS from the News page. The previous
// /news.rss shortcut now returns 404.
const DEFAULT_FEED = "https://www.fcps.org/syndication/rss.aspx?feed=datasummary&item_description=portlet_xml_summary&item_name=portlet_xml_title&item_pubdate=portlet_last_modified&key=%2FAAGY2FPAufgUrJw7OxqsYwSBXFdTp%2BBNc5BCpRcIw8jq5pyNj8YKVVG3nKyM4pYNB7knPKvIRZyPRd8wyu8lwgUC2E%3D&max_items=8&portal_id=74633453&serverid=74633369&target_object_id=74815149&userid=5&v=2.0";
const FCPS_FETCH_TIMEOUT_MS = 5_000;

export type FcpsStatus = "open" | "delayed" | "early_dismissal" | "closed" | "unknown";

export type FcpsAlert = {
  id: string;
  title: string;
  description: string;
  status: FcpsStatus;
  published_at: string;
  url: string;
};

export type FcpsAlertsResult = {
  data: FcpsAlert[];
  /** True when the official RSS returned a parseable feed, even if no alert matched. */
  available: boolean;
  /** HTTP response time retained with the cached body. Missing means freshness is unknown. */
  checkedAt?: string;
  /** Channel publication or build time, independent of when FCPS answered. */
  asOf?: string;
};

const STATUS_PRIORITY: Record<FcpsStatus, number> = {
  closed: 5,
  delayed: 4,
  early_dismissal: 3,
  open: 2,
  unknown: 1,
};

/**
 * Resolve the current FCPS operating state from the feed's recent notice
 * window. The RSS can contain a newer reopening notice alongside the closure
 * it superseded; consumers must not scan the whole window for any closure and
 * keep presenting an obsolete disruption.
 *
 * Multiple notices with the newest status remain useful, so retain them while
 * dropping older contradictory states.
 */
export function currentFcpsOperationsNotices(
  alerts: FcpsAlert[],
): FcpsAlert[] {
  const ordered = [...alerts].sort((a, b) => {
    const published = Date.parse(b.published_at) - Date.parse(a.published_at);
    if (Number.isFinite(published) && published !== 0) return published;
    return STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
  });
  const currentStatus = ordered[0]?.status;
  return currentStatus
    ? ordered.filter((alert) => alert.status === currentStatus)
    : [];
}

const parser = new XMLParser({
  parseTagValue: false,
  isArray: (_name, path) => path === "rss.channel.item",
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// The district may post tomorrow's operating notice the previous afternoon.
export function isCurrentFcpsNotice(publishedAt: string, now: number): boolean {
  const age = now - Date.parse(publishedAt);
  return age >= -2 * 60 * 60_000 && age <= 30 * 60 * 60_000;
}

function inferStatus(title: string, description: string): FcpsStatus {
  const t = `${title} ${description}`.toLowerCase();
  const schoolOperations = /\b(?:fcps|schools?|school offices?|classes|students|district)\b/i.test(t);
  if (!schoolOperations) return "unknown";
  if (/\b(?:closed|cancelled|canceled|cancel)\b/i.test(t)) return "closed";
  if (/\b(?:two[\s-]hour delay|2[\s-]hour delay|delayed opening|schools? (?:will )?(?:open|start) late)\b/i.test(t)) return "delayed";
  if (/\b(?:early dismissal|early release|dismiss(?:ing|ed)? early)\b/i.test(t)) return "early_dismissal";
  if (/\b(?:on time|normal operations|reopening|reopen)\b/i.test(t)) return "open";
  return "unknown";
}

function isoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function getFcpsAlertsResult(): Promise<FcpsAlertsResult> {
  const url = process.env.FCPS_FEED_URL ?? DEFAULT_FEED;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(FCPS_FETCH_TIMEOUT_MS),
      next: { revalidate: 600 },
    });
    if (!res.ok) return { data: [], available: false };
    const xml = await res.text();
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
      return { data: [], available: false };
    }
    const channel = parser.parse(xml)?.rss?.channel;
    // An empty RSS channel is valid. HTML, Atom (a different item schema),
    // and truncated documents cannot clear an existing school notice.
    if (channel !== "" && (!channel || typeof channel !== "object" || Array.isArray(channel))) {
      return { data: [], available: false };
    }

    const items: FcpsAlert[] = [];
    const observedAt = Date.now();
    for (const row of channel.item ?? []) {
      if (items.length === 8) break;
      const title = text(row.title);
      const description = text(row.description);
      const link = text(row.link);
      const guid = text(row.guid);
      if (!title && !description) return { data: [], available: false };
      // Only surface weather/closure-relevant alerts
      const status = inferStatus(title, description);
      if (status === "unknown") continue;
      const publishedAt = isoOrUndefined(text(row.pubDate));
      // An operational notice is useful only while it could still apply. The
      // news feed keeps old stories in its latest-eight window, so an older
      // closure must not continue to mark Pulse as if schools are closed now.
      if (!publishedAt) return { data: [], available: false };
      if (!isCurrentFcpsNotice(publishedAt, observedAt)) continue;
      items.push({
        id: guid || link || title || description,
        title: title || description.replace(/<[^>]+>/g, "").trim().slice(0, 180),
        description: description.replace(/<[^>]+>/g, "").trim().slice(0, 240),
        status,
        published_at: publishedAt,
        url: link || url,
      });
    }
    return {
      data: items,
      available: true,
      checkedAt: isoOrUndefined(res.headers.get("date") ?? ""),
      asOf: isoOrUndefined(text(channel.lastBuildDate)) ?? isoOrUndefined(text(channel.pubDate)),
    };
  } catch {
    return { data: [], available: false };
  }
}

/** Compatibility wrapper for existing detail surfaces. */
export async function getFcpsAlerts(): Promise<FcpsAlert[]> {
  return (await getFcpsAlertsResult()).data;
}
