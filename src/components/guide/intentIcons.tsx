import {
  Coffee,
  Utensils,
  Wine,
  Beer,
  Trees,
  Baby,
  Palette,
  Landmark,
  Heart,
  ShoppingBag,
  Hotel,
  Church,
  type LucideIcon,
} from "lucide-react";
import type { Intent } from "@/data/intents";

/**
 * Map the intent's string icon name (kept as a string in the server-safe
 * intents data) back to a lucide glyph for the funnel tiles.
 */
export const INTENT_ICON: Record<Intent["icon"], LucideIcon> = {
  Coffee,
  Utensils,
  Wine,
  Beer,
  Trees,
  Baby,
  Palette,
  Landmark,
  Heart,
  ShoppingBag,
  Hotel,
  Church,
};
