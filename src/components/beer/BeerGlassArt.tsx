import type { StyleFamily } from "@/data/beers";

export type BeerGlassVariant = "pint" | "pilsner" | "tulip" | "snifter";

export type BeerGlassArtProps = {
  family?: StyleFamily;
  variant?: BeerGlassVariant;
  className?: string;
  /**
   * Stroke ink for the engraved linework. Defaults to `currentColor` so the
   * glass inherits the surrounding text color (ink on cream cards, cream on
   * the dark taste/flight washes); pass an explicit color where the parent's
   * text color isn't the right plate ink.
   */
  ink?: string;
  /**
   * Supplying a label promotes the artwork from decoration to an accessible
   * image. Leave it unset when nearby copy already communicates the meaning.
   */
  label?: string;
};

/**
 * Engraved field-guide glassware (July 2026 redraw). The first version was
 * flat cartoon clipart — filled vector glasses with blob foam and sparkle
 * dots — which read as sticker art ("the cover looks cheesy", owner) and as
 * exactly the generic-AI icon style docs/DESIGN_TELLS.md exists to catch.
 * This redraw speaks the same woodcut idiom as src/components/glyphs: stroked
 * contours in one ink, interior hatching for tone, a light single-color wash
 * for the beer itself (a hand-tinted print, not a render). Inert SVG, no ids,
 * no filters — safe to repeat many times on one page.
 */

type FamilyColor = { beer: string; shade: string };

// Mirrors the documented beer-family palette without importing the beer JSON
// into this presentational component. The type-only import above is erased.
const FAMILY_COLORS: Record<StyleFamily, FamilyColor> = {
  ipa: { beer: "#C7841F", shade: "#7A4A0E" },
  "wheat-hazy": { beer: "#D08A32", shade: "#8A5212" },
  "pale-ale": { beer: "#B8912F", shade: "#75570F" },
  "lager-pilsner": { beer: "#D6A52D", shade: "#79580B" },
  "amber-brown": { beer: "#9A5C2A", shade: "#5E3316" },
  "stout-porter": { beer: "#4A3128", shade: "#241610" },
  "belgian-farmhouse": { beer: "#B5811E", shade: "#6F4C0E" },
  "sour-wild": { beer: "#B33A6E", shade: "#711E44" },
  "specialty-other": { beer: "#6E4E88", shade: "#402B53" },
};

/** Contour weight ~ the glyph set's 1.5/24 ratio, kept a touch finer at
 *  plate scale so large hero glasses read as etched lines, not marker. */
const CONTOUR = 4;
const HATCH = 1.7;

function Hatch({ lines }: { lines: Array<[number, number, number, number]> }) {
  return (
    <g strokeWidth={HATCH} opacity="0.45" strokeLinecap="round">
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </g>
  );
}

