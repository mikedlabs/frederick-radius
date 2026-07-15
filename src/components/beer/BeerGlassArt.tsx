import type { StyleFamily } from "@/data/beers";

export type BeerGlassVariant = "pint" | "pilsner" | "tulip" | "snifter";

export type BeerGlassArtProps = {
  family?: StyleFamily;
  variant?: BeerGlassVariant;
  className?: string;
  /**
   * Supplying a label promotes the artwork from decoration to an accessible
   * image. Leave it unset when nearby copy already communicates the meaning.
   */
  label?: string;
};

type FamilyColor = {
  beer: string;
  shade: string;
  foam: string;
};

// Mirrors the documented beer-family palette without importing the beer JSON
// into this presentational component. The type-only import above is erased.
const FAMILY_COLORS: Record<StyleFamily, FamilyColor> = {
  ipa: { beer: "#C7841F", shade: "#7A4A0E", foam: "#F7E7BE" },
  "wheat-hazy": { beer: "#D08A32", shade: "#8A5212", foam: "#F8E8C3" },
  "pale-ale": { beer: "#B8912F", shade: "#75570F", foam: "#F6E8C6" },
  "lager-pilsner": { beer: "#D6A52D", shade: "#79580B", foam: "#FFF1C9" },
  "amber-brown": { beer: "#9A5C2A", shade: "#5E3316", foam: "#F0D8AE" },
  "stout-porter": { beer: "#4A3128", shade: "#241610", foam: "#D7B98B" },
  "belgian-farmhouse": { beer: "#B5811E", shade: "#6F4C0E", foam: "#F4DEB1" },
  "sour-wild": { beer: "#B33A6E", shade: "#711E44", foam: "#F6D6DF" },
  "specialty-other": { beer: "#6E4E88", shade: "#402B53", foam: "#E4D7EC" },
};

const GLASS = "rgba(252, 251, 248, 0.78)";
const GLASS_FILL = "rgba(252, 251, 248, 0.09)";
const HIGHLIGHT = "rgba(255, 255, 255, 0.52)";

function Pint({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        d="M39 24h102l-11 181c-.5 8.2-7.3 14.6-15.5 14.6h-49c-8.2 0-15-6.4-15.5-14.6L39 24Z"
        fill={GLASS_FILL}
        stroke={GLASS}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M47 69h86l-8.2 134.4a8.5 8.5 0 0 1-8.5 8H63.7a8.5 8.5 0 0 1-8.5-8L47 69Z"
        fill={color.beer}
        opacity="0.96"
      />
      <path
        d="M51.5 139h77l-4 65a8 8 0 0 1-8 7.5h-53a8 8 0 0 1-8-7.5l-4-65Z"
        fill={color.shade}
        opacity="0.45"
      />
      <path
        d="M46 66c4-11 12.3-15.7 22.2-12.4 5.4-9.4 18.5-12.2 27-4.3 9.7-6.6 24.5-1.6 27.4 9 7.4-.7 12.5 3.5 12.5 9.7 0 7.3-5.5 11.2-14.7 11.2H59.7C50.8 79.5 44 75.3 46 66Z"
        fill={color.foam}
      />
      <path d="M56 88 63 194" stroke={HIGHLIGHT} strokeWidth="4" strokeLinecap="round" opacity="0.72" />
      <circle cx="77" cy="112" r="3.3" fill={HIGHLIGHT} />
      <circle cx="111" cy="95" r="2.5" fill={HIGHLIGHT} />
      <circle cx="103" cy="127" r="2" fill={HIGHLIGHT} />
    </>
  );
}

function Pilsner({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        d="M36 24h108l-28.5 165.5a10 10 0 0 1-9.9 8.3H74.4a10 10 0 0 1-9.9-8.3L36 24Z"
        fill={GLASS_FILL}
        stroke={GLASS}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M89 196h2v17H89z" fill={GLASS} />
      <path d="M61 217c0-4 12.8-7 29-7s29 3 29 7v3H61v-3Z" fill={GLASS} opacity="0.9" />
      <path
        d="M45 67h90l-20.5 119a7.8 7.8 0 0 1-7.8 6.6H73.3a7.8 7.8 0 0 1-7.8-6.6L45 67Z"
        fill={color.beer}
        opacity="0.95"
      />
      <path
        d="M57 137h66l-8.5 49a7.8 7.8 0 0 1-7.8 6.6H73.3a7.8 7.8 0 0 1-7.8-6.6L57 137Z"
        fill={color.shade}
        opacity="0.38"
      />
      <path
        d="M43 65c1.8-8.5 8.4-13.7 17-12 4.8-8.3 16.8-10.5 24.5-3.5 8.2-7.5 21.8-4.7 26.5 4.2 11.4-4 24 2.8 25.7 11.3 1.2 6.2-5.5 10.7-14.4 10.7H57.6C48.5 75.7 41.7 71.2 43 65Z"
        fill={color.foam}
      />
      <path d="M53 82 73 178" stroke={HIGHLIGHT} strokeWidth="3.5" strokeLinecap="round" opacity="0.72" />
      <circle cx="83" cy="111" r="2.5" fill={HIGHLIGHT} />
      <circle cx="108" cy="92" r="2" fill={HIGHLIGHT} />
      <circle cx="96" cy="139" r="2.8" fill={HIGHLIGHT} />
    </>
  );
}

