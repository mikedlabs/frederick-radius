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
  Wine,
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
  FerrisWheel,
  BedDouble,
  Sparkles,
  ParkingCircle,
  Train,
  Bus,
  type LucideIcon,
} from "lucide-react";
import { CRAVINGS, orderCravingsForMoment } from "@/data/cravings";
import { currentMeal } from "@/lib/meal";
import { easternParts } from "@/lib/tz";
import { getNwsForecast } from "@/lib/integrations/nws";
import { mentionsWet } from "@/lib/weather-verdict";
import { FREDERICK_CENTER } from "@/lib/geo";
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
  FerrisWheel,
  Wine,
  BedDouble,
  Sparkles,
  // Meal-occasion glyphs (the time-aware lead tile).
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
};

/** A single field tag — a pressed-paper seal (glyph in the item's ink) over a
 *  mono specimen caption, on one calm warm-paper stock. The `ink` is the item's
 *  signature color; it survives only in the seal + a faint border cast + the
 *  leader rule, never as a saturated fill, so the grid reads as one field-guide
 *  sheet, not a rainbow of app-launcher chips. */
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
    <Link href={href} aria-label={ariaLabel} className={craveTileClass} style={craveTileStyle(ink)}>
      <CraveTileInner icon={Icon} label={label} ink={ink} />
    </Link>
  );
}

export default async function CravingStrip({
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

  // Order the craving tiles for THIS moment — the same instinct the meal tile
  // follows, applied to the whole grid: coffee leads in the morning, drinks +
  // live music in the evening, Parks/Family fun on a weekend; when it's wet,
  // indoor wants rise and Parks sinks. Clock is server-side (no fetch); the
  // forecast is the same cached NWS call the hero uses, so `wet` is ~free and
  // degrades to false on any hiccup (time-only ordering still works).
  const { hour, weekday } = easternParts(new Date());
  const weekend = weekday === 0 || weekday === 6;
  const cur = (await getNwsForecast(FREDERICK_CENTER).catch(() => null))?.hourly?.[0] ?? null;
  const wet = cur ? mentionsWet(cur.shortForecast) || /thunder|storm/i.test(cur.shortForecast) : false;
  const cravings = orderCravingsForMoment(CRAVINGS, { hour, weekend, wet });

  return (
    <div className="space-y-4">
    <section aria-labelledby="i-want-eyebrow" className="space-y-2">
      {/* "I want…" is the page's primary action, so it reads as a confident
          serif lead (not a footnote eyebrow) — the contrast with the quiet
          "Getting around" eyebrow below signals where you start. The location
          consent pill sits at the opposite end and self-hides once granted. */}
      <div className="flex min-h-[34px] items-center justify-between gap-3">
        <h2
          id="i-want-eyebrow"
          className="font-serif text-[18px] font-semibold leading-none tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          I want…
        </h2>
        {locationSlot}
      </div>
      {/* The pressed-seal grid. Every tile is one calm field-guide seal; the
          item's own ink lives in the seal + leader rule so the sheet reads as a
          set, not a rainbow. The two LIVE-INTEL leads (the meal occasion +
          Happy hour) carry the brand inks, the rest their craving colors. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {/* Meal occasion — the time-aware lead. Auto-selects the meal it is
            right now; opens the nearest spots OPEN for it (a clock fact, never
            a menu claim). The owner's "I want breakfast/brunch/lunch/dinner". */}
        <FieldTag
          href={meal.href ?? `/nearby?c=${meal.key}`}
          label={meal.label}
          ariaLabel={meal.href ? `${meal.label}: verified spots` : `${meal.label}: nearest open now`}
          icon={ICONS[meal.icon] ?? Utensils}
          ink={meal.color}
        />
        {/* Happy hour — the most-asked-for local intent.
            Points at the /happy-hour view powered by the Field Notes layer. */}
        <FieldTag href="/happy-hour" label="Happy hour" ariaLabel="Happy hour" icon={Martini} ink="var(--app-accent)" />
        {/* Brunch — the verified /brunch moat surface as its own persistent
            want (a curated set, not a /nearby category). Suppressed when the
            meal tile is ALREADY Brunch (weekend mornings) so it never doubles. */}
        {meal.key !== "brunch" && (
          <FieldTag href="/brunch" label="Brunch" ariaLabel="Brunch: verified spots" icon={Croissant} ink="var(--app-brand-press)" />
        )}
        {cravings.map((c) => (
          <FieldTag
            key={c.key}
            href={`/nearby?c=${c.key}`}
            label={c.label}
            ariaLabel={`${c.label}: nearest open`}
            icon={ICONS[c.icon] ?? Utensils}
            ink={c.color}
          />
        ))}
        {/* "More…" opens the field-guide MORE drawer (the same one the header
            ••• button opens) — the full menu of every surface, the natural
            home for a want that isn't a tile. */}
        <MoreSheetTile ink="var(--app-ink-3)" />
      </div>
      {/* The "right now" contextual band (live music tonight, …) follows the
          universal nouns: the fast lane leads, the time-specific live answer is
          supporting context beneath it. Self-hides when nothing's on. */}
      {contextSlot}
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
