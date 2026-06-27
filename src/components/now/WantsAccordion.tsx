"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Utensils,
  UtensilsCrossed,
  Coffee,
  IceCream,
  Cookie,
  ShoppingCart,
  Croissant,
  Beer,
  Wine,
  Martini,
  Trees,
  Mountain,
  Waves,
  Flag,
  Tractor,
  FerrisWheel,
  Music,
  Palette,
  Landmark,
  Route,
  ShoppingBag,
  ShoppingBasket,
  BookOpen,
  Sparkles,
  BedDouble,
  ParkingCircle,
  Train,
  Bus,
  Wrench,
  Activity,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { WANTS, type WantSub } from "@/data/wants";
import { craveTileStyle } from "./craveTile";
import { haptic } from "@/lib/haptics";

const ICONS: Record<string, LucideIcon> = {
  Utensils, UtensilsCrossed, Coffee, IceCream, Cookie, ShoppingCart, Croissant,
  Beer, Wine, Martini, Trees, Mountain, Waves, Flag, Tractor, FerrisWheel, Music,
  Palette, Landmark, Route, ShoppingBag, ShoppingBasket, BookOpen, Sparkles,
  BedDouble, ParkingCircle, Train, Bus, Wrench, Activity,
};

type SubWithHint = WantSub & { hint?: string };

/**
 * WantsAccordion — the "I want…" hierarchy.
 *
 * A row of MAIN category tiles (Eat · Drink · Outdoors · See & do · Shop ·
 * Wellness & stay · Get around); tapping one expands its subcategories inline as
 * chips. One open at a time, so the page stays a tidy contents page instead of a
 * 30-tile wall. Eat opens by default (the most common intent) and leads with a
 * TIME-AWARE "Restaurants — open for <meal> now" chip, so the meal occasion
 * lives inside Eat rather than as a confusing standalone tile next to Food.
 */
export default function WantsAccordion({
  meal,
}: {
  /** Current meal occasion (server-computed), injected as Eat's lead sub. */
  meal: { key: string; label: string; phrase: string };
}) {
  const [openKey, setOpenKey] = useState<string>("eat");

  const subsFor = (key: string): SubWithHint[] => {
    const cat = WANTS.find((c) => c.key === key);
    if (!cat) return [];
    if (cat.mealLead) {
      // The time-aware lead: "Restaurants — open for dinner now". Opens the
      // nearest spots OPEN for the current meal (a clock fact, not a menu claim).
      const lead: SubWithHint = {
        label: "Restaurants",
        icon: "UtensilsCrossed",
        href: `/nearby?c=${meal.key}`,
        hint: `open ${meal.phrase} now`,
      };
      return [lead, ...cat.subs];
    }
    return cat.subs;
  };

  return (
    <div className="space-y-2.5">
      {/* Main categories. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {WANTS.map((cat) => {
          const Icon = ICONS[cat.icon] ?? Utensils;
          const open = openKey === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              aria-expanded={open}
              onClick={() => {
                haptic("light");
                setOpenKey((k) => (k === cat.key ? "" : cat.key));
              }}
              className="tactile-interactive group relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[var(--app-radius-sm)] px-1.5 py-2.5 text-center"
              style={{
                ...craveTileStyle(cat.color),
                ...(open
                  ? { borderColor: `color-mix(in srgb, ${cat.color} 55%, var(--app-border))` }
                  : null),
              }}
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
                style={{
                  background: `color-mix(in srgb, ${cat.color} 16%, var(--app-bg-elevated))`,
                  color: `color-mix(in srgb, ${cat.color} 78%, var(--app-ink))`,
                }}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              <span
                className="font-mono text-[10.5px] font-semibold uppercase leading-tight tracking-[0.04em]"
                style={{ color: "var(--app-ink)" }}
              >
                {cat.label}
              </span>
              {cat.mealLead && (
                <span className="text-[9.5px] font-medium leading-none" style={{ color: "var(--app-ink-3)" }}>
                  {meal.label} now
                </span>
              )}
              <ChevronDown
                aria-hidden
                className="absolute right-1 top-1 h-3 w-3 transition-transform duration-200"
                style={{
                  color: "var(--app-ink-3)",
                  transform: open ? "rotate(180deg)" : "none",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Subcategories of the open main — chips that deep-link to the answer. */}
      {openKey && (
        <div
          className="rounded-[var(--app-radius-md)] border p-2.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          <div className="flex flex-wrap gap-1.5">
            {subsFor(openKey).map((sub) => {
              const SubIcon = ICONS[sub.icon] ?? Utensils;
              return (
                <Link
                  key={sub.href + sub.label}
                  href={sub.href}
                  className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink)",
                    boxShadow: "var(--app-elev-1), var(--app-hi)",
                  }}
                >
                  <SubIcon className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} aria-hidden />
                  {sub.label}
                  {sub.hint && (
                    <span style={{ color: "var(--app-ink-3)" }}>· {sub.hint}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
