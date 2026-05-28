"use client";

import { useState } from "react";
import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, X } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles v6 — 6-up unified compact grid.
 *
 * v5 still had two visual treatments (color tiles for intents,
 * white chips for utilities). v6 unifies all six in the same
 * compact color-led shape and drops them into one grid — 3-up on
 * mobile, 6-up on wider viewports. Every tile is the same size, so
 * the row reads as one cohesive surface instead of two clusters.
 *
 * Restroom + Parking pick up muted utility colors (Carroll Creek
 * slate + warm ink) so they're visibly the utility group without
 * matching the saturated intent four — same shape, quieter palette.
 */

type Mood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
  /** Only intent-typed moods expand in place — utilities navigate
   *  straight to their destination. */
  intentKey?: IntentKey;
};

const intentColor = (k: IntentKey) =>
  INTENT_BY_KEY[k]?.color ?? "var(--app-brand)";

const MOODS: Mood[] = [
  { intentKey: "coffee",  label: "Coffee",    nudge: "Roasters and cafes",        href: "/map?intent=coffee",  icon: Coffee,          color: intentColor("coffee")  },
  { intentKey: "eat",     label: "Eat",       nudge: "Restaurants and breweries", href: "/map?intent=eat",     icon: UtensilsCrossed, color: intentColor("eat")     },
  { intentKey: "outdoor", label: "Outdoors",  nudge: "Parks, trails, water",      href: "/map?intent=outdoor", icon: Trees,           color: intentColor("outdoor") },
  { intentKey: "family",  label: "With kids", nudge: "Family-friendly",           href: "/map?intent=family",  icon: Baby,            color: intentColor("family")  },
  // Utility moods use muted civic colors (slate + warm ink) so they
  // sit in the same row visually but read as the utility group.
  { label: "Restroom", nudge: "Public restrooms nearby",  href: "/amenities",        icon: Toilet,        color: "#2F5470" },
  { label: "Parking",  nudge: "Garages, lots, on-street", href: "/category/parking", icon: ParkingCircle, color: "#4A4844" },
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
    ? MOODS.find((m) => m.intentKey === activeIntent.key) ?? null
    : null;
  const activeSubIntents = activeIntent?.subIntents ?? [];

  return (
    <section aria-label="What do you need right now">
      <h2 className="eyebrow mb-2.5" style={{ color: "var(--app-ink-3)" }}>
        What do you need right now
      </h2>

      {/* 6-up grid — 3 on mobile, 6 in a single row from sm+ up.
          Every tile is the same compact square shape; intents carry
          saturated brand colors, utilities sit in muted civic colors
          so the row reads as one cohesive control surface. */}
      <ul className="reveal-up grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MOODS.map((m) => {
          const Icon = m.icon;
          const expandable = Boolean(m.intentKey);
          const isActive = expandable && openIntent === m.intentKey;
          const isDimmed = openIntent !== null && !isActive;
          const tileBody = (
            <>
              {/* Soft white scatter — bottom-right corner for a hint
                  of depth on the gradient. */}
              <span
                aria-hidden
                className="absolute -right-3 -bottom-3 h-12 w-12 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
                }}
              />

              {/* Smaller white glass icon pill — sized for the tighter
                  tile footprint. */}
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.96)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow:
                    "0 2px 6px -1px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              >
                <Icon
                  className="h-[16px] w-[16px]"
                  strokeWidth={2.25}
                  style={{ color: m.color }}
                />
              </span>

              <span
                className="block max-w-full truncate text-[11px] font-semibold leading-none text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
              >
                {m.label}
              </span>

              {isActive && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <X className="h-2 w-2 text-white" strokeWidth={2.5} />
                </span>
              )}
            </>
          );

          const tileClass =
            "tactile tactile-interactive relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[var(--app-radius-md)] border p-1.5 text-center transition active:scale-[0.96]";
          const tileStyle = {
            borderColor: isActive
              ? `color-mix(in srgb, ${m.color} 60%, black)`
              : "var(--app-border)",
            background: gradientFor(m.color, isActive),
            boxShadow: isActive
              ? `var(--app-elev-2), 0 0 0 1.5px ${m.color}, 0 8px 18px -8px color-mix(in srgb, ${m.color} 50%, transparent)`
              : `var(--app-elev-1), 0 3px 8px -4px color-mix(in srgb, ${m.color} 28%, transparent)`,
            opacity: isDimmed ? 0.55 : 1,
          };

          return (
            <li key={m.label}>
              {expandable ? (
                <button
                  type="button"
                  onClick={() => setOpenIntent(isActive ? null : (m.intentKey ?? null))}
                  aria-expanded={isActive}
                  aria-controls={isActive ? "mood-sub-tiles" : undefined}
                  aria-label={`${m.label} — ${m.nudge}`}
                  className={tileClass}
                  style={tileStyle}
                >
                  {tileBody}
                </button>
              ) : (
                <Link
                  href={m.href}
                  aria-label={`${m.label} — ${m.nudge}`}
                  className={tileClass}
                  style={tileStyle}
                >
                  {tileBody}
                </Link>
              )}
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
                href={`/map?intent=${activeIntent.key}`}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.96]"
                style={{ background: activeMood.color, color: "#fff" }}
              >
                All {activeMood.label.toLowerCase()}
              </Link>
            </li>
            {activeSubIntents.map((sub: SubIntent) => (
              <li key={sub.key}>
                <Link
                  href={`/map?intent=${activeIntent.key}&sub=${sub.key}`}
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
