"use client";

import { useState } from "react";
import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, X } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles v4 — illustration-on-color tiles, Klarna/Uber pattern.
 *
 * We tried photo backgrounds twice (random aerials, then From Above
 * book pages) and neither could differentiate Coffee from Eat from
 * Outdoors at a glance — same category of image carrying every tile.
 *
 * v4 drops the photo entirely and leans on each intent's brand color
 * as the visual identity: coffee = warm brown, eat = terra-cotta,
 * outdoor = forest green, family = warm gold. Each tile is a saturated
 * gradient in its intent color with a large white glass icon pill
 * floating top-left and a serif headline anchored bottom-left.
 *
 *   • Bolder than v2's icon-on-tint chip — the tile IS the color.
 *   • More differentiated than v3's photo tiles — color identity per
 *     category, not a generic "Frederick aerial" feel.
 *   • Same expand-in-place sub-intent behavior as v2/v3.
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

/** Diagonal gradient using the intent color — a slightly lighter
 *  top-left into the saturated color bottom-right. Produces depth
 *  without needing a photo. */
function gradientFor(color: string, active: boolean): string {
  if (active) {
    // Active state: even more saturated, with a darker base so the
    // tile reads as "engaged" without changing color identity.
    return `linear-gradient(155deg, color-mix(in srgb, ${color} 78%, white) 0%, ${color} 50%, color-mix(in srgb, ${color} 78%, black) 100%)`;
  }
  return `linear-gradient(155deg, color-mix(in srgb, ${color} 86%, white) 0%, ${color} 60%, color-mix(in srgb, ${color} 88%, black) 100%)`;
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

      {/* 4 color-led intent tiles. */}
      <ul className="reveal-up grid grid-cols-2 gap-2">
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
                className="tactile tactile-interactive relative block aspect-[4/5] w-full overflow-hidden rounded-[var(--app-radius-lg)] border text-left transition active:scale-[0.98]"
                style={{
                  borderColor: isActive
                    ? `color-mix(in srgb, ${m.color} 60%, black)`
                    : "var(--app-border)",
                  background: gradientFor(m.color, isActive),
                  boxShadow: isActive
                    ? `var(--app-elev-2), 0 0 0 1.5px ${m.color}, 0 14px 32px -10px color-mix(in srgb, ${m.color} 50%, transparent)`
                    : `var(--app-elev-1), 0 8px 22px -10px color-mix(in srgb, ${m.color} 40%, transparent)`,
                  opacity: isDimmed ? 0.55 : 1,
                }}
              >
                {/* Decorative scatter circles — large translucent rings
                    in the bottom-right that soften the solid gradient
                    and give the tile a hint of texture without
                    competing with the icon. Pure CSS, no asset weight. */}
                <span
                  aria-hidden
                  className="absolute -right-8 -bottom-10 h-32 w-32 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute -right-2 -top-8 h-20 w-20 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 65%)",
                  }}
                />

                {/* Big glass icon pill — top-left. White at high opacity
                    so the icon reads boldly on any intent color. */}
                <span
                  aria-hidden
                  className="absolute left-3 top-3 grid h-12 w-12 place-items-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.96)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow:
                      "0 6px 14px -4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.7)",
                  }}
                >
                  <Icon
                    className="h-6 w-6"
                    strokeWidth={2.25}
                    style={{ color: m.color }}
                  />
                </span>

                {/* Active-state X in top-right — second tap reads as
                    "close" rather than another action. */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full"
                    style={{
                      background: "rgba(0,0,0,0.42)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                    }}
                  >
                    <X className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                )}

                {/* Headline + nudge anchored to bottom-left. Cream-white
                    text on the colored gradient — same serif as the
                    rest of the editorial surface. */}
                <span className="absolute inset-x-0 bottom-0 space-y-0.5 p-3">
                  <span
                    className="block font-serif text-[20px] font-semibold leading-tight text-white sm:text-[22px]"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="block truncate text-[11.5px] font-medium leading-snug text-white/90"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                  >
                    {m.nudge}
                  </span>
                </span>
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
