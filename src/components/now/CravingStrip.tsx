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
  Flag,
  Tractor,
  ParkingCircle,
  Train,
  Bus,
  type LucideIcon,
} from "lucide-react";
import { CRAVING_BY_KEY, type Craving } from "@/data/cravings";
import { currentMeal } from "@/lib/meal";
import { craveTileClass, craveTileStyle, CraveTileInner } from "./craveTile";

/**
 * CravingStrip — the fast lane on Today.
 *
 * "I want ___ right now" as a tap-to-answer set. Each tile deep-links into
 * /nearby with the craving preselected, so a person on the sidewalk goes
 * Today → tap "Ice cream" → nearest open one, in two taps.
 *
 * ORGANIZED, not a shuffled wall. The wants are bucketed into a handful of
 * named field-guide groups (Eat & drink, Out & about, Culture, Shops & stay,
 * Getting around), each with a quiet eyebrow. A want is always in the same
 * place, so the grid reads like a contents page you can scan — the opposite of
 * the old flat, moment-reordered tile wall where "Stay" moved every hour. The
 * one piece of in-the-moment intelligence we keep is the LEAD meal tile, which
 * still auto-relabels Breakfast → Lunch → Dinner (weekend Brunch, late-night).
 *
 * Styled to match the Today's Deals FIELD RECORDS so /today reads as one field
 * guide: every tile is a small FIELD TAG (one FieldTag primitive drives all of
 * them). Server component, no fetch — plain links, so it never blocks the shell.
 *
 * `locationSlot` rides on the RIGHT of the "I want…" bar (the page passes the
 * LocationPrime consent pill there); self-hides once granted. `contextSlot` is
 * the thin "right now" live band (RightNowBand), which follows the first group.
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
  Flag,
  Tractor,
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
 *  sheet, not a rainbow. */
function FieldTag({
  href,
  label,
  ariaLabel,
  icon: Icon,
  glyphName,
  ink,
}: {
  href: string;
  label: ReactNode;
  ariaLabel: string;
  icon: LucideIcon;
  /** Icon name; a bespoke engraved woodcut renders for it when one exists. */
  glyphName?: string;
  ink: string;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className={craveTileClass} style={craveTileStyle(ink)}>
      <CraveTileInner icon={Icon} glyphName={glyphName} label={label} ink={ink} />
    </Link>
  );
}

/** Render one craving (by key) as a field tag into /nearby. */
function CravingTile({ c }: { c: Craving }) {
  return (
    <FieldTag
      href={`/nearby?c=${c.key}`}
      label={c.label}
      ariaLabel={`${c.label}: nearest open`}
      icon={ICONS[c.icon] ?? Utensils}
      glyphName={c.icon}
      ink={c.color}
    />
  );
}

/** A named group of tiles — a quiet eyebrow over the shared specimen grid, so
 *  the whole fast lane reads as a small organized contents page. */
function CraveGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        {title}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{children}</div>
    </section>
  );
}

// The craving GROUPS — fixed order so a want is always where you left it. Each
// is a list of CRAVINGS keys (the meal/happy-hour/brunch leads are rendered
// into "Eat & drink" by hand since they're not plain cravings). Keep this in
// sync with src/data/cravings.ts: every craving key belongs to exactly one
// group, so nothing silently disappears from the grid.
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Eat & drink", keys: ["food", "coffee", "ice-cream", "grocery", "drinks", "breweries", "wineries"] },
  { title: "Out & about", keys: ["outside", "farms", "golf", "family"] },
  { title: "Culture", keys: ["music", "art"] },
  { title: "Shops & stay", keys: ["shops", "wellness", "stay"] },
];

export default function CravingStrip({
  locationSlot,
  contextSlot,
}: {
  locationSlot?: ReactNode;
  /** The thin "right now" contextual band (RightNowBand) — rides between the
   *  first group and the rest, self-hides when nothing's on. */
  contextSlot?: ReactNode;
}) {
  // The meal occasion happening right now (Frederick clock). The tile
  // auto-relabels Breakfast → Lunch → Dinner (weekend Brunch, late-night
  // after 10pm), so a person only ever sees the meal that's actually on, and
  // the /nearby answer it opens is framed honestly as "open for [meal] now"
  // — never "serves [meal]", which we hold no data to claim.
  const meal = currentMeal();
  const tiles = (keys: string[]) =>
    keys.map((k) => CRAVING_BY_KEY[k]).filter(Boolean).map((c) => <CravingTile key={c.key} c={c} />);

  return (
    <section aria-labelledby="i-want-eyebrow" className="space-y-5">
      {/* "I want…" is the page's primary action, so it reads as a confident
          serif lead (not a footnote eyebrow). The location consent pill sits at
          the opposite end and self-hides once granted. */}
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

      {/* EAT & DRINK — the leads come first: the time-aware meal occasion, then
          Happy hour and (unless it's already the meal) the curated Brunch set,
          then the food/drink wants. The two brand-ink leads carry the app
          accents; the rest carry their craving colors. */}
      <section className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Eat &amp; drink
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {/* Meal occasion — auto-selects the meal it is right now; opens the
              nearest spots OPEN for it (a clock fact, never a menu claim). */}
          <FieldTag
            href={meal.href ?? `/nearby?c=${meal.key}`}
            label={meal.label}
            ariaLabel={meal.href ? `${meal.label}: verified spots` : `${meal.label}: nearest open now`}
            icon={ICONS[meal.icon] ?? Utensils}
            glyphName={meal.icon}
            ink={meal.color}
          />
          {/* Happy hour — the most-asked-for local intent, via /happy-hour. */}
          <FieldTag href="/happy-hour" label="Happy hour" ariaLabel="Happy hour" icon={Martini} glyphName="Martini" ink="var(--app-accent)" />
          {/* Brunch — the verified /brunch moat as its own want. Suppressed
              when the meal tile is ALREADY Brunch so it never doubles. */}
          {meal.key !== "brunch" && (
            <FieldTag href="/brunch" label="Brunch" ariaLabel="Brunch: verified spots" icon={Croissant} glyphName="Croissant" ink="var(--app-brand-press)" />
          )}
          {tiles(GROUPS[0].keys)}
        </div>
      </section>

      {/* The "right now" contextual band (live music tonight, …) follows the
          first group: the fast lane leads, the time-specific live answer is
          supporting context beneath it. Self-hides when nothing's on. */}
      {contextSlot}

      {/* The remaining want groups — each a quiet eyebrow over the same grid. */}
      {GROUPS.slice(1).map((g) => (
        <CraveGroup key={g.title} title={g.title}>
          {tiles(g.keys)}
        </CraveGroup>
      ))}

      {/* ── GETTING AROUND — the same field tags, its own eyebrow so "I want…
          the bus" no longer reads as a craving. Three short find-paths: where
          to park, the MARC train, the local TransIT bus. One cool filing ink
          (the getting-around family) so they read as a set. */}
      <section className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Getting around
        </p>
        <div className="grid grid-cols-3 gap-2">
          <FieldTag href="/parking" label="Parking" ariaLabel="Parking" icon={ParkingCircle} glyphName="ParkingCircle" ink="var(--app-cool)" />
          <FieldTag href="/transit" label="MARC" ariaLabel="MARC train" icon={Train} glyphName="Train" ink="var(--app-cool)" />
          <FieldTag href="/transit" label="Transit" ariaLabel="TransIT bus" icon={Bus} glyphName="Bus" ink="var(--app-cool)" />
        </div>
      </section>
    </section>
  );
}