function Bubbles({ dots }: { dots: Array<[number, number, number]> }) {
  return (
    <g strokeWidth={HATCH} fill="none" opacity="0.7">
      {dots.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

/** Printed ground shadow: two short rules, not an airbrushed blob. */
function Ground() {
  return (
    <g strokeWidth={2.5} opacity="0.3" strokeLinecap="round">
      <line x1={56} y1={228} x2={124} y2={228} />
      <line x1={70} y1={234} x2={110} y2={234} />
    </g>
  );
}

function Pint({ color }: { color: FamilyColor }) {
  return (
    <>
      {/* beer wash — one flat tint under the linework */}
      <path
        className="beer-liquid"
        d="M43.6 84h92.8l-7.8 118c-.4 6.8-6 12-12.8 12H63.8c-6.8 0-12.4-5.2-12.8-12L43.6 84Z"
        fill={color.beer}
        opacity="0.36"
        stroke="none"
      />
      <path
        className="beer-liquid beer-liquid-deep"
        d="M52 150h76l-3.4 52c-.4 6.8-6 12-12.8 12H63.8c-6.8 0-12.4-5.2-12.8-12L52 150Z"
        fill={color.shade}
        opacity="0.2"
        stroke="none"
      />
      {/* glass contour */}
      <path d="M39 24h102l-11 181c-.5 8.2-7.3 14.6-15.5 14.6h-49c-8.2 0-15-6.4-15.5-14.6L39 24Z" strokeWidth={CONTOUR} />
      {/* foam: a scalloped crown, outline only */}
      <path className="beer-foam-line" d="M42.4 80 C46 66 58 62 64 72 C68 60 82 58 87 70 C92 58 106 60 109 72 C114 62 126 64 130 74 C133 77 135.6 78.5 137.6 80" strokeWidth={CONTOUR - 1} />
      <path d="M64 68c1.5-3 5-4 7.5-2M104 63c2-2.5 5.5-2.5 7.5-.5" strokeWidth={HATCH} opacity="0.6" />
      {/* form hatching, lower right — tone the way an etcher would */}
      <Hatch
        lines={[
          [96, 196, 112, 158],
          [104, 194, 119, 158],
          [112, 190, 125, 158],
          [120, 184, 129, 160],
          [58, 196, 50, 168],
          [66, 200, 56, 172],
        ]}
      />
      <Bubbles dots={[[74, 112, 3], [104, 98, 2.2], [92, 132, 2.6]]} />
      <Ground />
    </>
  );
}

function Pilsner({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        className="beer-liquid"
        d="M49.7 86h80.6l-17.3 102a8.4 8.4 0 0 1-8.3 7H75.3a8.4 8.4 0 0 1-8.3-7L49.7 86Z"
        fill={color.beer}
        opacity="0.36"
        stroke="none"
      />
      <path
        className="beer-liquid beer-liquid-deep"
        d="M60 146h60l-7 42a8.4 8.4 0 0 1-8.3 7H75.3a8.4 8.4 0 0 1-8.3-7l-7-42Z"
        fill={color.shade}
        opacity="0.2"
        stroke="none"
      />
      <path d="M36 24h108l-28.5 165.5a10 10 0 0 1-9.9 8.3H74.4a10 10 0 0 1-9.9-8.3L36 24Z" strokeWidth={CONTOUR} />
      {/* stem + foot, etched */}
      <path d="M90 198v14" strokeWidth={CONTOUR - 1} />
      <path d="M61 220c0-4.5 13-7.5 29-7.5s29 3 29 7.5" strokeWidth={CONTOUR - 1} />
      <path d="M61 220h58" strokeWidth={CONTOUR - 1} />
      <path className="beer-foam-line" d="M48.8 82 C52 69 63 65 68.5 74.5 C72.5 63 86 61 90.5 72.5 C95 61 108 63 111 74.5 C116 66 126 68 129 77 C130 79 130.6 80.5 131.2 82" strokeWidth={CONTOUR - 1} />
      <path d="M68 71c1.5-2.8 4.6-3.6 7-1.8M103 66c2-2.3 5-2.3 6.8-.4" strokeWidth={HATCH} opacity="0.6" />
      <Hatch
        lines={[
          [98, 182, 112, 148],
          [105, 178, 117, 150],
          [111, 172, 121, 150],
          [63, 182, 56, 152],
          [70, 186, 62, 156],
        ]}
      />
      <Bubbles dots={[[80, 112, 2.6], [102, 96, 2], [90, 136, 2.4]]} />
      <Ground />
    </>
  );
}

function Tulip({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        className="beer-liquid"
        d="M49.4 70h81.2c.4 4 .5 8.1-.1 12.1-3.7 27.2-21 47.4-40.5 47.4S53.2 109.3 49.5 82.1c-.6-4-.5-8.1-.1-12.1Z"
        fill={color.beer}
        opacity="0.36"
        stroke="none"
      />
      <path
        className="beer-liquid beer-liquid-deep"
        d="M55 96c7.5 16.5 20.5 26.5 35 26.5s27.5-10 35-26.5c-5 22-20 35-35 35s-30-13-35-35Z"
        fill={color.shade}
        opacity="0.2"
        stroke="none"
      />
      <path
        d="M47 25c-1.5 17.3-8 35.5-5.3 56.8 3.8 30.4 21.6 51.7 43.3 57.8v53.8H65c-7 0-12.5 4.8-12.5 10.8V218h75v-13.8c0-6-5.5-10.8-12.5-10.8H95v-53.8c21.7-6.1 39.5-27.4 43.3-57.8C141 60.5 134.5 42.3 133 25H47Z"
        strokeWidth={CONTOUR}
      />
      <path className="beer-foam-line" d="M49 66 C52.5 54 63 51 68.5 60.5 C72.5 50 85.5 48.5 90 59.5 C94.5 48.5 107 50.5 110.5 61 C115.5 53.5 125 56 128.5 63.5 C129.5 64.5 130.3 65.2 131 66" strokeWidth={CONTOUR - 1} />
      <path d="M67 56c1.6-2.6 4.8-3.2 7-1.4" strokeWidth={HATCH} opacity="0.6" />
      <Hatch
        lines={[
          [102, 124, 118, 96],
          [109, 118, 122, 94],
          [115, 110, 124, 90],
          [58, 118, 50, 92],
          [65, 124, 55, 98],
        ]}
      />
      <Bubbles dots={[[82, 92, 2.6], [106, 84, 2]]} />
      <Ground />
    </>
  );
}

function Snifter({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        className="beer-liquid"
        d="M48.6 82h82.8c.9 4.5 1.1 9.3.6 14.3-2.8 25.6-20.3 44-42 44S50.8 121.9 48 96.3c-.5-5-.3-9.8.6-14.3Z"
        fill={color.beer}
        opacity="0.36"
        stroke="none"
      />
      <path
        className="beer-liquid beer-liquid-deep"
        d="M54 108c7.8 17 20.8 27.5 36 27.5s28.2-10.5 36-27.5c-5 23-20.5 37-36 37s-31-14-36-37Z"
        fill={color.shade}
        opacity="0.2"
        stroke="none"
      />
      <path
        d="M38 34h104c0 13.5-4 24.5-9.6 33.5 4 8.5 5.9 18.4 4.8 29-2.7 27.3-19.7 47.5-42.2 52.8v43.9h19c8 0 14.5 5.2 14.5 11.6V218h-77v-13.2c0-6.4 6.5-11.6 14.5-11.6h19v-43.9c-22.5-5.3-39.5-25.5-42.2-52.8-1.1-10.6.8-20.5 4.8-29C42 58.5 38 47.5 38 34Z"
        strokeWidth={CONTOUR}
      />
      <path className="beer-foam-line" d="M48.2 78 C51.5 66 62 63 67.5 72 C71.5 61.5 85 60 89.5 71 C94 60 106.5 62 110 73 C115 65.5 125 67.5 128.5 75 C129.7 76.2 130.8 77.1 131.8 78" strokeWidth={CONTOUR - 1} />
      <path d="M68 68c1.6-2.6 4.8-3.2 7-1.4" strokeWidth={HATCH} opacity="0.6" />
      <Hatch
        lines={[
          [104, 134, 120, 106],
          [111, 128, 125, 104],
          [117, 120, 127, 100],
          [57, 128, 49, 102],
          [64, 134, 54, 108],
        ]}
      />
      <Bubbles dots={[[84, 104, 2.8], [108, 96, 2]]} />
      <Ground />
    </>
  );
}

export function BeerGlassArt({
  family = "lager-pilsner",
  variant = "pint",
  className,
  ink = "currentColor",
  label,
}: BeerGlassArtProps) {
  const color = FAMILY_COLORS[family];

  return (
    <svg
      viewBox="0 0 180 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke={ink}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {variant === "pint" ? <Pint color={color} /> : null}
      {variant === "pilsner" ? <Pilsner color={color} /> : null}
      {variant === "tulip" ? <Tulip color={color} /> : null}
      {variant === "snifter" ? <Snifter color={color} /> : null}
    </svg>
  );
}
