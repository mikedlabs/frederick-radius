"use client";

import { useState } from "react";
import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, X } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles v5 — compact 4-up illustration-on-color tiles.
 *
 * v4 went big with 4:5 magazine-cover tiles — beautiful but the
 * color dominated the page. v5 keeps the same identity (intent
 * color + glass icon + serif label) but compresses to a single
 * 4-up row of square tiles so all four intents fit in one scroll
 * unit with way less visual weight. Same Klarna app-row pattern
 * but tuned for our four intents.
 *
 * Color gradients are slightly less saturated than v4 (more white
 * top-left, less black bottom-right) so the row reads as accent
 * cards rather than a wall of brand color.
 *
 * Utility row (Restroom + Parking) sits below in the existing
 * compact icon style.
 */

type IntentMood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
  intentKey: IntentKey;
};

type UtilityMood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
};

const intentColor = (k: IntentKey) =>
  INTENT_BY_KEY[k]?.color ?? "var(--app-brand)";

const INTENT_MOODS: IntentMood[] = [
  {
    intentKey: "coffee",
    label: "Coffee",
    nudge: "Roasters and cafes",
    href: "/browse?intent=coffee",
    icon: Coffee,
    color: intentColor("coffee"),
  },
  {
    intentKey: "eat",
    label: "Eat",
    nudge: "Restaurants and breweries",
    href: "/browse?intent=eat",
    icon: UtensilsCrossed,
    color: intentColor("eat"),
  },
  {
    intentKey: "outdoor",
    label: "Outdoors",
    nudge: "Parks, trails, water",
    href: "/browse?intent=outdoor",
    icon: Trees,
    color: intentColor("outdoor"),
  },
  {
    intentKey: "family",
    label: "With kids",
    nudge: "Family-friendly",
    href: "/browse?intent=family",
    icon: Baby,
    color: intentColor("family"),
  },
];

const UTILITY_MOODS: UtilityMood[] = [
  { label: "Restroom", nudge: "Public restrooms nearby",  href: "/amenities",        icon: Toilet,        color: "var(--app-cool)" },
  { label: "Parking",  nudge: "Garages, lots, on-street", href: "/category/parking", icon: ParkingCircle, color: "var(--app-ink-2)" },
];

/** Diagonal gradient using the intent color — lighter top-left into
 *  saturated bottom-right. v5 dials the gradient back from v4 so the
 *  compact tiles read as accent cards, not blocks of brand color. */
function gradientFor(color: string, active: boolean): string {
  if (active) {
    return `linear-gradient(155deg, color-mix(in srgb, ${color} 70%, white) 0%, ${color} 55%, color-mix(in srgb, ${color} 82%, black) 100%)`;
  }
  return `linear-gradient(155deg, color-mix(in srgb, ${color} 76%, white) 0%, ${color} 65%, color-mix(in srgb, ${color} 90%, black) 100%)`;
}

export default function MoodTiles() {
  const [openIntent, setOpenIntent] = useState<IntentKey | null>(null);

  const activeIntent =
    openIntent ? INTENTS.find((i) => i.key === openIntent) ?? null : null;
  const activeMood = activeIntent
    ? INTENT_MOODS.find((m) => m.intentKey === activeIntent.key) ?? null
    : null;
  const activeSubIntents = activeIntent?.subIntents ?? [];

  return (
    <section aria-label="What do you need right now">
      <h2 className="eyebrow mb-2.5" style={{ color: "var(--app-ink-3)" }}>
        What do you need right now
      </h2>

      {/* 4-up compact intent tiles — single row, square aspect, all
          four intents visible in one scroll unit. Color identity
          stays via the gradient + icon tint; label sits centered
          under the icon. */}
      <ul className="reveal-up grid grid-cols-4 gap-2">
        {INTENT_MOODS.map((m) => {
          const Icon = m.icon;
          const isActive = openIntent === m.intentKey;
          const isDimmed = openIntent !== null && !isActive;
          return (
            <li key={m.label}>
              <button
                type="button"
                onClick={() =>
                  setOpenIntent(isActive ? null : m.intentKey)
                }
                aria-expanded={isActive}
                aria-controls={isActive ? "mood-sub-tiles" : undefined}
                aria-label={`${m.label} — ${m.nudge}`}
                className="tactile tactile-interactive relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[var(--app-radius-md)] border p-2 text-center transition active:scale-[0.96]"
                style={{
                  borderColor: isActive
                    ? `color-mix(in srgb, ${m.color} 60%, black)`
                    : "var(--app-border)",
                  background: gradientFor(m.color, isActive),
                  boxShadow: isActive
                    ? `var(--app-elev-2), 0 0 0 1.5px ${m.color}, 0 10px 22px -8px color-mix(in srgb, ${m.color} 50%, transparent)`
                    : `var(--app-elev-1), 0 4px 12px -6px color-mix(in srgb, ${m.color} 35%, transparent)`,
                  opacity: isDimmed ? 0.55 : 1,
                }}
              >
                {/* Soft white scatter — bottom-right, much smaller than
                    v4 since the whole tile is smaller. */}
                <span
                  aria-hidden
                  className="absolute -right-4 -bottom-4 h-16 w-16 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 70%)",
                  }}
                />

                {/* White glass icon pill — centered, smaller than v4. */}
                <span
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.96)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow:
                      "0 3px 8px -2px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.7)",
                  }}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={2.25}
                    style={{ color: m.color }}
                  />
                </span>

                {/* Label — one line, sans serif, on the color. The
                    nudge drops at this size; aria-label carries the
                    full description for screen readers. */}
                <span
                  className="block max-w-full truncate text-[11.5px] font-semibold leading-none text-white"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                >
                  {m.label}
                </span>

                {/* Active-state X in top-right corner. */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full"
                    style={{
                      background: "rgba(0,0,0,0.5)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                    }}
                  >
                    <X className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Utility row — Restroom + Parking. These stay compact and
          functional; the photo / color treatment is for aspirational
          choices, not utilities. */}
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {UTILITY_MOODS.map((m) => {
          const Icon = m.icon;
          return (
            <li key={m.label}>
              <Link
                href={m.href}
                className="hover-lift flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  opacity: openIntent !== null ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                  }}
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

      {/* Sub-intent expand strip — unchanged behavior; visual tinted
          with the active tile's color. */}
      {activeIntent && activeMood && activeSubIntents.length > 0 && (
        <div
          id="mood-sub-tiles"
          className="reveal-up mt-3 rounded-[var(--app-radius-md)] border p-2.5"
          style={{
            borderColor: activeMood.color,
            background: `color-mix(in srgb, ${activeMood.color} 6%, var(--app-bg-elevated))`,
          }}
        >
          <p
            className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: activeMood.color }}
          >
            Narrow {activeMood.label}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            <li>
              <Link
                href={`/browse?intent=${activeIntent.key}`}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.96]"
                style={{ background: activeMood.color, color: "#fff" }}
              >
                All {activeMood.label.toLowerCase()}
              </Link>
            </li>
            {activeSubIntents.map((sub: SubIntent) => (
              <li key={sub.key}>
                <Link
                  href={`/browse?intent=${activeIntent.key}&sub=${sub.key}`}
                  className="inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.96]"
                  style={{
                    borderColor: activeMood.color,
                    background: "transparent",
                    color: activeMood.color,
                  }}
                >
                  {sub.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
