import type { FC, ReactNode, SVGProps } from "react";

/**
 * Bespoke engraved field-guide glyphs — the "made for Frederick" mark set.
 *
 * These are hand-drawn in a single woodcut idiom so a row of them reads as
 * one hand: 24x24 grid, fill none, stroke = currentColor, primary contour
 * 1.5px, interior hatch 0.75px at ~0.55 opacity, round caps/joins. Color
 * flows from the caller (IconStamp tints via currentColor; raw use inherits
 * text color), so glyphs never set their own color.
 *
 * They live BEHIND the existing icon seam: CategoryIcon checks `GLYPHS[name]`
 * before the Lucide map, so a drawn category lands on every PlaceCard, grid,
 * guide doorway and place page with no call-site edits — and any category we
 * have NOT drawn yet degrades to its Lucide icon. Bespoke only for the
 * carrying categories; the long tail and UI chrome stay Lucide on purpose.
 *
 * Keys match the `icon` strings in src/data/categories.ts.
 */

type GlyphProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

const HATCH = { strokeWidth: 0.75, strokeOpacity: 0.55 } as const;

/** Eat & drink / restaurants — a pressed fork and knife. */
export const EatDrink: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M6 4v4.5M8.5 4v4.5M11 4v4.5" />
    <path d="M6 8.5h5" />
    <path d="M8.5 8.5V20" />
    <path d="M16.5 4c2 2.5 2 6.5 0 8.5c-2-2-2-6 0-8.5Z" />
    <path d="M16.5 12.5V20" />
    <path d="M16.5 6v4" {...HATCH} />
  </Svg>
);

/** Coffee — cup, handle, two ribbons of steam. */
export const Coffee: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M5.5 10h11.5v2.5C17 15.5 14.5 18 11.25 18S5.5 15.5 5.5 12.5Z" />
    <path d="M17 11c3 0 3 4 0 4" />
    <path d="M9 3.5c-1 1 1 2 0 3.5M12.5 3.5c-1 1 1 2 0 3.5" {...HATCH} />
  </Svg>
);

/** Bars — a wine glass with a hint of pour. */
export const Wine: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M7.5 4h9c0 5-3 7.5-4.5 7.5S7.5 9 7.5 4Z" />
    <path d="M12 11.5V18" />
    <path d="M9 18h6" />
    <path d="M8.6 6c1.4 1.5 5.4 1.5 6.8 0" {...HATCH} />
  </Svg>
);

/** Breweries — a foamed stein with brew lines. */
export const Beer: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M7 7h8v9c0 2-1.2 3-3 3h-2c-1.8 0-3-1-3-3Z" />
    <path d="M15 9c3.5 0 3.5 5 0 5" />
    <path d="M6.6 7c1-2 2.4-.6 4-1.6S13.6 6.6 15.4 6.4" />
    <path d="M9.5 11v5M12.5 11v5" {...HATCH} />
  </Svg>
);

/** Bakeries — a cookie with chips. */
export const Cookie: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="9.5" cy="10" r="0.9" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="14.2" cy="10.5" r="0.9" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="11" cy="14.5" r="0.9" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="15" cy="14.2" r="0.8" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="12.6" cy="11.6" r="0.7" fill="currentColor" stroke="none" fillOpacity={0.6} />
  </Svg>
);

/** Pizza — a slice with toppings. */
export const Pizza: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M5 6.5h14L12 19Z" />
    <path d="M5.7 8.5h12.6" {...HATCH} />
    <circle cx="9.6" cy="9.6" r="1" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="14" cy="10" r="1" fill="currentColor" stroke="none" fillOpacity={0.6} />
    <circle cx="12" cy="12.8" r="0.9" fill="currentColor" stroke="none" fillOpacity={0.6} />
  </Svg>
);

/** Parks — a pine and a round tree. */
export const Trees: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M9 3.5 5.5 9.5h7Z" />
    <path d="M9 7.5 4.5 14.5h9Z" />
    <path d="M9 14.5V18" />
    <circle cx="16.5" cy="9.5" r="3.3" />
    <path d="M16.5 12.8V18" />
  </Svg>
);

/** Trails — a jagged ridge under a small sun. */
export const Mountain: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M3 19 9.5 7l3.5 5 4-7 4 14Z" />
    <path d="M8 9 9.5 7 11 9" {...HATCH} />
    <circle cx="6.5" cy="6.8" r="1.8" />
  </Svg>
);

/** Markets — an apple with a leaf. */
export const Apple: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 8c-1.5-2-6-2-6 2.5 0 4.5 3 9.5 6 9.5s6-5 6-9.5c0-4.5-4.5-4.5-6-2.5Z" />
    <path d="M12 8V4.5" />
    <path d="M12.5 6c2-2 4.5-1 3.5 1-2 1-3.5 0-3.5-1Z" />
    <path d="M9 10c-.5 2-.5 4 .5 6" {...HATCH} />
  </Svg>
);

/** Live music — a beamed pair of notes. */
export const Music: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M10 17.5V6l9-1.5V16" />
    <path d="M10 9l9-1.5" {...HATCH} />
    <circle cx="8" cy="17.5" r="2.1" fill="currentColor" stroke="none" fillOpacity={0.85} />
    <circle cx="17" cy="16" r="2.1" fill="currentColor" stroke="none" fillOpacity={0.85} />
  </Svg>
);

/** Museums — a columned landmark. */
export const Landmark: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M4 9 12 4l8 5Z" />
    <path d="M7 9.5v8M10 9.5v8M14 9.5v8M17 9.5v8" />
    <path d="M4.5 18.5h15" />
  </Svg>
);

/** The registry the icon seam reads. Keys = categories.ts `icon` strings. */
export const GLYPHS: Record<string, FC<GlyphProps>> = {
  Utensils: EatDrink,
  UtensilsCrossed: EatDrink,
  Coffee,
  Wine,
  Beer,
  Cookie,
  Pizza,
  Trees,
  Mountain,
  Apple,
  Music,
  Landmark,
};
