import {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building, Car, Church,
  Coffee, Cookie, DoorOpen, Droplets, Hammer, Heart, HeartPulse, Hotel,
  ImageIcon, Lamp, Landmark, Library, Mountain, Music, Palette, ParkingCircle,
  PawPrint, Pill, Pizza, Recycle, ShieldCheck, ShoppingBag, Tent, Theater,
  ToyBrick, Train, Trees, Truck, Users, Utensils, UtensilsCrossed, Vote,
  Wifi, Wine, Wrench, MapPin,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { GLYPHS } from "@/components/glyphs";

/**
 * The category's real Lucide icon, by slug. Replaces the emoji glyph
 * fallback: emoji render differently on every OS and read casual, a
 * vector icon is consistent, tints to the category color, and is the
 * premium choice in the most-repeated unit. Explicit import map so it
 * stays tree-shakeable (no whole-set lucide import). Unknown or
 * long-tail icon names degrade to MapPin, never a broken glyph.
 */
const MAP: Record<string, LucideIcon> = {
  Activity, Apple, Armchair, Baby, Beer, Bike, BookOpen, Building, Car, Church,
  Coffee, Cookie, DoorOpen, Droplets, Hammer, Heart, HeartPulse, Hotel,
  ImageIcon, Lamp, Landmark, Library, Mountain, Music, Palette, ParkingCircle,
  PawPrint, Pill, Pizza, Recycle, ShieldCheck, ShoppingBag, Tent, Theater,
  ToyBrick, Train, Trees, Truck, Users, Utensils, UtensilsCrossed, Vote,
  Wifi, Wine, Wrench,
  // Long-tail names declared in categories.ts that are not 1:1 Lucide
  // exports resolve to a sensible vector rather than a broken import.
  PinCircle: MapPin,
};

export default function CategoryIcon({
  slug,
  className,
  style,
  strokeWidth = 2,
}: {
  slug: string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  const name = CATEGORY_BY_SLUG[slug]?.icon ?? "";
  // Bespoke engraved glyph first (it bakes its own stroke, so strokeWidth is
  // intentionally not forwarded); otherwise the Lucide icon, else MapPin.
  const Glyph = GLYPHS[name];
  if (Glyph) return <Glyph className={className} style={style} aria-hidden />;
  const Icon = MAP[name] ?? MapPin;
  return <Icon className={className} style={style} strokeWidth={strokeWidth} aria-hidden />;
}
