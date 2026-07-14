import type { MetadataRoute } from "next";
import { publicPlaces } from "@/lib/loaders/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES, isAmenityCategory } from "@/data/categories";
import { COLLECTIONS } from "@/data/collections";
import { CIVIC_MOMENTS } from "@/data/civic-moments";

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
    { url: `${BASE}/compass`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/open-now`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/live-music`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    // Field Notes moat content surfaces — verified, self-canonical, indexable.
    { url: `${BASE}/happy-hour`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/brunch`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/deals`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/collections`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/nonprofits`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/history`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Public content surfaces with self-canonicals: the directory index and
    // the two county-reference pages (amenities, government contacts).
    { url: `${BASE}/places`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/amenities`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/contacts`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // Mobile-vendor roster (roaming trucks live here, not in the places catalog).
    { url: `${BASE}/food-trucks`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
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
  const cats = CATEGORIES
    // /category/food-truck 308s to /food-trucks (roster) — never list a redirect.
    .filter((c) => c.slug !== "food-truck")
    // Amenity categories (restrooms, Wi-Fi, benches…) redirect to /amenities and
    // hold zero places; utility categories (voting) are seasonal/empty. Neither
    // is a browsable directory, so keep both out of the index (audit DQ-016).
    .filter((c) => !isAmenityCategory(c.slug) && c.kind !== "utility")
    .map((c) => ({
      url: `${BASE}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  // Editorial collections — each /collections/[slug] is self-canonical and
  // indexable, but only the /collections index was listed, so the individual
  // collection pages never entered the sitemap. (audit SEO finding)
  const collections = COLLECTIONS.map((c) => ({
    url: `${BASE}/collections/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  // Civic-moment hubs (/moments/[slug]) — closed, prerendered set, indexable,
  // self-canonical. High-intent timely content ("the Fourth in Frederick
  // County") that was never advertised to crawlers. (audit 2026-07)
  const moments = CIVIC_MOMENTS.map((m) => ({
    url: `${BASE}/moments/${m.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  return [...top, ...munis, ...cats, ...collections, ...moments, ...places, ...events];
}
