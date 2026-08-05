/**
 * Owner-editorial featured events — the human override for the /events
 * lead card (July 2026 review: "featured should be editorial, not just
 * whatever the heuristic likes"). Mirrors the event-notices.json
 * pattern: a tiny hand-edited JSON, validated here so a phone-edit typo
 * degrades to "no feature" instead of a broken board.
 *
 * Pure module — callers pass the clock, nothing here reads one.
 */
import raw from "@/data/featured-events.json";
import { easternDayKey } from "@/lib/tz";

type FeaturedEntry = { slug?: unknown; expires?: unknown };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Pure resolver — exported for tests. Malformed or expired entries drop. */
export function resolveFeatured(list: unknown, now: Date): ReadonlySet<string> {
  const today = easternDayKey(now);
  const out = new Set<string>();
  if (!Array.isArray(list)) return out;
  for (const f of list as FeaturedEntry[]) {
    if (typeof f?.slug !== "string" || f.slug.length === 0) continue;
    if (typeof f?.expires !== "string" || !DAY_KEY.test(f.expires)) continue;
    // Day-key strings compare chronologically; expires is inclusive.
    if (f.expires >= today) out.add(f.slug);
  }
  return out;
}

/** Slugs featured as of `now` (Eastern), from src/data/featured-events.json. */
export function featuredEventSlugs(now: Date): ReadonlySet<string> {
  return resolveFeatured((raw as { featured?: unknown }).featured, now);
}
