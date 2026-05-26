import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby } from "lucide-react";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";

/**
 * MoodTiles — a 4-up affordance row that answers "what do you want
 * right now?" with one tap into the spatial view.
 *
 * Per master UI brief §1 (Today rebuild) and C1 in the polish push:
 * a stranger landing on /now is rarely deciding from a blank slate.
 * They are already in one of a few moods (coffee, outdoors, food,
 * with the kids) and want a fast path into the spatial answer
 * ("what is near me / open / walkable") rather than reading a
 * calendar of events.
 *
 * What changed in C1
 * - Each tile now deep-links to /browse with the matching intent
 *   pre-selected. The previous version pointed at /category/[slug],
 *   which lands the user on a list instead of the field guide's
 *   spatial surface. The /browse intent chip already exists; this
 *   ties the home page into it.
 * - The hardcoded MOODS array is gone. Color and matching are read
 *   from src/data/intents.ts so there is one source of truth across
 *   MoodTiles, MapIntentChips, /browse, and the search overlay.
 *   Only the friendly label and nudge live here, because they are a
 *   UI concern, not data.
 *
 * Visual model unchanged: paper-cream tile, hairline border,
 * category-tinted icon stamp, two-line label.
 */

type Mood = {
  /** Intent key used to filter /browse. Drives color + match logic. */
  intentKey: IntentKey;
  /** Display label in the user's voice. */
  label: string;
  /** Second line: the why or the promise. Under 30 chars. */
  nudge: string;
  /** Lucide icon for the tinted stamp. */
  icon: typeof Coffee;
};

const MOODS: Mood[] = [
  { intentKey: "coffee",  label: "Coffee",    nudge: "Roasters and cafes",        icon: Coffee },
  { intentKey: "outdoor", label: "Outdoors",  nudge: "Parks, trails, water",      icon: Trees },
  { intentKey: "eat",     label: "Eat",       nudge: "Restaurants and breweries", icon: UtensilsCrossed },
  { intentKey: "family",  label: "With kids", nudge: "Family-friendly",           icon: Baby },
];

export default function MoodTiles() {
  return (
    <section aria-label="Quick moods">
      {/* Two-line eyebrow so a stranger knows what the row is for.
          Quiet so it never competes with the section headings below. */}
      <h2
        className="eyebrow mb-2.5"
        style={{ color: "var(--app-ink-3)" }}
      >
        In the mood for
      </h2>
      <ul className="reveal-up grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MOODS.map((m) => {
          const Icon = m.icon;
          // Color comes from the canonical intent definition so a
          // future palette change in one place propagates everywhere.
          const color = INTENT_BY_KEY[m.intentKey]?.color ?? "var(--app-brand)";
          return (
            <li key={m.intentKey}>
              <Link
                href={`/browse?intent=${m.intentKey}`}
                className="hover-lift flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${color} 14%, transparent)`,
                  }}
                  aria-hidden
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={2}
                    style={{ color }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="block truncate text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {m.nudge}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
