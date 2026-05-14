/**
 * Frederick County Public Schools — closures, delays, dismissals.
 * The district publishes weather + emergency updates via web alerts and
 * SchoolMessenger. We use their public RSS feed.
 *
 * Endpoint can be overridden via env: FCPS_FEED_URL
 */

const DEFAULT_FEED = "https://www.fcps.org/news.rss";

export type FcpsStatus = "open" | "delayed" | "early_dismissal" | "closed" | "unknown";

export type FcpsAlert = {
  id: string;
  title: string;
  description: string;
  status: FcpsStatus;
  published_at: string;
  url: string;
};

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function pick(tag: string, xml: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? stripCdata(m[1]) : "";
}

function inferStatus(title: string, description: string): FcpsStatus {
  const t = `${title} ${description}`.toLowerCase();
  if (/closed|cancelled|cancel/i.test(t) && /(schools?|fcps)/i.test(t)) return "closed";
  if (/two[\s-]hour delay|2[\s-]hour delay|delayed opening|delay/i.test(t)) return "delayed";
  if (/early dismissal|early release/i.test(t)) return "early_dismissal";
  if (/on time|normal operations|reopening|reopen/i.test(t)) return "open";
  return "unknown";
}

export async function getFcpsAlerts(): Promise<FcpsAlert[]> {
  const url = process.env.FCPS_FEED_URL ?? DEFAULT_FEED;
  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: FcpsAlert[] = [];
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
      const recent = pubDate ? Date.now() - new Date(pubDate).getTime() < 36 * 60 * 60 * 1000 : true;
      if (status === "unknown" && !recent) continue;
      items.push({
        id: guid || link || title,
        title,
        description: description.replace(/<[^>]+>/g, "").trim().slice(0, 240),
        status,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: link || url,
      });
    }
    return items.filter((a) => a.status !== "unknown" || items.length <= 2);
  } catch {
    return [];
  }
}
