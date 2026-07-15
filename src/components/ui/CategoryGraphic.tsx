import {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building,
  CalendarDays, Church, Coffee, Cookie, DoorOpen, Droplets, GraduationCap,
  Hammer, Heart, HeartPulse, Hotel, Image as ImageIcon, Lamp, Landmark,
  Library, Mountain, Music, Palette, ParkingCircle, PawPrint, Pill,
  Pizza, Recycle, ShieldCheck, ShoppingBag, Sparkles, Tent, Theater,
  ToyBrick, Train, Trees, Truck, Utensils, UtensilsCrossed, Vote, Wifi,
  Wine, Wrench, MapPin,
} from "lucide-react";
import { ACCENTS, CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * CategoryGraphic — the visual baseline for any card that has no
 * photo. Renders a category-tinted gradient + a watermark category
 * icon + a seed-driven surface texture. A seed (slug, id, anything
 * stable) varies the hue, icon rotation, gradient angle, and which
 * texture overlays the gradient — so a shelf of no-photo cards reads
 * as a varied set, not a stack of stamped tiles.
 *
 * Four layers compose the graphic:
 *   1. Diagonal gradient: bright tinted corner → pure category color
 *      → deep variant. Angle varies by seed.
 *   2. Texture overlay: one of dots / topo rings / diagonal hatch /
 *      mesh grid, picked by seed. Mix-blend keeps it legible across
 *      both light and dark category colors.
 *   3. Soft sheen sweep across the bright corner.
 *   4. Watermark icon: the category's Lucide icon, large, low-opacity,
 *      rotated and anchored by seed for movement.
 *
 * Used by EventCard / PlaceCard / Tonight rail / news rows whenever
 * there is no real image to render.
 */

const ICONS: Record<string, typeof Coffee> = {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building,
  CalendarDays, Church, Coffee, Cookie, DoorOpen, Droplets, GraduationCap,
  Hammer, Heart, HeartPulse, Hotel, ImageIcon, Lamp, Landmark, Library,
  Mountain, Music, Palette, ParkingCircle, PawPrint, Pill, Pizza, Recycle,
  ShieldCheck, ShoppingBag, Sparkles, Tent, Theater, ToyBrick, Train,
  Trees, Truck, Utensils, UtensilsCrossed, Vote, Wifi, Wine, Wrench,
};

// Fallback palette for events / places with no matching category in
// CATEGORY_BY_SLUG. Picked by seed so a shelf of unknown-category
// cards still reads as a varied set of POSTERS instead of "we don't
// know" grey rectangles. Pulls brand-aligned colors only (no
// red/yellow that read as warnings).
const FALLBACK_PALETTE = [
  { color: ACCENTS.slate, icon: Sparkles },    // slate — events
  { color: "#A04A3E", icon: GraduationCap },   // brick — civic / graduations
  { color: ACCENTS.catoctin, icon: Trees },    // catoctin green — outdoor
  { color: ACCENTS.amber, icon: Music },       // amber — music
  { color: "#5B4B7C", icon: Theater },         // muted plum — arts
  { color: "#3F6E7F", icon: BookOpen },        // teal — community
];

/** Deterministic hash of a seed string → 32-bit int. djb2 variant. */
function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Resolve a category slug + seed to its color + icon component. Known
 *  categories get their declared identity; unknown / empty slugs pick
 *  from a brand-aligned fallback palette by seed so a shelf of
 *  category-less cards still reads as varied posters, not "unknown"
 *  grey blanks. */
function resolve(
  slug: string,
  seedH: number,
): { color: string; Icon: typeof Coffee } {
  const def = CATEGORY_BY_SLUG[slug];
  if (def) {
    const color = def.color ?? "#7A7975";
    const iconName = def.icon;
    const Icon = (iconName && ICONS[iconName]) || MapPin;
    return { color, Icon };
  }
  // Unknown category — pick a fallback poster by seed so each row in
  // a shelf gets its own color/glyph identity instead of grey + pin.
  const pick = FALLBACK_PALETTE[seedH % FALLBACK_PALETTE.length];
  return { color: pick.color, Icon: pick.icon };
}

/** Seven textures now — was four, expanded so a shelf of no-photo
 *  cards reads as a real set instead of repeating. Each variant uses
 *  white at low alpha + mix-blend so it works against any hue. */
type Texture = "dots" | "topo" | "hatch" | "mesh" | "confetti" | "wave" | "stripes";

function pickTexture(h: number): Texture {
  const r = (h >> 17) % 14;
  if (r < 3) return "dots";
  if (r < 5) return "topo";
  if (r < 7) return "hatch";
  if (r < 9) return "mesh";
  if (r < 11) return "confetti";
  if (r < 13) return "wave";
  return "stripes";
}

/** The texture sits over the colored gradient. Each variant uses
 *  white at low alpha + mix-blend so it works against any hue. */
function textureStyle(texture: Texture): React.CSSProperties {
  switch (texture) {
    case "topo":
      // Concentric elliptical rings, like contour lines on a USGS
      // map. Anchored off-center so the rings sweep across the card.
      return {
        backgroundImage: [
          "radial-gradient(ellipse 60% 45% at 25% 35%, transparent 49%, rgba(255,255,255,0.18) 50%, transparent 51%)",
          "radial-gradient(ellipse 50% 38% at 25% 35%, transparent 49%, rgba(255,255,255,0.14) 50%, transparent 51%)",
          "radial-gradient(ellipse 40% 30% at 25% 35%, transparent 49%, rgba(255,255,255,0.10) 50%, transparent 51%)",
        ].join(","),
        mixBlendMode: "overlay",
      };
    case "hatch":
      // Diagonal pinstripe — quiet movement, reads as letterpress.
      return {
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 8px)",
        mixBlendMode: "overlay",
      };
    case "mesh":
      // Crosshatch grid — like the back of a field-notebook page.
      return {
        backgroundImage: [
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 14px)",
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 14px)",
        ].join(","),
        mixBlendMode: "overlay",
      };
    case "confetti":
      // Scattered offset dots — bigger dots on an angled grid that
      // adds movement without obvious repetition. Good for "fun"
      // categories (events, music, brewery) where pinstripe feels
      // too restrained.
      return {
        backgroundImage: [
          "radial-gradient(rgba(255,255,255,0.30) 2px, transparent 2.5px)",
          "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1.5px)",
        ].join(","),
        backgroundSize: "22px 22px, 14px 14px",
        backgroundPosition: "0 0, 7px 11px",
        mixBlendMode: "overlay",
      };
    case "wave":
      // Soft sine bands — broad horizontal stripes with feathered
      // edges that suggest motion across the card.
      return {
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0 12px, rgba(255,255,255,0.10) 12px 18px, transparent 18px 30px)",
        mixBlendMode: "overlay",
      };
    case "stripes":
      // Vertical wide stripes — quiet rhythm, reads as ticket
      // stub or letterhead.
      return {
        backgroundImage:
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 16px)",
        mixBlendMode: "overlay",
      };
    case "dots":
    default:
      return {
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)",
        backgroundSize: "10px 10px",
        mixBlendMode: "overlay",
      };
  }
}

