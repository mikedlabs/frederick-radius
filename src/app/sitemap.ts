import type { MetadataRoute } from "next";
import { publicPlaces } from "@/lib/loaders/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Only canonical, indexable, 200-status URLs (T2). The root "/" 307s to
  // /today (the answer surface is now the home entry), and /now + /radius +
  // /guide 308-redirect — listing a redirect in the sitemap is the bug, so
  // they're gone. /today is priority 1.
  const top: MetadataRoute.Sitemap = [
    { url: `${BASE}/today`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/map`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/open-now`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/live-music`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    // Field Notes moat content surfaces — verified, self-canonical, indexable.
    { url: `${BASE}/happy-hour`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/brunch`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/deals`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/collections`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/history`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Public content surfaces with self-canonicals: the directory index and
    // the two county-reference pages (amenities, government contacts).
    { url: `${BASE}/places`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/amenities`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/contacts`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // Dropped: "/now" (308→/today), "/radius" (308→
    // /map?mode=radius) — never list a redirect. /pulse, /parks, /trails
    // are noindex; /my-radius is user-state; /submit, /welcome, /settings,
    // /business, /pitch, /from-above now carry robots:{index:false}.
  ];
  const places = publicPlaces().map((p) => ({
    url: `${BASE}/places/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  // Event window (T2): only current/upcoming within ~60 days, so the
  // sitemap doesn't bloat with expired events. lastModified = the event's
  // own start, not a single build timestamp.
  const nowMs = +now;
  const WINDOW_MS = 60 * 864e5;
  const events = EVENTS.filter((e) => {
    const t = Date.parse(e.starts_at);
    return Number.isFinite(t) && t >= nowMs - 864e5 && t <= nowMs + WINDOW_MS;
  }).map((e) => ({
    url: `${BASE}/events/${e.slug}`,
    lastModified: new Date(e.starts_at),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));
  const munis = MUNICIPALITIES.map((m) => ({
    url: `${BASE}/m/${m.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));
  const cats = CATEGORIES.map((c) => ({
    url: `${BASE}/category/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  return [...top, ...munis, ...cats, ...places, ...events];
}
