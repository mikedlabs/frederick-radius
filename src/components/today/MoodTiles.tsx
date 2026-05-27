"use client";

import { useState } from "react";
import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle, ChevronRight } from "lucide-react";
import { INTENT_BY_KEY, INTENTS, type IntentKey, type SubIntent } from "@/data/intents";

/**
 * MoodTiles — 6-up affordance grid + in-place sub-tile expansion.
 *
 * Pre-launch this was a server-rendered 6-tile grid; every tile
 * deep-linked into /browse with a matching intent pre-selected. We
 * still do that for the practical tiles (Restroom, Parking) — those
 * have first-class destination surfaces — but the intent tiles
 * (Coffee, Eat, Outdoors, With kids) now EXPAND in place when tapped,
 * revealing the second-tier sub-intents that already live in
 * src/data/intents.ts. Tapping a sub-tile takes the user to
 * /browse?intent=...&sub=... so the two-tier nav we added on /browse
 * (the chip strip with banner + sub-strip) is reachable here too.
 *
 * Why in-place expansion: the user explicitly asked for "all three
 * bars" to have subheadings. /browse already does this with chips;
 * MoodTiles funnel INTO /browse but the user expected the sub-options
 * to read RIGHT HERE, not after a navigation. So when a user taps
 * "Eat" on /now, the tile expands and shows Restaurants · Pizza ·
 * Bars · Breweries · Wineries · Bakeries · Food trucks RIGHT THERE,
 * each linking to the right /browse?intent=eat&sub=… URL.
 *
 * Visual model: tap a tile → that tile stays, the OTHER tiles dim
 * slightly, and a sub-tile strip slides in below. Tap "X" or tap the
 * active tile again to collapse. Only one tile can be active at a
 * time (a second tap on another tile swaps the expansion).
 *
 * Practical tiles (Restroom, Parking) have no sub-intents so they
 * navigate directly when tapped — same behavior as before.
 */

type Mood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
  /** When set, this tile points at an intent that has subIntents in
   *  data/intents.ts — taps EXPAND instead of navigating. */
  intentKey?: IntentKey;
};

const intentColor = (k: IntentKey) =>
  INTENT_BY_KEY[k]?.color ?? "var(--app-brand)";

const MOODS: Mood[] = [
  { label: "Coffee",    nudge: "Roasters and cafes",        href: "/browse?intent=coffee",  icon: Coffee,            color: intentColor("coffee"),  intentKey: "coffee" },
  { label: "Eat",       nudge: "Restaurants and breweries", href: "/browse?intent=eat",     icon: UtensilsCrossed,   color: intentColor("eat"),     intentKey: "eat" },
  { label: "Outdoors",  nudge: "Parks, trails, water",      href: "/browse?intent=outdoor", icon: Trees,             color: intentColor("outdoor"), intentKey: "outdoor" },
  { label: "With kids", nudge: "Family-friendly",           href: "/browse?intent=family",  icon: Baby,              color: intentColor("family"),  intentKey: "family" },
  // Practical tiles — direct navigation, no sub-tile expansion.
  { label: "Restroom",  nudge: "Public restrooms nearby",   href: "/amenities",             icon: Toilet,            color: "var(--app-cool)" },
  { label: "Parking",   nudge: "Garages, lots, on-street",  href: "/category/parking",      icon: ParkingCircle,     color: "var(--app-ink-2)" },
];

export default function MoodTiles() {
  // Track which intent tile is expanded. Null = no expansion (the
  // default state matching the pre-expansion behavior).
  const [openIntent, setOpenIntent] = useState<IntentKey | null>(null);

  // Resolve the active mood + its sub-intents, if any. Falls back
  // to the raw subIntents array from /data/intents.ts so the labels
  // and match keys stay consistent with what /browse renders.
  const activeIntent =
    openIntent ? INTENTS.find((i) => i.key === openIntent) ?? null : null;
  const activeMood = activeIntent ? MOODS.find((m) => m.intentKey === activeIntent.key) ?? null : null;
  const activeSubIntents = activeIntent?.subIntents ?? [];

  return (
    <section aria-label="What do you need right now">
      <h2
        className="eyebrow mb-2.5"
        style={{ color: "var(--app-ink-3)" }}
      >
        What do you need right now
      </h2>
      <ul className="reveal-up grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MOODS.map((m) => {
          const Icon = m.icon;
          const isActive = openIntent === m.intentKey;
          const isDimmed = openIntent !== null && !isActive;
          const expandable = Boolean(m.intentKey);
          return (
            <li key={m.label}>
              {/* Expandable tiles render as buttons that toggle the
                  inline sub-tile strip. Practical tiles stay as Links
                  so the user lands directly on /amenities or
                  /category/parking. */}
              {expandable ? (
                <button
                  type="button"
                  onClick={() => setOpenIntent(isActive ? null : (m.intentKey ?? null))}
                  aria-expanded={isActive}
                  aria-controls={isActive ? "mood-sub-tiles" : undefined}
                  className="hover-lift flex w-full items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-left transition active:scale-[0.98]"
                  style={{
                    borderColor: isActive ? m.color : "var(--app-border)",
                    boxShadow: isActive
                      ? `var(--app-elev-2), 0 0 0 1px ${m.color}`
                      : "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                    opacity: isDimmed ? 0.55 : 1,
                  }}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{
                      background: isActive
                        ? m.color
                        : `color-mix(in srgb, ${m.color} 14%, transparent)`,
                    }}
                    aria-hidden
                  >
                    <Icon
                      className="h-[18px] w-[18px]"
                      strokeWidth={2}
                      style={{ color: isActive ? "#fff" : m.color }}
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
                  <ChevronRight
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 transition"
                    strokeWidth={2.25}
                    style={{
                      color: isActive ? m.color : "var(--app-ink-3)",
                      transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                </button>
              ) : (
                <Link
                  href={m.href}
                  className="hover-lift flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition"
                  style={{
                    borderColor: "var(--app-border)",
                    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                    opacity: isDimmed ? 0.55 : 1,
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
              )}
            </li>
          );
        })}
      </ul>

      {/* In-place sub-tile strip — appears below the main grid when
          a tile is expanded. Wraps to multiple lines as needed; each
          sub-tile deep-links into /browse with both the parent intent
          AND the sub-key, so the user lands on /browse with the chip
          strip already showing the right narrow filter. */}
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
              {/* "All" sub-link — opens /browse with the parent intent
                  alone (no sub filter). Pinned at the start so it's
                  always reachable. */}
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
