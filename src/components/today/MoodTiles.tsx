import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle } from "lucide-react";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";

/**
 * MoodTiles — a 6-up affordance grid that answers "what do you need
 * right now?" with one tap into the right spatial view.
 *
 * Per master UI brief §1 (Today rebuild) and the pre-launch review:
 * a stranger landing on /now is rarely deciding from a blank slate.
 * They want a fast path into "what is near me / open / walkable" or
 * a fast practical answer (restroom, parking) — not a calendar of
 * events.
 *
 * History
 *   - C1 (pre-Apr): the original 4 tiles deep-linked to /browse with
 *     a matching intent pre-selected so the same row drives the
 *     spatial surface.
 *   - Pre-launch review (May): caught that the four moods skip the
 *     two most practical asks a stranger in downtown has — "where is
 *     a restroom" and "where can I park." Both already have first-
 *     class surfaces (Restroom is the headline kind on /amenities;
 *     Parking has its own category). Added as tiles 5 and 6 so the
 *     row becomes "what do you need" instead of "what mood are you
 *     in." Eyebrow copy updated to match.
 *
 * Visual model unchanged: paper-cream tile, hairline border,
 * category-tinted icon stamp, two-line label. Grid stays 2-col on
 * mobile so each tile reads cleanly; 3-col from sm: up so the row
 * doesn't dominate the page on wider phones / tablets.
 */

type Mood = {
  /** Display label in the user's voice. */
  label: string;
  /** Second line: the why or the promise. Under 30 chars. */
  nudge: string;
  /** Where the tile goes — usually /browse?intent=…, but the two
   *  practical tiles (Restroom, Parking) land on their canonical
   *  surfaces instead. */
  href: string;
  /** Lucide icon for the tinted stamp. */
  icon: typeof Coffee;
  /** Accent color. Either pulled from INTENT_BY_KEY (for intent tiles)
   *  or a literal token for the practical tiles. */
  color: string;
};

// Pull intent colors from the single source of truth so any future
// palette adjustment in intents.ts propagates automatically. Falls
// back to brand if a key is missing.
const intentColor = (k: IntentKey) =>
  INTENT_BY_KEY[k]?.color ?? "var(--app-brand)";

const MOODS: Mood[] = [
  { label: "Coffee",    nudge: "Roasters and cafes",        href: "/browse?intent=coffee",  icon: Coffee,            color: intentColor("coffee") },
  { label: "Eat",       nudge: "Restaurants and breweries", href: "/browse?intent=eat",     icon: UtensilsCrossed,   color: intentColor("eat") },
  { label: "Outdoors",  nudge: "Parks, trails, water",      href: "/browse?intent=outdoor", icon: Trees,             color: intentColor("outdoor") },
  { label: "With kids", nudge: "Family-friendly",           href: "/browse?intent=family",  icon: Baby,              color: intentColor("family") },
  // Practical tiles. Restroom links to /amenities where the public-
  // restroom layer is the headline kind. Parking links to its own
  // category page (garages, lots, street parking guidance).
  { label: "Restroom",  nudge: "Public restrooms nearby",   href: "/amenities",             icon: Toilet,            color: "var(--app-cool)" },
  { label: "Parking",   nudge: "Garages, lots, on-street",  href: "/category/parking",      icon: ParkingCircle,     color: "var(--app-ink-2)" },
];

export default function MoodTiles() {
  return (
    <section aria-label="What do you need right now">
      {/* Eyebrow reframed from "In the mood for" to "What do you need
          right now" — the pre-launch review's wording. Reads as a real
          question a stranger arrives with, not a vibe-check. */}
      <h2
        className="eyebrow mb-2.5"
        style={{ color: "var(--app-ink-3)" }}
      >
        What do you need right now
      </h2>
      <ul className="reveal-up grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MOODS.map((m) => {
          const Icon = m.icon;
          return (
            <li key={m.label}>
              <Link
                href={m.href}
                className="hover-lift flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                  }}
                  aria-hidden
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={2}
                    style={{ color: m.color }}
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
