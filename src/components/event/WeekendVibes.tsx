import {
  Music, Utensils, Baby, Palette, Trees, Building2, Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";

/**
 * WeekendVibes — groups a set of events by VIBE (music / food / family /
 * arts / outdoors / civic) rather than dumping them as one flat list.
 *
 * The tier brief calls for "This weekend" to read by feel, not by clock:
 * someone scanning the weekend wants "is there music? is there something
 * for the kids?" — not a 20-row chronological wall. Each vibe is a small
 * labelled cluster of glance cards; vibes with nothing this weekend
 * simply don't appear, so the grouping never invents an empty bucket.
 *
 * Pure presentation + server-rendered. The vibe is derived from the
 * event's existing category (a lossy-but-honest mapping) — no new data,
 * no fabricated grouping. Anything that doesn't map to a named vibe
 * falls into "More this weekend" so nothing is silently dropped.
 */

type Vibe = "music" | "food" | "family" | "arts" | "outdoors" | "civic" | "more";

const VIBE_ORDER: Vibe[] = [
  "music", "food", "family", "arts", "outdoors", "civic", "more",
];

const VIBE_META: Record<Vibe, { label: string; icon: LucideIcon; accent: string }> = {
  // Accents reuse the category palette from src/data/categories.ts so a
  // vibe header reads in the same color as its cards' left rail.
  music:    { label: "Music",    icon: Music,     accent: "#7E2C6F" },
  food:     { label: "Food & drink", icon: Utensils, accent: "#A8462C" },
  family:   { label: "Family",   icon: Baby,      accent: "#C99632" },
  arts:     { label: "Arts",     icon: Palette,   accent: "#7E2C6F" },
  outdoors: { label: "Outdoors", icon: Trees,     accent: "#1E6B3A" },
  civic:    { label: "Civic",    icon: Building2, accent: "#2F5470" },
  more:     { label: "More this weekend", icon: Sparkles, accent: "#8B6F4E" },
};

/** Map a category slug to a weekend vibe. Lossy by design — the point is
 *  a scannable feel, not a taxonomy. Unknown → "more" so it still shows. */
function vibeOf(category: string): Vibe {
  switch (category) {
    case "music":
      return "music";
    case "food":
    case "restaurant":
    case "coffee":
    case "bar":
    case "brewery":
    case "bakery":
    case "pizza":
    case "food-truck":
    case "market":
      return "food";
    case "family":
    case "library":
    case "playground":
      return "family";
    case "arts":
    case "museum":
    case "gallery":
    case "theater":
    case "public-art":
      return "arts";
    case "outdoors":
    case "park":
    case "trail":
    case "sports":
      return "outdoors";
    case "civic":
    case "government":
    case "community":
    case "worship":
      return "civic";
    default:
      return "more";
  }
}

export default function WeekendVibes({
  events,
  liveSlugs = [],
}: {
  events: EventWithMeta[];
  /** Slugs the live feed marks happening now — passed through to the
   *  glance cards so a live weekend event still pulses. */
  liveSlugs?: string[];
}) {
  if (events.length === 0) return null;
  const live = new Set(liveSlugs);

  // Bucket once, preserving the incoming (already chronological) order
  // within each vibe.
  const byVibe = new Map<Vibe, EventWithMeta[]>();
  for (const e of events) {
    const v = vibeOf(e.category);
    const arr = byVibe.get(v);
    if (arr) arr.push(e);
    else byVibe.set(v, [e]);
  }

  const groups = VIBE_ORDER.filter((v) => byVibe.has(v)).map((v) => ({
    vibe: v,
    ...VIBE_META[v],
    events: byVibe.get(v)!,
  }));

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const Icon = g.icon;
        return (
          <section key={g.vibe} className="space-y-2">
            <header className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-5 w-5 place-items-center rounded-[6px]"
                style={{
                  background: `color-mix(in srgb, ${g.accent} 16%, var(--app-bg-sunken))`,
                  color: g.accent,
                }}
              >
                <Icon className="h-3 w-3" strokeWidth={2.25} />
              </span>
              <h3
                className="text-[12px] font-bold uppercase tracking-[0.1em]"
                style={{ color: g.accent }}
              >
                {g.label}
              </h3>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {g.events.length}
              </span>
            </header>
            <ol className="space-y-2.5">
              {g.events.map((e) => (
                <li key={e.slug}>
                  <EventCard event={e} variant="glance" live={live.has(e.slug)} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
