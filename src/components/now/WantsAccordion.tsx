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
  Pizza,
  FlaskConical,
  Armchair,
  Building2,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { WANTS, type WantSub } from "@/data/wants";
import { haptic } from "@/lib/haptics";

const ICONS: Record<string, LucideIcon> = {
  Utensils, UtensilsCrossed, Coffee, IceCream, Cookie, ShoppingCart, Croissant,
  Beer, Wine, Martini, Trees, Mountain, Waves, Flag, Tractor, FerrisWheel, Music,
  Palette, Landmark, Route, ShoppingBag, ShoppingBasket, BookOpen, Sparkles,
  BedDouble, ParkingCircle, Train, Bus, Wrench, Activity, Pizza, FlaskConical,
  Armchair, Building2,
};

type SubWithHint = WantSub & { hint?: string; lead?: boolean };

/**
 * WantsAccordion — the "I want…" hierarchy, in the field-guide voice.
 *
 * A row of MAIN category specimen-plates; tapping one opens its subcategory
 * drawer beneath the grid. One open at a time. Premium treatment: each main is a
 * matted engraved seal on one calm paper sheet (no per-tile color fills — the
 * category's ink survives only in the seal + accents, never confetti), the OPEN
 * one lifts and grows a connective accent bar into its drawer, and the drawer
 * reveals with a soft entrance. Eat opens by default and leads with the
 * time-aware "Restaurants — open for dinner now" so the meal lives inside Eat.
 */
export default function WantsAccordion({
  meal,
  defaultOpen = "eat",
}: {
  meal: { key: string; label: string; phrase: string };
  defaultOpen?: string;
}) {
  const [openKey, setOpenKey] = useState<string>(defaultOpen);

  const openCat = WANTS.find((c) => c.key === openKey) ?? null;
  const accent = openCat?.color ?? "var(--app-brand)";

  const subsFor = (key: string): SubWithHint[] => {
    const cat = WANTS.find((c) => c.key === key);
    if (!cat) return [];
    if (cat.mealLead) {
      const lead: SubWithHint = {
        label: "Restaurants",
        icon: "UtensilsCrossed",
        href: `/nearby?c=${meal.key}`,
        hint: `open ${meal.phrase} now`,
        lead: true,
      };
      return [lead, ...cat.subs];
    }
    return cat.subs;
  };

  return (
    <div className="space-y-2.5">
      {/* Main categories — engraved specimen plates. */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {WANTS.map((cat) => {
          const Icon = ICONS[cat.icon] ?? Utensils;
          const open = openKey === cat.key;
          const ink = cat.color;
          return (
            <button
              key={cat.key}
              type="button"
              aria-expanded={open}
              onClick={() => {
                haptic("light");
                setOpenKey((k) => (k === cat.key ? "" : cat.key));
              }}
              className="tactile-interactive group relative flex min-h-[82px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[var(--app-radius-sm)] px-1 py-2.5 text-center transition-transform"
              style={{
                backgroundColor: `color-mix(in srgb, ${ink} ${open ? 9 : 5}%, var(--app-bg-elevated-solid))`,
                backgroundImage: "var(--app-paper-light)",
                border: `1px solid color-mix(in srgb, ${ink} ${open ? 42 : 16}%, var(--app-border))`,
                boxShadow: open
                  ? `var(--app-elev-2), var(--app-hi)`
                  : `var(--app-elev-1), var(--app-hi)`,
                transform: open ? "translateY(-1px)" : undefined,
              }}
            >
              {/* Matted engraved seal: ink wash, inset hairline, paper mount
                  ring, soft ink lift. Deepens when the plate is open. */}
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-colors"
                style={{
                  background: `color-mix(in srgb, ${ink} ${open ? 24 : 15}%, var(--app-bg-elevated))`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 10%, transparent), 0 0 0 3px var(--app-bg-elevated-solid), var(--app-hi)`,
                  color: `color-mix(in srgb, ${ink} ${open ? 88 : 74}%, var(--app-ink))`,
                }}
              >
                <Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
              </span>
              <span
                className="font-mono text-[10px] font-semibold uppercase leading-tight tracking-[0.03em]"
                style={{ color: "var(--app-ink)" }}
              >
                {cat.label}
              </span>
              {cat.mealLead && (
                <span className="text-[9px] font-medium leading-none" style={{ color: "var(--app-ink-3)" }}>
                  {meal.label} now
                </span>
              )}
              {/* Connective accent bar — grows along the bottom of the open
                  plate, tying it to the drawer below. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[2.5px] origin-center transition-transform duration-200"
                style={{
                  background: `color-mix(in srgb, ${ink} 70%, var(--app-border))`,
                  transform: open ? "scaleX(1)" : "scaleX(0)",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Subcategory drawer — keyed faintly to the open category's ink, with a
          soft entrance on change (remounts via key). */}
      {openCat && (
        <div
          key={openKey}
          className="breathe-in rounded-[var(--app-radius-md)] border p-2.5"
          style={{
            borderColor: `color-mix(in srgb, ${accent} 26%, var(--app-border))`,
            background: `color-mix(in srgb, ${accent} 5%, var(--app-bg-sunken))`,
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {subsFor(openKey).map((sub) => {
              const SubIcon = ICONS[sub.icon] ?? Utensils;
              return (
                <Link
                  key={sub.href + sub.label}
                  href={sub.href}
                  className="tactile-interactive group/sub inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium"
                  style={{
                    border: sub.lead
                      ? `1px solid color-mix(in srgb, ${accent} 45%, var(--app-border))`
                      : "1px solid var(--app-border)",
                    background: sub.lead
                      ? `color-mix(in srgb, ${accent} 12%, var(--app-bg-elevated))`
                      : "var(--app-bg-elevated)",
                    color: "var(--app-ink)",
                    boxShadow: "var(--app-elev-1), var(--app-hi)",
                  }}
                >
                  <span
                    aria-hidden
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${accent} ${sub.lead ? 22 : 14}%, var(--app-bg-elevated))`,
                      color: `color-mix(in srgb, ${accent} 80%, var(--app-ink))`,
                    }}
                  >
                    <SubIcon className="h-[14px] w-[14px]" strokeWidth={2} />
                  </span>
                  <span className={sub.lead ? "font-semibold" : undefined}>{sub.label}</span>
                  {sub.hint && (
                    <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>
                      · {sub.hint}
                    </span>
                  )}
                  <ChevronRight
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-60"
                    style={{ color: "var(--app-ink-3)" }}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
