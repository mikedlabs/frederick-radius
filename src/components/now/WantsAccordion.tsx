"use client";

import { useEffect, useState } from "react";
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
  Heart,
  Library,
  Hotel,
  Film,
  Scissors,
  PawPrint,
  Church,
  Pill,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { WANTS, type WantSub } from "@/data/wants";
import { GLYPHS } from "@/components/glyphs";
import { getHomeMuni } from "@/lib/personalize";
import { haptic } from "@/lib/haptics";

const ICONS: Record<string, LucideIcon> = {
  Utensils, UtensilsCrossed, Coffee, IceCream, Cookie, ShoppingCart, Croissant,
  Beer, Wine, Martini, Trees, Mountain, Waves, Flag, Tractor, FerrisWheel, Music,
  Palette, Landmark, Route, ShoppingBag, ShoppingBasket, BookOpen, Sparkles,
  BedDouble, ParkingCircle, Train, Bus, Wrench, Activity, Pizza, FlaskConical,
  Armchair, Building2, Heart, Library, Hotel, Film, Scissors, PawPrint,
  Church, Pill,
};

/**
 * Bespoke engraved WOODCUT first (the app's signature mark), Lucide line-icon
 * fallback — the exact GLYPHS-first precedence CategoryIcon/craveTile use, so
 * Eat/Drink/Outdoors/Arts/Shop/Coffee/Pizza/Wine/Trails/Music/Libraries/… get
 * the engraved look and the long-tail degrades to a clean vector. */
function renderIcon(name: string, sizeClass: string) {
  const Glyph = GLYPHS[name];
  if (Glyph) return <Glyph className={sizeClass} aria-hidden />;
  const Icon = ICONS[name] ?? Utensils;
  return <Icon className={sizeClass} strokeWidth={1.9} aria-hidden />;
}

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
  // Home town (read post-mount, client-only). When set, the geo-aware /nearby
  // answers default to that town — so picking a town in the masthead actually
  // scopes what you find here. Curated/page links (/trails, /brunch…) are left
  // alone; only /nearby?c= answers take a town.
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage read; SSR can't see the home town
    setHomeSlug(getHomeMuni());
  }, []);
  const hrefFor = (href: string): string =>
    homeSlug && href.startsWith("/nearby?c=") ? `${href}&town=${homeSlug}` : href;

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
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {WANTS.map((cat) => {
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
                {renderIcon(cat.icon, "h-[22px] w-[22px]")}
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
          {/* Subs as a scannable mini-tile grid (engraved glyph + label), not a
              cramped chip wrap — easier to read and consistent with the mains.
              The time-aware Restaurants lead spans the row with its hint. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {subsFor(openKey).map((sub) => (
              <Link
                key={sub.href + sub.label}
                href={hrefFor(sub.href)}
                className={`tactile-interactive group/sub flex items-center gap-2.5 rounded-[var(--app-radius-sm)] p-2.5 ${
                  sub.lead ? "col-span-2 sm:col-span-3" : ""
                }`}
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
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                  style={{
                    background: `color-mix(in srgb, ${accent} ${sub.lead ? 22 : 14}%, var(--app-bg-elevated))`,
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
                    color: `color-mix(in srgb, ${accent} 80%, var(--app-ink))`,
                  }}
                >
                  {renderIcon(sub.icon, "h-[18px] w-[18px]")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${sub.lead ? "font-semibold" : "font-medium"}`}>
                    {sub.label}
                  </span>
                  {sub.hint && (
                    <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {sub.hint}
                    </span>
                  )}
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 opacity-30 transition-transform group-hover/sub:translate-x-0.5"
                  style={{ color: "var(--app-ink-3)" }}
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