function Tulip({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        d="M47 25c-1.5 17.3-8 35.5-5.3 56.8 3.8 30.4 21.6 51.7 43.3 57.8v53.8H65c-7 0-12.5 4.8-12.5 10.8V218h75v-13.8c0-6-5.5-10.8-12.5-10.8H95v-53.8c21.7-6.1 39.5-27.4 43.3-57.8C141 60.5 134.5 42.3 133 25H47Z"
        fill={GLASS_FILL}
        stroke={GLASS}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M49 66h82c.6 5 .8 9.8.1 14.6-3.7 28.8-21.3 50.2-41.1 50.2S52.6 109.4 48.9 80.6c-.7-4.8-.5-9.6.1-14.6Z"
        fill={color.beer}
        opacity="0.96"
      />
      <path
        d="M53.8 101.5c7.4 18.2 21.1 29.3 36.2 29.3s28.8-11.1 36.2-29.3c-5.2 25-20.8 40.3-36.2 40.3s-31-15.3-36.2-40.3Z"
        fill={color.shade}
        opacity="0.5"
      />
      <path
        d="M47 65c2.8-10.3 11.7-14.2 20.4-10.2 5.2-10 18.5-13 27.4-5.1 8.5-6.2 21.3-1.8 24.8 7.4 8.2-1.8 13.7 2 13.7 8.3 0 6.4-6.2 10.1-15.6 10.1H62.6C52.9 75.5 45.2 71.7 47 65Z"
        fill={color.foam}
      />
      <path d="M56.5 82c1.4 17 8.7 29.5 20.4 37.5" stroke={HIGHLIGHT} strokeWidth="3.6" strokeLinecap="round" opacity="0.7" />
      <circle cx="83" cy="93" r="2.5" fill={HIGHLIGHT} />
      <circle cx="108" cy="86" r="2" fill={HIGHLIGHT} />
    </>
  );
}

function Snifter({ color }: { color: FamilyColor }) {
  return (
    <>
      <path
        d="M38 34h104c0 13.5-4 24.5-9.6 33.5 4 8.5 5.9 18.4 4.8 29-2.7 27.3-19.7 47.5-42.2 52.8v43.9h19c8 0 14.5 5.2 14.5 11.6V218h-77v-13.2c0-6.4 6.5-11.6 14.5-11.6h19v-43.9c-22.5-5.3-39.5-25.5-42.2-52.8-1.1-10.6.8-20.5 4.8-29C42 58.5 38 47.5 38 34Z"
        fill={GLASS_FILL}
        stroke={GLASS}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M48.2 78h83.6c1.2 5.4 1.6 11.1 1 17.1-2.8 27.2-20.7 46.9-42.8 46.9S50 122.3 47.2 95.1c-.6-6-.2-11.7 1-17.1Z"
        fill={color.beer}
        opacity="0.97"
      />
      <path
        d="M53 111.5C61 130.3 74.6 142 90 142s29-11.7 37-30.5c-5 25.4-20.8 41.2-37 41.2s-32-15.8-37-41.2Z"
        fill={color.shade}
        opacity="0.55"
      />
      <path
        d="M47 75.5c3.5-9.7 12.3-13.1 20.8-8.5 5.8-9.8 19.6-11.3 27.3-2.8 9.6-5.7 22.3.1 24.1 9.7 8.1-.9 13.5 3.1 13.5 9 0 6.5-6.5 10.3-16.2 10.3h-54C52.6 93.2 44.3 87.1 47 75.5Z"
        fill={color.foam}
      />
      <path d="M55 91c1.3 17.2 9.2 30.4 21 38" stroke={HIGHLIGHT} strokeWidth="3.7" strokeLinecap="round" opacity="0.7" />
      <circle cx="85" cy="105" r="3" fill={HIGHLIGHT} />
      <circle cx="109" cy="99" r="2" fill={HIGHLIGHT} />
    </>
  );
}

/**
 * A light, dependency-free glass illustration for beer-family cards and hero
 * compositions. It is inert SVG, so it is safe in both server and client
 * components and never adds animation or hydration work.
 */
export function BeerGlassArt({
  family = "lager-pilsner",
  variant = "pint",
  className,
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
    >
      <ellipse cx="90" cy="224" rx="54" ry="7" fill="rgba(8, 18, 15, 0.38)" />
      {variant === "pint" ? <Pint color={color} /> : null}
      {variant === "pilsner" ? <Pilsner color={color} /> : null}
      {variant === "tulip" ? <Tulip color={color} /> : null}
      {variant === "snifter" ? <Snifter color={color} /> : null}
    </svg>
  );
}
