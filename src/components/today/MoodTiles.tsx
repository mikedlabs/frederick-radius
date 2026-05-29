"use client";

import Link from "next/link";
import { Coffee, Trees, UtensilsCrossed, Baby, Toilet, ParkingCircle } from "lucide-react";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";

/**
 * MoodTiles v8 — direct-to-map.
 *
 * v7 expanded each category tile in place into a sub-intent strip, so a
 * tap on "Coffee" never actually opened the map — and when the user did
 * finally navigate, the link pointed at /map?intent=coffee, which lands
 * on the Radius-first map (radius mode ignores ?intent entirely). The
 * category filter silently never engaged.
 *
 * v8 makes every category tile a single tap that opens the browse map
 * already filtered to that category: /map?mode=browse&intent=<key>. The
 * map centers on the user when we already know where they are (else
 * Downtown), auto-opens its results drawer, and lists the matching
 * places closest-first. Sub-narrowing (Roasters, Pizza, …) still lives
 * on the map's own intent chip strip, so nothing is lost by dropping the
 * in-place expand.
 *
 * Visual grammar is unchanged: matte paper "plates" with the category
 * color as an accent only (glyph chip, top hairline, faint watermark).
 * Utilities (Restroom, Parking) carry muted civic accents.
 */

type Mood = {
  label: string;
  nudge: string;
  href: string;
  icon: typeof Coffee;
  color: string;
};

const intentColor = (k: IntentKey) =>
  INTENT_BY_KEY[k]?.color ?? "var(--app-brand)";

// Category tiles route to the BROWSE map (mode=browse) so ?intent
// actually filters — the default radius map ignores it.
const intentHref = (k: IntentKey) => `/map?mode=browse&intent=${k}`;

const MOODS: Mood[] = [
  { label: "Coffee",    nudge: "Roasters and cafes",        href: intentHref("coffee"),  icon: Coffee,          color: intentColor("coffee")  },
  { label: "Eat",       nudge: "Restaurants and breweries", href: intentHref("eat"),     icon: UtensilsCrossed, color: intentColor("eat")     },
  { label: "Outdoors",  nudge: "Parks, trails, water",      href: intentHref("outdoor"), icon: Trees,           color: intentColor("outdoor") },
  { label: "With kids", nudge: "Family-friendly",           href: intentHref("family"),  icon: Baby,            color: intentColor("family")  },
  // Utility moods use muted civic accents (slate + warm ink).
  { label: "Restroom", nudge: "Public restrooms nearby",  href: "/amenities",        icon: Toilet,        color: "#2F5470" },
  { label: "Parking",  nudge: "Garages, lots, on-street", href: "/category/parking", icon: ParkingCircle, color: "#4A4844" },
];

export default function MoodTiles() {
  return (
    <section aria-label="What do you need right now">
      <h2 className="eyebrow mb-2.5" style={{ color: "var(--app-ink-3)" }}>
        What do you need right now
      </h2>

      {/* 6-up grid — 3 on mobile, 6 in a single row from sm+. Every
          tile is the same neutral paper plate; the category color is
          accent-only, so the row reads as one calm control surface.
          Each tile opens the map already filtered to that category. */}
      <ul className="reveal-up grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MOODS.map((m) => {
          const Icon = m.icon;
          const tileClass =
            "tactile-interactive relative flex h-[66px] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-md)] border p-1.5 text-center transition active:scale-[0.96]";
          const tileStyle = {
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          };

          return (
            <li key={m.label}>
              <Link
                href={m.href}
                aria-label={`${m.label} — ${m.nudge}`}
                className={tileClass}
                style={tileStyle}
              >
                {/* Top accent hairline — the only always-on color cue. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px]"
                  style={{ background: m.color, opacity: 0.45 }}
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
                  className="pointer-events-none absolute -bottom-2 -right-1 h-9 w-9"
                  strokeWidth={1.25}
                  style={{ color: m.color, opacity: 0.1 }}
                />

                {/* Accent glyph chip. */}
                <span
                  aria-hidden
                  className="relative grid h-6 w-6 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
                    color: m.color,
                  }}
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={2.25} />
                </span>

                <span
                  className="relative block max-w-full truncate text-[11px] font-semibold leading-none"
                  style={{ color: "var(--app-ink)" }}
                >
                  {m.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
