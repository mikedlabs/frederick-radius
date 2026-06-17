import type { ReactNode } from "react";
import Link from "next/link";
import {
  Coffee,
  IceCream,
  Utensils,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  Martini,
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
  ParkingCircle,
  Train,
  Bus,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { CRAVINGS } from "@/data/cravings";
import { currentMeal } from "@/lib/meal";

/**
 * CravingStrip — the fast lane on Today.
 *
 * "I want ___ right now" as a tap-to-answer grid. Each tile deep-links into
 * /nearby with the craving preselected, so a person on the sidewalk goes
 * Today → tap "Ice cream" → nearest open one, in two taps.
 *
 * Styled to match the Today's Deals FIELD RECORDS so /today reads as one field
 * guide: every tile is a small FIELD TAG — aged paper + grain, a crisp
 * document radius, a filing-ink top tab rule, and a square ruled "specimen"
 * plate holding the glyph (engraved via an inset frame). One FieldTag
 * primitive drives all of them, so the whole "I want…" + "Getting around" set
 * is one custom, consistent voice. Server component (plain links).
 *
 * `locationSlot` rides on the RIGHT of the "I want…" bar (the page passes the
 * LocationPrime consent pill there); self-hides once granted.
 */
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  IceCream,
  Utensils,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  // Meal-occasion glyphs (the time-aware lead tile).
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
};

/** A single field tag — paper + grain, an ink top tab rule, a square ruled
 *  specimen plate for the glyph, a hairline ink frame. The `ink` is the
 *  item's specimen color; everything on the tag keys off it. */
function FieldTag({
  href,
  label,
  ariaLabel,
  icon: Icon,
  ink,
}: {
  href: string;
  label: ReactNode;
  ariaLabel: string;
  icon: LucideIcon;
  ink: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="tactile-interactive relative flex items-center gap-2 overflow-hidden rounded-[var(--app-radius-sm)] px-2.5 pb-2.5 pt-3"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        border: `1px solid color-mix(in srgb, ${ink} 30%, var(--app-border))`,
        boxShadow: "var(--app-elev-1), var(--app-hi)",
      }}
    >
      {/* Filing-ink top tab rule — the mini of the deal records' header band. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: ink }} />
      {/* Square ruled specimen plate — the engraved glyph in its own frame. */}
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px]"
        style={{
          background: `color-mix(in srgb, ${ink} 12%, var(--app-bg-elevated-solid))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 32%, transparent)`,
          color: ink,
        }}
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={2} />
      </span>
      <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {label}
      </span>
    </Link>
  );
}

export default function CravingStrip({
  locationSlot,
  contextSlot,
}: {
  locationSlot?: ReactNode;
  /** The thin "right now" contextual band (RightNowBand) — rides between the
   *  "I want…" bar and the grid, self-hides when nothing's on. */
  contextSlot?: ReactNode;
}) {
  // The meal occasion happening right now (Frederick clock). The tile
  // auto-relabels Breakfast → Lunch → Dinner (weekend Brunch, late-night
  // after 10pm), so a person only ever sees the meal that's actually on, and
  // the /nearby answer it opens is framed honestly as "open for [meal] now"
  // — never "serves [meal]", which we hold no data to claim.
  const meal = currentMeal();
  return (
    <div className="space-y-4">
    <section aria-labelledby="i-want-eyebrow" className="space-y-2">
      {/* One bar: the "I want…" prompt on the left, the location consent pill
          on the right — opposite ends of a single row, not two stacked spots.
          The pill self-hides once granted, leaving the prompt alone. */}
      <div className="flex min-h-[34px] items-center justify-between gap-3">
        <p id="i-want-eyebrow" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          I want…
        </p>
        {locationSlot}
      </div>
      {/* The "right now" contextual band (live music tonight, …) — a lighter
          layer than the grid; self-hides when nothing's on. */}
      {contextSlot}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Meal occasion — the time-aware lead. Auto-selects the meal it is
            right now; opens the nearest spots OPEN for it (a clock fact, never
            a menu claim). The owner's "I want breakfast/brunch/lunch/dinner". */}
        <FieldTag href={meal.href ?? `/nearby?c=${meal.key}`} label={meal.label} ariaLabel={meal.href ? `${meal.label}: verified spots` : `${meal.label}: nearest open now`} icon={ICONS[meal.icon] ?? Utensils} ink={meal.color} />
        {/* Happy hour — the most-asked-for local intent.
            Points at the /happy-hour view powered by the Field Notes layer. */}
        <FieldTag href="/happy-hour" label="Happy hour" ariaLabel="Happy hour" icon={Martini} ink="var(--app-accent)" />
        {CRAVINGS.map((c) => (
          <FieldTag
            key={c.key}
            href={`/nearby?c=${c.key}`}
            label={c.label}
            ariaLabel={`${c.label}: nearest open`}
            icon={ICONS[c.icon] ?? Utensils}
            ink={c.color}
          />
        ))}
        {/* The escape hatch to the full directory — "More…" never dead-ends a
            want that isn't a tile. Points at /places (the real directory: every
            category, town, and the map) — NOT /nearby, which is the location-
            gated, food-and-drink-only "right now" view and can't browse the
            rest of the guide. */}
        <FieldTag href="/places" label="More…" ariaLabel="More: browse the full directory" icon={MoreHorizontal} ink="var(--app-ink-3)" />
      </div>
    </section>

    {/* ── GETTING AROUND — the same field tags, their own eyebrow so "I want…
        the bus" no longer reads as a craving. Three short find-paths: where to
        park, the MARC train, the local TransIT bus. One cool filing ink (the
        getting-around family) so they read as a set. */}
    <section aria-labelledby="getting-around-eyebrow" className="space-y-2">
      <p id="getting-around-eyebrow" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Getting around
      </p>
      <div className="grid grid-cols-3 gap-2">
        <FieldTag href="/parking" label="Parking" ariaLabel="Parking" icon={ParkingCircle} ink="var(--app-cool)" />
        <FieldTag href="/transit" label="MARC" ariaLabel="MARC train" icon={Train} ink="var(--app-cool)" />
        <FieldTag href="/transit" label="Transit" ariaLabel="TransIT bus" icon={Bus} ink="var(--app-cool)" />
      </div>
    </section>
    </div>
  );
}
