"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, X } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles v3 — photo-led intent tiles + a tight utility row.
 *
 * Inspired by the mobile reference batch (Postmates, Airbnb, Snoonu):
 * categories should read as PHOTOS first and labels second. v2 was a
 * 6-up grid of small icon-on-tint chips; v3 splits the surface into
 *
 *   • 4 photo-led intent tiles (Coffee · Eat · Outdoors · With kids).
 *     Full-bleed seasonal photo from /public/images/seasons/, dark
 *     gradient pulling a serif label up from the bottom, intent icon
 *     in a white glass pill top-left. Aspect 4:5 (taller than wide)
 *     so each tile reads like a magazine cover.
 *
 *   • 2 utility chips below (Restroom · Parking). Functional, not
 *     aspirational — tight icon+label rows in a single row, no photo.
 *
 *   • Sub-intent expand strip below the grid — unchanged behavior from
 *     v2. Tapping a photo tile expands the sub-tiles inline.
 *
 * Photos are hardcoded paths against known files in the manifest so
 * the component stays a client component (the expand state lives here)
 * without needing a server wrapper. Each mood gets a deliberately
 * different season so the four tiles together carry a year of
 * Frederick at a glance.
 */

type IntentMood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
  intentKey: IntentKey;
  photo: string;
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

// Photos drawn from the From Above book (interior pages, by season
// order in the manifest). The book runs roughly winter → spring →
// summer → autumn across pg-001 → pg-133, so each mood gets a photo
// from its season's quarter for a year of Frederick across the four
// tiles. From Above photos are 1200px curated drone shots — the
// /images/seasons/ folder had less consistent content for this use.
const INTENT_MOODS: IntentMood[] = [
  {
    intentKey: "coffee",
    label: "Coffee",
    nudge: "Roasters and cafes",
    href: "/browse?intent=coffee",
    icon: Coffee,
    color: intentColor("coffee"),
    photo: "/from-above/photos/pg-025-470a@1200.webp",
  },
  {
    intentKey: "eat",
    label: "Eat",
    nudge: "Restaurants and breweries",
    href: "/browse?intent=eat",
    icon: UtensilsCrossed,
    color: intentColor("eat"),
    photo: "/from-above/photos/pg-055-59f5@1200.webp",
  },
  {
    intentKey: "outdoor",
    label: "Outdoors",
    nudge: "Parks, trails, water",
    href: "/browse?intent=outdoor",
    icon: Trees,
    color: intentColor("outdoor"),
    photo: "/from-above/photos/pg-090-5356@1200.webp",
  },
  {
    intentKey: "family",
    label: "With kids",
    nudge: "Family-friendly",
    href: "/browse?intent=family",
    icon: Baby,
    color: intentColor("family"),
    photo: "/from-above/photos/pg-115-a5f4@1200.webp",
  },
];

const UTILITY_MOODS: UtilityMood[] = [
  { label: "Restroom", nudge: "Public restrooms nearby",  href: "/amenities",        icon: Toilet,        color: "var(--app-cool)" },
  { label: "Parking",  nudge: "Garages, lots, on-street", href: "/category/parking", icon: ParkingCircle, color: "var(--app-ink-2)" },
];

export default function MoodTiles() {
  // Track which intent tile is expanded. Null = no expansion.
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

      {/* 4 photo-led intent tiles — magazine-cover treatment. */}
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
                  borderColor: isActive ? m.color : "var(--app-border)",
                  boxShadow: isActive
                    ? `var(--app-elev-2), 0 0 0 1.5px ${m.color}`
                    : "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  opacity: isDimmed ? 0.5 : 1,
                }}
              >
                <Image
                  src={m.photo}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 280px"
                  className="object-cover"
                />
                {/* Dark gradient pulls the title up from the bottom and
                    leaves the photo readable at the top. Intent-color
                    tint bleeds in subtly when the tile is active. */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background: isActive
                      ? `linear-gradient(to top, color-mix(in srgb, ${m.color} 70%, rgba(0,0,0,0.85)) 0%, color-mix(in srgb, ${m.color} 28%, rgba(0,0,0,0.35)) 55%, transparent 100%)`
                      : "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 100%)",
                  }}
                />

                {/* Glass icon pill top-left — the chip from Airbnb's
                    "Guest favorite" pattern. Stays a constant white so
                    the icon reads on any photo. */}
                <span
                  aria-hidden
                  className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  <Icon
                    className="h-[16px] w-[16px]"
                    strokeWidth={2.25}
                    style={{ color: m.color }}
                  />
                </span>

                {/* Active-state X in top-right so a second tap reads as
                    "close" rather than "tap again to do something else". */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                    }}
                  >
                    <X className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                )}

                {/* Headline + nudge anchored to bottom. Serif headline,
                    sans nudge — same hierarchy as the page heros. */}
                <span className="absolute inset-x-0 bottom-0 space-y-0.5 p-3">
                  <span
                    className="block font-serif text-[19px] font-semibold leading-tight text-white sm:text-[20px]"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="block truncate text-[11px] leading-snug text-white/85"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                  >
                    {m.nudge}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Utility row — Restroom + Parking. These are functional, not
          aspirational, so they stay as compact icon chips below the
          photo grid. Two-up so they take only one row of vertical space. */}
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

      {/* Sub-intent expand strip — pops below both grids when a photo
          tile is active. Unchanged behavior from v2; visual treatment
          tweaked so it reads as a continuation of the active tile's
          color identity. */}
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
