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
  type LucideIcon,
} from "lucide-react";
import { CRAVINGS } from "@/data/cravings";
import { currentMeal } from "@/lib/meal";
import { craveTileClass, craveTileStyle, CraveTileInner } from "./craveTile";
import MoreSheetTile from "./MoreSheetTile";

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

/** A single catalog tile — one uniform sheet of field-guide paper, an engraved
 *  ink glyph, a tiny mono specimen index. `accent` is honored ONLY when `lead`
 *  is set (the live-intel tiles: the meal + Happy hour); every other tile is
 *  calm near-monochrome ink, so the grid reads as one printed page, not a
 *  rainbow of app-launcher chips. */
function FieldTag({
  href,
  label,
  ariaLabel,
  icon: Icon,
  accent = "var(--app-ink-2)",
  index,
  lead = false,
}: {
  href: string;
  label: ReactNode;
  ariaLabel: string;
  icon: LucideIcon;
  accent?: string;
  index?: string;
  lead?: boolean;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className={craveTileClass} style={craveTileStyle(accent, lead)}>
      <CraveTileInner icon={Icon} label={label} accent={accent} index={index} lead={lead} />
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
      {/* The catalog grid. A continuous mono specimen index (01, 02, …) runs
          across the tiles so it reads as one printed page of a field guide.
          The two LIVE-INTEL leads (the meal occasion + Happy hour) are the
          only tiles that take the accent — everything else is calm ink. */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {/* Meal occasion — the time-aware lead. Auto-selects the meal it is
            right now; opens the nearest spots OPEN for it (a clock fact, never
            a menu claim). The owner's "I want breakfast/brunch/lunch/dinner". */}
        <FieldTag
          href={meal.href ?? `/nearby?c=${meal.key}`}
          label={meal.label}
          ariaLabel={meal.href ? `${meal.label}: verified spots` : `${meal.label}: nearest open now`}
          icon={ICONS[meal.icon] ?? Utensils}
          accent="var(--app-brand)"
          index="01"
          lead
        />
        {/* Happy hour — the most-asked-for local intent.
            Points at the /happy-hour view powered by the Field Notes layer. */}
        <FieldTag
          href="/happy-hour"
          label="Happy hour"
          ariaLabel="Happy hour"
          icon={Martini}
          accent="var(--app-accent)"
          index="02"
          lead
        />
        {CRAVINGS.map((c, i) => (
          <FieldTag
            key={c.key}
            href={`/nearby?c=${c.key}`}
            label={c.label}
            ariaLabel={`${c.label}: nearest open`}
            icon={ICONS[c.icon] ?? Utensils}
            index={String(i + 3).padStart(2, "0")}
          />
        ))}
        {/* "More…" opens the field-guide MORE drawer (the same one the header
            ••• button opens) — the full menu of every surface, the natural
            home for a want that isn't a tile. */}
        <MoreSheetTile index={String(CRAVINGS.length + 3).padStart(2, "0")} />
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
        <FieldTag href="/parking" label="Parking" ariaLabel="Parking" icon={ParkingCircle} index="G1" />
        <FieldTag href="/transit" label="MARC" ariaLabel="MARC train" icon={Train} index="G2" />
        <FieldTag href="/transit" label="Transit" ariaLabel="TransIT bus" icon={Bus} index="G3" />
      </div>
    </section>
    </div>
  );
}
