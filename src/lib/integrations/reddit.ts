/**
 * Reddit r/Frederick — community pulse via public RSS feed.
 *
 * Reddit locked down their JSON API in 2024, but RSS feeds remain public
 * and auth-free for now. We parse the top-of-week RSS, score-rank what we
 * can from the entry metadata, and always link out.
 *
 * No env vars required. No OAuth. Falls back to [] on any error.
 *
 * RSS endpoint: https://www.reddit.com/r/Frederick/top.rss?t=week
 *
 * Caveats:
 *  - RSS doesn't include vote scores. We use comment_count as a proxy.
 *  - selftext is HTML-encoded; we strip tags and entities.
 *  - flair isn't exposed by RSS — categorization is title/keyword-based only.
 */

// r/Frederick was banned by Reddit; r/FrederickMD (42k subs, est. 2010) is the active community.
const SUBREDDIT = "FrederickMD";
const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic discovery for Frederick County)";

export type RedditPost = {
  id: string;
  title: string;
  flair?: string;
  score: number;          // proxied from num_comments since RSS doesn't carry score
  num_comments: number;
  author: string;
  created_at: string;
  permalink: string;
  url: string;
  is_self: boolean;
  selftext_preview?: string;
  category: "discussion" | "question" | "news" | "recommendation" | "event" | "vent" | "humor" | "other";
};

// Keyword denylist — refined over time. Noise / inappropriate-for-civic.
const TITLE_DENY: RegExp[] = [
  /\bnsfw\b/i,
  /\bdoxx?\b/i,
  /\bhookup\b/i,
  /^(any|anyone)\s+(know|recommend)\s+a\s+(good\s+)?(plumber|electrician|mechanic|landscaper|roofer)\b/i,
  /^lost\b.*\b(cat|dog|wallet|phone)\b/i,
];

function categorize(title: string): RedditPost["category"] {
  const t = title.toLowerCase();
  if (/^news\b|^breaking\b|police|fire|crash|crime/i.test(t)) return "news";
  if (/\?|^anyone\s|^any one\s|^does anyone|^where (can|to)|^best\s|^recommend/i.test(t)) return "question";
  if (/\b(rec|recommend|suggestions?|where\s+to)\b/i.test(t)) return "recommendation";
  if (/\b(event|festival|happening|tonight|tomorrow|this\s+weekend)\b/i.test(t)) return "event";
  if (/\b(rant|vent|frustrat|annoy|complain)\b/i.test(t)) return "vent";
  if (/[😂🤣😆]|hilarious|funny|joke|meme/i.test(t)) return "humor";
  return "other";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x200B;/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/g, " ");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pickTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  let v = m[1];
  // Unwrap CDATA if present
  const cdata = v.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) v = cdata[1];
  return v.trim();
}

function pickAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, "i");
  return xml.match(re)?.[1];
}

function looksDenied(title: string): boolean {
  return TITLE_DENY.some((re) => re.test(title));
}

export async function getFrederickRedditPulse(opts: {
  sort?: "top" | "hot";
  timeRange?: "day" | "week" | "month";
  // Kept for API compatibility but unused — RSS feeds are pre-sorted by Reddit's
  // own ranker, and they don't expose scores per-entry. We trust feed order.
  minScore?: number;
  limit?: number;
} = {}): Promise<RedditPost[]> {
  const sort = opts.sort ?? "top";
  const timeRange = opts.timeRange ?? "week";
  const limit = opts.limit ?? 8;

  const url = `https://www.reddit.com/r/${SUBREDDIT}/${sort}.rss?t=${timeRange}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/atom+xml,application/xml,*/*" },
      next: { revalidate: 900 }, // 15 min cache
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[reddit/rss] HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const entries = xml.split(/<entry\b/i).slice(1).map((s) => "<entry " + s.split(/<\/entry>/i)[0] + "</entry>");

    const posts: RedditPost[] = [];

    for (const e of entries) {
      const idRaw = pickTag(e, "id") ?? "";              // e.g. "t3_abc123"
      const id = idRaw.replace(/^t3_/, "").trim();
      const titleRaw = pickTag(e, "title") ?? "";
      const title = decodeEntities(titleRaw).trim();
      if (!title || !id) continue;
      if (looksDenied(title)) continue;

      const author = decodeEntities(pickTag(e, "name") ?? "").replace(/^\/u\//, "").trim() || "anonymous";
      const updated = pickTag(e, "updated") ?? pickTag(e, "published") ?? new Date().toISOString();
      const linkHref = pickAttr(e, "link", "href") ?? "";

      const contentRaw = pickTag(e, "content") ?? "";
      const contentHtml = decodeEntities(contentRaw);
      const contentText = stripHtml(contentHtml);

      // Strip RSS-specific noise: "submitted by /u/X" header + "[link]" "[comments]" anchors
      let body = contentText
        .replace(/submitted by\s+\/u\/\S+/gi, "")
        .replace(/\[link\]/gi, "")
        .replace(/\[comments?\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      body = body.replace(/^by\s+\/u\/\S+\s*/i, "").trim();
      const selftext_preview = body && body.length > 5 ? body.slice(0, 180).trim() : undefined;

      const is_self = linkHref.includes(`/r/${SUBREDDIT}/comments/`);

      posts.push({
        id,
        title,
        flair: undefined,
        score: 0,            // not exposed in RSS
        num_comments: 0,     // not exposed in RSS
        author,
        created_at: updated,
        permalink: linkHref || `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}/`,
        url: linkHref,
        is_self,
        selftext_preview,
        category: categorize(title),
      });

      if (posts.length >= limit) break;
    }

    return posts;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[reddit/rss] fetch failed:", err);
    return [];
  }
}
