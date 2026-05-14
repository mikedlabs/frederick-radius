/**
 * Reddit r/Frederick — community pulse for Frederick County.
 *
 * Reddit locked down their public JSON API in 2024 — unauthenticated
 * server-side requests now return 403 ("whoa there, pardner"). To read
 * public subreddit posts we need an OAuth2 client. It's free and takes
 * ~2 minutes to register; see TOOLS.md.
 *
 * Env vars required:
 *   REDDIT_CLIENT_ID
 *   REDDIT_CLIENT_SECRET
 *
 * Without them, getFrederickRedditPulse() returns [] and the RedditPulse
 * component on Today renders nothing (no error, no fallback).
 *
 * We always link out to Reddit, never embed full content. Always send a
 * descriptive User-Agent (Reddit's ToS requirement).
 */

const SUBREDDIT = "Frederick";
const UA = "FrederickRadius/1.0 by /u/madproductions (https://frederickradius.app; civic discovery for Frederick County)";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

export type RedditPost = {
  id: string;
  title: string;
  flair?: string;
  score: number;
  num_comments: number;
  author: string;
  created_at: string;
  permalink: string;
  url: string;
  is_self: boolean;
  selftext_preview?: string;
  category: "discussion" | "question" | "news" | "recommendation" | "event" | "vent" | "humor" | "other";
};

type RawPost = {
  id: string;
  title: string;
  selftext?: string;
  link_flair_text?: string;
  score: number;
  num_comments: number;
  author: string;
  created_utc: number;
  permalink: string;
  url: string;
  is_self: boolean;
  over_18: boolean;
  stickied: boolean;
  removed_by_category?: string | null;
  spoiler?: boolean;
  hidden?: boolean;
  pinned?: boolean;
};

type RedditResponse = {
  data?: {
    children?: Array<{ kind: string; data: RawPost }>;
  };
};

// Keyword denylist — these are mostly noise / inappropriate for surfacing on
// a public civic platform. Refined over time.
const TITLE_DENY: RegExp[] = [
  /\bnsfw\b/i,
  /\bdoxx?\b/i,
  /\bhookup\b/i,
  /^(any|anyone)\s+(know|recommend)\s+a\s+(good\s+)?(plumber|electrician|mechanic|landscaper|roofer)\b/i,
  /^lost\b.*\b(cat|dog|wallet|phone)\b/i,
];

function categorize(title: string, flair: string | undefined): RedditPost["category"] {
  const t = title.toLowerCase();
  const f = (flair ?? "").toLowerCase();
  if (/^news\b|^breaking\b|police|fire|crash|crime/i.test(t) || f.includes("news")) return "news";
  if (/\?|^anyone\s|^any one\s|^does anyone|^where (can|to)|^best\s|^recommend/i.test(t) || f.includes("question") || f.includes("ask")) return "question";
  if (/\b(rec|recommend|suggestions?|where\s+to)\b/i.test(t)) return "recommendation";
  if (/\b(event|festival|happening|tonight|tomorrow|this\s+weekend)\b/i.test(t) || f.includes("event")) return "event";
  if (/\b(rant|vent|frustrat|annoy|complain)\b/i.test(t) || f.includes("rant") || f.includes("vent")) return "vent";
  if (/[😂🤣😆]|hilarious|funny|joke|meme/i.test(t) || f.includes("humor") || f.includes("meme")) return "humor";
  if (f.includes("discussion")) return "discussion";
  return "other";
}

function clean(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x200B;/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksDenied(title: string): boolean {
  return TITLE_DENY.some((re) => re.test(title));
}

// Cache the OAuth token in module memory for its lifetime (~1 hour).
let cachedToken: { value: string; expires_at: number } | null = null;

async function getOauthToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.expires_at > Date.now() + 30_000) {
    return cachedToken.value;
  }

  try {
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[reddit] token request HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = {
      value: data.access_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[reddit] token request failed:", err);
    return null;
  }
}

export async function getFrederickRedditPulse(opts: {
  sort?: "top" | "hot";
  timeRange?: "day" | "week" | "month";
  minScore?: number;
  limit?: number;
} = {}): Promise<RedditPost[]> {
  const sort = opts.sort ?? "top";
  const timeRange = opts.timeRange ?? "week";
  const minScore = opts.minScore ?? 8;
  const limit = opts.limit ?? 8;

  const token = await getOauthToken();
  if (!token) return []; // Silently render nothing if not configured.

  try {
    const url = `${API_BASE}/r/${SUBREDDIT}/${sort}?t=${timeRange}&limit=30&raw_json=1`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
        Accept: "application/json",
      },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[reddit] HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as RedditResponse;
    const children = data.data?.children ?? [];

    const posts: RedditPost[] = [];
    for (const c of children) {
      const p = c.data;
      if (!p?.id) continue;
      if (p.over_18) continue;
      if (p.stickied || p.pinned) continue;
      if (p.spoiler) continue;
      if (p.hidden) continue;
      if (p.removed_by_category) continue;
      if (p.score < minScore) continue;
      const title = clean(p.title);
      if (!title) continue;
      if (looksDenied(title)) continue;

      posts.push({
        id: p.id,
        title,
        flair: p.link_flair_text || undefined,
        score: p.score,
        num_comments: p.num_comments,
        author: p.author,
        created_at: new Date(p.created_utc * 1000).toISOString(),
        permalink: `https://www.reddit.com${p.permalink}`,
        url: p.url,
        is_self: p.is_self,
        selftext_preview: p.is_self ? clean(p.selftext).slice(0, 180) : undefined,
        category: categorize(title, p.link_flair_text),
      });

      if (posts.length >= limit) break;
    }
    return posts;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[reddit] fetch failed:", err);
    return [];
  }
}
