/**
 * Event intents — the SMARTER main/sub taxonomy for /events.
 *
 * The old /events dumped ~25 place-categories alphabetically into one
 * single-select filter. This replaces that with seven human "what do you want
 * to do?" INTENTS (Music, Arts & culture, Food & drink, Family & kids, Sports,
 * Outdoors, Community) — each mapped from the category slugs events actually
 * carry — plus a tucked Civic lane. On top of the intent sit orthogonal,
 * COMPOSABLE sub-facets (free, audience, time-of-day, recurring, groups) so a
 * user can ask "free music for kids this weekend" in one query instead of the
 * impossible single-select grid.
 *
 * Pure + framework-free by design: every signal is derived from fields that
 * already exist on an event (category, is_free, audience[], starts_at,
 * is_recurring), so there is NO schema change and this is fully unit-testable.
 * Time-of-day reuses the Eastern-correct daypart() bucketer.
 */
import { daypart, type Daypart } from "@/lib/daypart";

export type IntentId =
  | "music"
  | "arts"
  | "food"
  | "family"
  | "sports"
  | "outdoors"
  | "community"
  | "civic";

export type EventIntent = {
  id: IntentId;
  /** Verb-first / plain label for the rail. */
  label: string;
  /** Lucide icon name (resolved by the client against an icon map). */
  icon: string;
  /** Category slugs that roll up into this intent. */
  categories: string[];
  /** Optional second-row sub-categories shown when the intent is selected.
   *  Each is a real category slug that appears under this intent. */
  subs?: Array<{ slug: string; label: string }>;
  /** Tucked = not shown in the primary rail (civic lane lives at the tail). */
  tucked?: boolean;
};

/**
 * The intent table, in rail order. `categories` includes place-category slugs
 * an event might carry (e.g. a "bar" trivia night, a "gallery" opening) so the
 * roll-up is forgiving. Anything unmapped falls back to "community" (the honest
 * catch-all), never disappears.
 */
export const EVENT_INTENTS: EventIntent[] = [
  {
    id: "music",
    label: "Music",
    icon: "Music",
    categories: ["music"],
  },
  {
    id: "arts",
    label: "Arts & culture",
    icon: "Palette",
    categories: ["arts", "gallery", "theater", "museum", "public-art"],
    subs: [
      { slug: "gallery", label: "Galleries" },
      { slug: "theater", label: "Theater" },
      { slug: "museum", label: "Museums" },
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    icon: "Utensils",
    categories: [
      "food", "restaurant", "coffee", "bar", "brewery", "winery",
      "distillery", "bakery", "pizza", "ice-cream", "food-truck", "market",
    ],
    subs: [
      { slug: "brewery", label: "Breweries" },
      { slug: "winery", label: "Wineries" },
      { slug: "market", label: "Markets" },
    ],
  },
  {
    id: "family",
    label: "Family & kids",
    icon: "Users",
    categories: ["family", "library"],
  },
  {
    id: "sports",
    label: "Sports",
    icon: "Activity",
    categories: ["sports"],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    icon: "Trees",
    categories: ["outdoors", "park", "trail", "playground", "golf", "agritourism"],
    subs: [
      { slug: "trail", label: "Trails" },
      { slug: "park", label: "Parks" },
      { slug: "agritourism", label: "Farms" },
    ],
  },
  {
    id: "community",
    label: "Community",
    icon: "Sparkles",
    // The catch-all draw intent: community events plus anything not claimed by
    // a sharper intent (wellness, shopping, services-hosted happenings, …).
    categories: ["community", "wellness", "yoga", "shopping", "antiques", "book-store"],
  },
  {
    id: "civic",
    label: "Government & notices",
    icon: "Landmark",
    categories: ["civic", "government", "public-safety", "voting", "worship"],
    tucked: true,
  },
];

/** Reverse index: category slug → intent id. Built once. */
const INTENT_BY_CATEGORY: Record<string, IntentId> = (() => {
  const m: Record<string, IntentId> = {};
  for (const intent of EVENT_INTENTS) {
    for (const c of intent.categories) m[c] = intent.id;
  }
  return m;
})();

export const INTENT_BY_ID: Record<IntentId, EventIntent> = Object.fromEntries(
  EVENT_INTENTS.map((i) => [i.id, i]),
) as Record<IntentId, EventIntent>;

/** The primary (non-tucked) intents, in rail order. */
export const PRIMARY_INTENTS: EventIntent[] = EVENT_INTENTS.filter((i) => !i.tucked);

/** Map a category slug to its intent. Unknown / empty → "community" (the
 *  honest catch-all), so an uncategorized event still has a home. */
export function intentForCategory(category: string | undefined | null): IntentId {
  if (!category) return "community";
  return INTENT_BY_CATEGORY[category] ?? "community";
}

// ── Composable sub-facets (orthogonal to the intent) ───────────────────────
// Minimal input shape so this stays decoupled from EventWithMeta and trivially
// testable; the loaders' EventWithMeta satisfies it structurally.
export type FacetEvent = {
  category?: string;
  is_free?: boolean;
  audience?: string[];
  starts_at?: string;
  is_recurring?: boolean;
};

export type AudienceKey = "kids-0-5" | "kids-6-12" | "adults" | "groups";

export function eventIntentOf(e: FacetEvent): IntentId {
  return intentForCategory(e.category);
}

export function isFreeEvent(e: FacetEvent): boolean {
  return e.is_free === true;
}

export function isRecurringEvent(e: FacetEvent): boolean {
  return e.is_recurring === true;
}

export function isForGroups(e: FacetEvent): boolean {
  return Array.isArray(e.audience) && e.audience.includes("groups");
}

export function audienceMatches(e: FacetEvent, key: AudienceKey): boolean {
  return Array.isArray(e.audience) && e.audience.includes(key);
}

export function isForKids(e: FacetEvent): boolean {
  return (
    e.category === "family" ||
    audienceMatches(e, "kids-0-5") ||
    audienceMatches(e, "kids-6-12")
  );
}

/** Time-of-day bucket of an event's start, Eastern-correct. Null when the
 *  start time is missing/unparseable. */
export function eventDaypart(e: FacetEvent): Daypart | null {
  if (!e.starts_at) return null;
  const d = new Date(e.starts_at);
  return Number.isFinite(d.getTime()) ? daypart(d) : null;
}

/** Count events per intent (for rail badges; omits empty intents upstream). */
export function countByIntent(events: FacetEvent[]): Record<IntentId, number> {
  const counts = Object.fromEntries(EVENT_INTENTS.map((i) => [i.id, 0])) as Record<IntentId, number>;
  for (const e of events) counts[eventIntentOf(e)] += 1;
  return counts;
}
