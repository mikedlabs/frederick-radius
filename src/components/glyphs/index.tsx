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

/** Worship — a chapel with a cross and a round window. */
export const Church: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 2.5V6M10.5 4h3" />
    <path d="M6.5 11 12 6.5 17.5 11" />
    <path d="M8 11v9h8v-9" />
    <path d="M6.5 20h11" />
    <path d="M10.5 20v-4a1.5 1.5 0 0 1 3 0v4" />
    <circle cx="12" cy="13.6" r="1.1" {...HATCH} />
  </Svg>
);

/** Shopping — a bag with handles. */
export const ShoppingBag: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M6 8h12l-1 11H7Z" />
    <path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8" />
    <path d="M6.6 11.5h10.8" {...HATCH} />
  </Svg>
);

/** Wellness — a heart with a soft highlight. */
export const Heart: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 20C12 20 4 15 4 9.2 4 6.9 5.9 5 8.2 5c1.6 0 3.1 1 3.8 2.3C12.7 6 14.2 5 15.8 5 18.1 5 20 6.9 20 9.2 20 15 12 20 12 20Z" />
    <path d="M7.6 9.2A2.2 2.2 0 0 1 9.8 7" {...HATCH} />
  </Svg>
);

/** Arts & public art — a painter's palette. */
export const Palette: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 4C7 4 3.5 7.2 3.5 11s3.5 6.5 7.5 6.5c1.3 0 1.8-1 1.3-1.9-.5-.9.2-1.6 1.1-1.6H17.5c1.7 0 3-1.4 3-3.1C20.5 7 16.7 4 12 4Z" />
    <circle cx="7.6" cy="10.2" r="1" fill="currentColor" stroke="none" fillOpacity={0.55} />
    <circle cx="10.2" cy="7.6" r="1" fill="currentColor" stroke="none" fillOpacity={0.55} />
    <circle cx="14.4" cy="7.8" r="1" fill="currentColor" stroke="none" fillOpacity={0.55} />
  </Svg>
);

/** Theater — a stage mask. */
export const Theater: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M7 5.5h10v5.5a5 6 0 0 1-10 0Z" />
    <path d="M9.5 12.5a3 2.2 0 0 0 5 0" {...HATCH} />
    <circle cx="9.8" cy="9.2" r="0.6" fill="currentColor" stroke="none" fillOpacity={0.7} />
    <circle cx="14.2" cy="9.2" r="0.6" fill="currentColor" stroke="none" fillOpacity={0.7} />
  </Svg>
);

/** Galleries — a framed landscape. */
export const Gallery: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M5 6h14v12H5Z" />
    <path d="M5 15.5 9 11.5l3 3 3-3.5 4 4" />
    <circle cx="8.5" cy="9.5" r="1.2" />
  </Svg>
);

/** Libraries — an open book. */
export const Library: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 7.5C10 6 6.5 6 4.5 7.2V18C6.5 16.8 10 16.8 12 18" />
    <path d="M12 7.5C14 6 17.5 6 19.5 7.2V18C17.5 16.8 14 16.8 12 18" />
    <path d="M12 7.5V18" />
    <path d="M6.5 10h3.4M14 10h3.4" {...HATCH} />
  </Svg>
);

/** Lodging — a turned-down bed. */
export const Hotel: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M4 9v9" />
    <path d="M4 18v-6h12a4 4 0 0 1 4 4v2" />
    <path d="M4 15.5h16" />
    <path d="M6 12v-1.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V12" {...HATCH} />
    <path d="M4.5 18v1.5M19.5 18v1.5" />
  </Svg>
);

/** Civic & government — a windowed public building. */
export const CivicBuilding: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M6 20V7l6-3 6 3v13" />
    <path d="M5 20h14" />
    <path d="M11 20v-3.2h2V20" />
    <path d="M9 10.5h1.6M13.4 10.5H15M9 13.5h1.6M13.4 13.5H15" {...HATCH} />
  </Svg>
);

/** Public safety — a shield with a check. */
export const Shield: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M12 3 19 5.5V11c0 4.8-3.3 7.8-7 9.4C8.3 18.8 5 15.8 5 11V5.5Z" />
    <path d="M9 11.5 11 13.6 15.2 9" {...HATCH} />
  </Svg>
);

/** Sports & fitness — a heartbeat line. */
export const Activity: FC<GlyphProps> = (p) => (
  <Svg {...p}>
    <path d="M3 12h3.5l2-5 3.5 10 2-5H21" />
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
  Church,
  ShoppingBag,
  Heart,
  Palette,
  Theater,
  ImageIcon: Gallery,
  Library,
  Hotel,
  Building: CivicBuilding,
  Building2: CivicBuilding,
  ShieldCheck: Shield,
  Activity,
};
