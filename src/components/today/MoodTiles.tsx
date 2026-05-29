"use client";

import { useState } from "react";
import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, X } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles v7 — premium-neutral refresh.
 *
 * v6 filled each tile with a saturated color gradient, which read
 * cheap. v7 drops the color fills: the tiles are now matte paper
 * "plates" with tactile depth (the field-card grammar), and the
 * category color appears only as an ACCENT — the glyph chip, a top
 * hairline, and a faint oversized watermark of the tile's own icon.
 * Ink labels, not white-on-color. Restraint reads premium; one accent
 * per tile keeps the row from going rainbow.
 *
 * Utilities (Restroom, Parking) carry muted civic accents so they read
 * as the utility group within the same neutral shape.
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
  // Utility moods use muted civic accents (slate + warm ink).
  { label: "Restroom", nudge: "Public restrooms nearby",  href: "/amenities",        icon: Toilet,        color: "#2F5470" },
  { label: "Parking",  nudge: "Garages, lots, on-street", href: "/category/parking", icon: ParkingCircle, color: "#4A4844" },
];

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

      {/* 6-up grid — 3 on mobile, 6 in a single row from sm+. Every
          tile is the same neutral paper plate; the category color is
          accent-only, so the row reads as one calm control surface. */}
      <ul className="reveal-up grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MOODS.map((m) => {
          const Icon = m.icon;
          const expandable = Boolean(m.intentKey);
          const isActive = expandable && openIntent === m.intentKey;
          const isDimmed = openIntent !== null && !isActive;
          const tileBody = (
            <>
              {/* Top accent hairline — the only always-on color cue. */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{ background: m.color, opacity: isActive ? 1 : 0.45 }}
              />
              {/* Faint plate-dot texture, faded toward the bottom. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, color-mix(in srgb, var(--app-ink) 5%, transparent) 1px, transparent 1.3px)",
                  backgroundSize: "12px 12px",
                  maskImage: "linear-gradient(150deg, black, transparent 78%)",
                  WebkitMaskImage: "linear-gradient(150deg, black, transparent 78%)",
                }}
              />
              {/* Oversized accent glyph watermark bleeding off the corner. */}
              <Icon
                aria-hidden
                className="pointer-events-none absolute -bottom-3 -right-2 h-14 w-14"
                strokeWidth={1.25}
                style={{ color: m.color, opacity: 0.1 }}
              />

              {/* Accent glyph chip. */}
              <span
                aria-hidden
                className="relative grid h-8 w-8 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
                  color: m.color,
                }}
              >
                <Icon className="h-[16px] w-[16px]" strokeWidth={2.25} />
              </span>

              <span
                className="relative block max-w-full truncate text-[11px] font-semibold leading-none"
                style={{ color: "var(--app-ink)" }}
              >
                {m.label}
              </span>

              {isActive && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full"
                  style={{ background: "color-mix(in srgb, var(--app-ink) 12%, transparent)" }}
                >
                  <X className="h-2 w-2" strokeWidth={2.5} style={{ color: "var(--app-ink-2)" }} />
                </span>
              )}
            </>
          );

          const tileClass =
            "tactile-interactive relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[var(--app-radius-md)] border p-1.5 text-center transition active:scale-[0.96]";
          const tileStyle = {
            borderColor: isActive
              ? `color-mix(in srgb, ${m.color} 45%, var(--app-border))`
              : "var(--app-border)",
            background: isActive
              ? `color-mix(in srgb, ${m.color} 8%, var(--app-bg-elevated))`
              : "var(--app-bg-elevated)",
            boxShadow: isActive
              ? `var(--app-elev-2), 0 0 0 1.5px color-mix(in srgb, ${m.color} 55%, transparent)`
              : "var(--app-elev-1), var(--app-edge), var(--app-hi)",
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
