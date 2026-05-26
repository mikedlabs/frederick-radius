import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby } from "lucide-react";

/**
 * MoodTiles — a 4-up affordance row that answers "what do you want
 * right now?" with one tap into a pre-filtered Radius view.
 *
 * Per master UI brief §1 (Today rebuild): a stranger landing on /today
 * is rarely deciding from a blank slate. They're already in one of a
 * few moods — coffee, outdoors, food, with-the-kids — and want a fast
 * path into the spatial answer ("what's near me / open / walkable?")
 * rather than reading a calendar of events.
 *
 * Each tile deep-links to /radius with a category pre-filter so the
 * Radius builder lands on the right scope without the user having to
 * configure it. Mode (walk/bike/drive) is left at the user's saved
 * default — we don't override their personal cadence.
 *
 * Visual model: paper-cream tile, hairline border, category-tinted
 * icon stamp, two-line label (mood + nudge). The tinted stamp is the
 * only color signal so the row stays calm against the Sky hero above.
 */

type Mood = {
  /** Display label — the mood name in the user's voice. */
  label: string;
  /** Second line — the why or the promise. Keep under 30 chars. */
  nudge: string;
  /** Lucide icon for the tinted stamp. */
  icon: typeof Coffee;
  /** Radius pre-filter href. Includes &q= to seed the search hint. */
  href: string;
  /** Stamp tint — pulled from the brand category palette. */
  color: string;
};

const MOODS: Mood[] = [
  {
    label: "Coffee",
    nudge: "Roasters + cafes",
    icon: Coffee,
    color: "#8B5A2B", // coffee brown (matches CHIP_GLYPH coffee)
    href: "/category/coffee",
  },
  {
    label: "Outdoors",
    nudge: "Parks, trails, water",
    icon: Trees,
    color: "#1E6B3A", // outdoors green (top-level category)
    href: "/category/outdoors",
  },
  {
    label: "Eat",
    nudge: "Restaurants + breweries",
    icon: UtensilsCrossed,
    color: "#A8462C", // Frederick brick (food category)
    href: "/category/food",
  },
  {
    label: "With kids",
    nudge: "Family-friendly",
    icon: Baby,
    color: "#C99632", // almanac gold (family category)
    href: "/category/family",
  },
];

export default function MoodTiles() {
  return (
    <section aria-label="Quick moods">
      {/* Two-line eyebrow so a stranger knows what the tile row is for.
          Quiet — it never competes with the section headings below. */}
      <h2
        className="eyebrow mb-2.5"
        style={{ color: "var(--app-ink-3)" }}
      >
        In the mood for
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
