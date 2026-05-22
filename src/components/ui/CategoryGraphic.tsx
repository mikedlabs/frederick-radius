import {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building,
  Calendar, Church, Coffee, Cookie, DoorOpen, Droplets, Hammer, Heart,
  HeartPulse, Hotel, Image as ImageIcon, Lamp, Landmark, Library,
  Mountain, Music, Palette, ParkingCircle, PawPrint, Pill,
  Pizza, Recycle, ShieldCheck, ShoppingBag, Tent, Theater, ToyBrick,
  Train, Trees, Truck, Utensils, UtensilsCrossed, Vote, Wifi, Wine,
  Wrench, MapPin,
} from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * CategoryGraphic — the visual baseline for any card that has no
 * photo. Renders a category-tinted gradient + a watermark category
 * icon + a subtle dot grid. A seed (slug, id, anything stable)
 * varies the hue and icon rotation across cards so a shelf of
 * no-photo cards doesn't read as a stack of identical tiles.
 *
 * Two layers compose the graphic:
 *   1. Conic gradient: category color → cooler sibling hue, anchored
 *      by the seed so the same place always gets the same look.
 *   2. Dot grid overlay: subtle texture that catches the eye without
 *      stealing attention from the title sitting on top.
 *   3. Watermark icon: the category's Lucide icon, large, low-opacity,
 *      rotated by ~10° for movement.
 *
 * Used by EventCard / PlaceCard / Tonight rail / news rows whenever
 * there is no real image to render.
 */

const ICONS: Record<string, typeof Coffee> = {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building,
  Church, Coffee, Cookie, DoorOpen, Droplets, Hammer, Heart, HeartPulse,
  Hotel, ImageIcon, Lamp, Landmark, Library, Mountain, Music, Palette,
  ParkingCircle, PawPrint, Pill, Pizza, Recycle, ShieldCheck,
  ShoppingBag, Tent, Theater, ToyBrick, Train, Trees, Truck, Utensils,
  UtensilsCrossed, Vote, Wifi, Wine, Wrench,
};

/** Deterministic hash of a seed string → 32-bit int. djb2 variant. */
function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Resolve a category slug to its color + icon component, with sane
 *  fallbacks so an unknown slug never breaks the graphic. */
function resolve(slug: string): { color: string; Icon: typeof Coffee } {
  const def = CATEGORY_BY_SLUG[slug];
  const color = def?.color ?? "#7A7975";
  const iconName = def?.icon;
  const Icon = (iconName && ICONS[iconName]) || MapPin;
  return { color, Icon };
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
   *  shift and icon rotation so two cards aren't identical. */
  seed: string;
  className?: string;
  /** Default true since this is decorative; set false if the
   *  graphic IS conveying meaning (rare). */
  ariaHidden?: boolean;
}) {
  const { color, Icon } = resolve(category);
  const h = seedHash(seed);
  // Pull a sibling hue rotation in [-25, +25] for the gradient's
  // second stop so the card has depth without going off-brand.
  const hueShift = ((h % 51) - 25);
  // Rotate the watermark icon in [-15, +15] degrees so a shelf of
  // cards doesn't look stamped.
  const iconRotate = ((h >> 5) % 31) - 15;
  // Vary the icon's anchor: top-right, bottom-right, center-right.
  const iconAnchor = (h >> 11) % 3;

  // Drive the gradient with the hueShift seed too — it modulates how
  // much white the bright corner gets so two cards aren't identical.
  const brightMix = 45 + ((Math.abs(hueShift)) % 18); // 45–62%

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
        background: `linear-gradient(140deg,
          color-mix(in srgb, ${color} ${brightMix}%, #ffffff) 0%,
          ${color} 50%,
          color-mix(in srgb, ${color} 28%, #0d0c14) 100%)`,
      }}
    >
      {/* Dot grid texture — subtle paper grain. Mix-blend keeps the
       *  pattern legible across both light and dark colors. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
          mixBlendMode: "overlay",
        }}
      />
      {/* Soft sheen sweep across the bright corner */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18), transparent 40%)",
        }}
      />
      {/* Watermark icon — big enough to read at small card sizes.
       *  White at 32% so it punches against the colored gradient
       *  but still steps aside for the title that overlays on top. */}
      <Icon
        className="pointer-events-none absolute h-[150%] w-[150%]"
        strokeWidth={1}
        style={{
          color: "#fff",
          opacity: 0.32,
          top: iconAnchor === 0 ? "-35%" : iconAnchor === 1 ? "5%" : "-15%",
          right: "-30%",
          transform: `rotate(${iconRotate}deg)`,
        }}
      />
    </div>
  );
}