export default function CategoryGraphic({
  category,
  seed,
  className = "",
  ariaHidden = true,
}: {
  /** Category slug (food, music, park, etc.). Looks up color + icon
   *  via CATEGORY_BY_SLUG. Unknown slugs render a neutral grey card. */
  category: string;
  /** Anything stable per-card — slug, id, name. Drives the hue
   *  shift, icon rotation, gradient angle, and texture so two
   *  cards aren't identical. */
  seed: string;
  className?: string;
  /** Default true since this is decorative; set false if the
   *  graphic IS conveying meaning (rare). */
  ariaHidden?: boolean;
}) {
  const h = seedHash(seed);
  const { color, Icon } = resolve(category, h);

  // Pull a sibling hue rotation in [-25, +25] for the gradient's
  // second stop so the card has depth without going off-brand.
  const hueShift = ((h % 51) - 25);
  // Rotate the watermark icon in [-15, +15] degrees so a shelf of
  // cards doesn't look stamped.
  const iconRotate = ((h >> 5) % 31) - 15;
  // Vary the icon's anchor: top-right, bottom-right, center-right.
  const iconAnchor = (h >> 11) % 3;
  // Vary icon scale in [130%, 170%] so some cards lean iconic and
  // others lean atmospheric.
  const iconScale = 130 + ((h >> 13) % 41);

  // Drive the gradient with the hueShift seed too — it modulates how
  // much white the bright corner gets so two cards aren't identical.
  const brightMix = 45 + ((Math.abs(hueShift)) % 18); // 45–62%

  // Vary the gradient angle across four diagonals. 140° is the
  // "default" feel; the others sweep the bright corner around the
  // card so adjacent tiles don't echo each other.
  const angles = [110, 140, 170, 200];
  const gradientAngle = angles[(h >> 7) % angles.length];

  const texture = pickTexture(h);

  // The root fills its card slot via `absolute inset-0`. It must NOT
  // be `relative`: every child below is absolutely positioned, so a
  // relative root with no height of its own collapses to 0 and the
  // card renders blank under its scrim.
  return (
    <div
      aria-hidden={ariaHidden}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{
        // Three-stop diagonal:
        //   - 0%   bright tinted corner (color + white) so the card
        //          actually CATCHES light against a dark theme
        //   - 50%  pure category color (the "real" identity)
        //   - 100% deep variant fading toward the page background
        background: `linear-gradient(${gradientAngle}deg,
          color-mix(in srgb, ${color} ${brightMix}%, #ffffff) 0%,
          ${color} 50%,
          color-mix(in srgb, ${color} 28%, #0d0c14) 100%)`,
      }}
    >
      {/* Texture layer — dots / topo / hatch / mesh, picked by seed.
       *  Mix-blend keeps the pattern legible across both light and
       *  dark colors. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={textureStyle(texture)}
      />
      {/* Soft sheen sweep across the bright corner — same direction
       *  family as the gradient so the highlight reads as one light
       *  source. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${gradientAngle - 5}deg, rgba(255,255,255,0.18), transparent 40%)`,
        }}
      />
      {/* Watermark icon — big enough to read at small card sizes.
       *  White at 32% so it punches against the colored gradient
       *  but still steps aside for the title that overlays on top. */}
      <Icon
        className="pointer-events-none absolute"
        strokeWidth={1}
        style={{
          color: "#fff",
          opacity: 0.32,
          width: `${iconScale}%`,
          height: `${iconScale}%`,
          top: iconAnchor === 0 ? "-35%" : iconAnchor === 1 ? "5%" : "-15%",
          right: "-30%",
          transform: `rotate(${iconRotate}deg)`,
        }}
      />
    </div>
  );
}
