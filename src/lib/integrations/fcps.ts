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
  /** Source-provided feed timestamp when one is present. */
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

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function pick(tag: string, xml: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? stripCdata(m[1]) : "";
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
      next: { revalidate: 600 },
    });
    if (!res.ok) return { data: [], available: false };
    const xml = await res.text();
    // A CDN or proxy can answer 200 with an HTML error document. Only a real
    // RSS/Atom envelope counts as an available feed; zero items is still a
    // valid successful response.
    if (!/<(?:rss|feed)\b/i.test(xml)) return { data: [], available: false };

    const items: FcpsAlert[] = [];
    const observedAt = Date.now();
    // Thirty hours covers a next-day notice posted the prior afternoon while
    // dropping yesterday's same-day closure by the following school day.
    const MAX_OPERATIONAL_NOTICE_AGE_MS = 30 * 60 * 60 * 1_000;
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null && items.length < 8) {
      const block = m[1];
      const title = pick("title", block);
      const description = pick("description", block);
      const link = pick("link", block);
      const pubDate = pick("pubDate", block);
      const guid = pick("guid", block);
      if (!title) continue;
      // Only surface weather/closure-relevant alerts
      const status = inferStatus(title, description);
      if (status === "unknown") continue;
      const publishedAt = isoOrUndefined(pubDate);
      // An operational notice is useful only while it could still apply. The
      // news feed keeps old stories in its latest-eight window, so an older
      // closure must not continue to mark Pulse as if schools are closed now.
      if (!publishedAt) continue;
      const ageMs = observedAt - Date.parse(publishedAt);
      if (ageMs < -2 * 60 * 60 * 1_000 || ageMs > MAX_OPERATIONAL_NOTICE_AGE_MS) continue;
      items.push({
        id: guid || link || title,
        title,
        description: description.replace(/<[^>]+>/g, "").trim().slice(0, 240),
        status,
        published_at: publishedAt,
        url: link || url,
      });
    }
    return {
      data: items,
      available: true,
      asOf: isoOrUndefined(pick("lastBuildDate", xml) || pick("pubDate", xml)),
    };
  } catch {
    return { data: [], available: false };
  }
}

/** Compatibility wrapper for existing detail surfaces. */
export async function getFcpsAlerts(): Promise<FcpsAlert[]> {
  return (await getFcpsAlertsResult()).data;
}
