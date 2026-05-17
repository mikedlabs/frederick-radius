import type { MetadataRoute } from "next";
import { publicPlaces } from "@/lib/loaders/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const top: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/map`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/radius`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/saved`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
  ];
  const places = publicPlaces().map((p) => ({
    url: `${BASE}/places/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  const events = EVENTS.map((e) => ({
    url: `${BASE}/events/${e.slug}`,
    lastModified: now,
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
