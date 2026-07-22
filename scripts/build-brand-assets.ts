/**
 * Build the Frederick Radius brand kit from the canonical TypeScript brand
 * contract. Source SVGs stay editable; PNGs are deterministic exports for
 * social platforms, app stores, and handoff. Run with `npm run build:brand`.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import QRCode from "qrcode";
import { BRAND, RIPPLE_GEOMETRY, type RippleDetail } from "../src/lib/brand";
import { PLATFORM_BRAND } from "../src/lib/platform-brand";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "brand");
const LOCKED_BRAND_CONTRACT = {
  system: "Frederick Radius Brand System",
  version: "1.2",
  updated: "2026-07-22",
  colors: {
    brick: "#B5462B",
    cream: "#F4EEE2",
    ink: "#221C15",
    forest: "#315A43",
    creek: "#285D73",
    plum: "#7E2C6F",
    amber: "#C58A32",
  },
  type: {
    display: "Libre Caslon Display",
    text: "Public Sans",
  },
} as const;
const TAGLINE_UPPER = BRAND.tagline.toUpperCase();
const POSTER_QR_URL = "https://frederickradius.app/?utm_source=poster&utm_medium=qr&utm_campaign=field-guide";
const CARD_QR_URL = "https://frederickradius.app/?utm_source=radius-card&utm_medium=qr&utm_campaign=field-guide";
const BRAND_GUIDANCE_FILES = [
  "docs/brand/BRAND_GUIDE.md",
  "docs/brand/Frederick-Radius-Brand-Guide.html",
  "docs/brand/LAUNCH_KIT.md",
  "public/brand/README.md",
] as const;
const FONT_SOURCE = {
  display: path.join(
    ROOT,
    "node_modules/@fontsource/libre-caslon-display/files/libre-caslon-display-latin-400-normal.woff2",
  ),
  text: path.join(
    ROOT,
    "node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2",
  ),
  textItalic: path.join(
    ROOT,
    "node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-italic.woff2",
  ),
  displayDesktop: path.join(ROOT, "scripts/brand-fonts/LibreCaslonDisplay-Regular.ttf"),
  textDesktop: path.join(ROOT, "scripts/brand-fonts/PublicSans-Variable.ttf"),
  textItalicDesktop: path.join(ROOT, "scripts/brand-fonts/PublicSans-VariableItalic.ttf"),
  staticDesktopDir: path.join(ROOT, "scripts/brand-fonts/static"),
  readme: path.join(ROOT, "scripts/brand-fonts/README.md"),
};

const STATIC_PUBLIC_SANS = [
  { file: "PublicSans-Regular.ttf", style: "normal", weight: "400" },
  { file: "PublicSans-Italic.ttf", style: "italic", weight: "400" },
  { file: "PublicSans-Medium.ttf", style: "normal", weight: "500" },
  { file: "PublicSans-MediumItalic.ttf", style: "italic", weight: "500" },
  { file: "PublicSans-SemiBold.ttf", style: "normal", weight: "600" },
  { file: "PublicSans-SemiBoldItalic.ttf", style: "italic", weight: "600" },
  { file: "PublicSans-Bold.ttf", style: "normal", weight: "700" },
  { file: "PublicSans-BoldItalic.ttf", style: "italic", weight: "700" },
] as const;

type Asset = {
  file: string;
  width: number;
  height: number;
  make: (fontCss: string) => string;
  png?: boolean;
  pdf?: { width: string; height: string };
  role: string;
};

function assertLockedBrandContract(): void {
  for (const key of ["system", "version", "updated"] as const) {
    if (BRAND[key] !== LOCKED_BRAND_CONTRACT[key]) {
      throw new Error(
        `Brand contract drift: ${key} is ${BRAND[key]}; expected ${LOCKED_BRAND_CONTRACT[key]}. Update the guide and release guard together.`,
      );
    }
  }
  for (const [name, expected] of Object.entries(LOCKED_BRAND_CONTRACT.colors)) {
    const actual = BRAND.colors[name as keyof typeof LOCKED_BRAND_CONTRACT.colors];
    if (actual !== expected) {
      throw new Error(
        `Brand contract drift: ${name} is ${actual}; expected ${expected}. Update the canonical guide, assets, and this release guard together.`,
      );
    }
  }
  for (const [name, expected] of Object.entries(LOCKED_BRAND_CONTRACT.type)) {
    const actual = BRAND.type[name as keyof typeof LOCKED_BRAND_CONTRACT.type];
    if (actual !== expected) {
      throw new Error(
        `Brand contract drift: ${name} typeface is ${actual}; expected ${expected}. Update the canonical guide, assets, and this release guard together.`,
      );
    }
  }
}

function inspectableText(value: string): string {
  return value.replace(
    /data:[^;"']+;base64,[A-Za-z0-9+/=]+/g,
    "[embedded binary]",
  );
}

function assertUsesOnlyBrandColors(label: string, value: string): void {
  const allowed = new Set(
    Object.values(BRAND.colors).map((color) => color.toUpperCase()),
  );
  const colors = inspectableText(value).match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  for (const color of colors) {
    if (!allowed.has(color.toUpperCase())) {
      throw new Error(
        `${label} contains non-canonical color ${color}. Add it to the Frederick Radius brand contract deliberately or use a current token.`,
      );
    }
  }
}

function assertUsesCanonicalBrandNames(label: string, value: string): void {
  const inspectable = inspectableText(value).replace(/\s+/g, " ");
  for (const name of [
    "Catoctin Forest",
    "Ochre Amber",
    LOCKED_BRAND_CONTRACT.type.display,
    LOCKED_BRAND_CONTRACT.type.text,
  ]) {
    if (!inspectable.includes(name)) {
      throw new Error(`${label} is missing canonical brand name ${name}.`);
    }
  }
}

async function assertBrandGuidanceIsCurrent(): Promise<void> {
  await Promise.all(
    BRAND_GUIDANCE_FILES.map(async (relativePath) => {
      const content = await readFile(path.join(ROOT, relativePath), "utf8");
      assertUsesOnlyBrandColors(relativePath, content);
      assertUsesCanonicalBrandNames(relativePath, content);
      if (!content.includes(`1.2`) || !content.includes("July 22, 2026")) {
        throw new Error(`${relativePath} is missing the current brand version or date.`);
      }
    }),
  );
}

function svgShell(width: number, height: number, body: string, fontCss = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <title>Frederick Radius</title>
  ${fontCss ? `<defs><style>${fontCss}</style></defs>` : ""}
  ${body}
</svg>\n`.replace(/[ \t]+$/gm, "");
}

function fontCss(displayUrl: string, textUrl: string, textItalicUrl: string): string {
  return `
@font-face{font-family:'Libre Caslon Display';src:url('${displayUrl}') format('woff2');font-style:normal;font-weight:400;}
@font-face{font-family:'Public Sans';src:url('${textUrl}') format('woff2');font-style:normal;font-weight:100 900;}
@font-face{font-family:'Public Sans';src:url('${textItalicUrl}') format('woff2');font-style:italic;font-weight:100 900;}
`;
}

function ripple(
  detail: RippleDetail,
  color: string,
  transform = "",
  opacity = 1,
): string {
  const geometry = RIPPLE_GEOMETRY[detail];
  const groupTransform = [transform, `translate(0 ${geometry.opticalOffsetY})`]
    .filter(Boolean)
    .join(" ");
  return `<g transform="${groupTransform}" opacity="${opacity}">
    <g fill="none" stroke="${color}" stroke-linecap="round" stroke-width="${geometry.strokeWidth}">
      ${geometry.paths.map((d, index) => `<path d="${d}" stroke-opacity="${geometry.opacities[index]}"/>`).join("\n      ")}
    </g>
    <circle cx="50" cy="${geometry.baseline}" r="${geometry.dotRadius}" fill="${color}"/>
  </g>`;
}

function rippleField(color: string, transform: string, opacity: number): string {
  const geometry = RIPPLE_GEOMETRY.full;
  return `<g transform="${transform} translate(0 ${geometry.opticalOffsetY})" opacity="${opacity}" fill="none" stroke="${color}" stroke-linecap="round" stroke-width="2.4">
    ${geometry.paths.map((d) => `<path d="${d}"/>`).join("\n    ")}
  </g>`;
}

function markAsset(
  detail: RippleDetail,
  color: string,
  background: string | null,
  role: string,
): Asset {
  const slug = `${detail}-${color === BRAND.colors.cream ? "cream" : "brick"}${background ? "-tile" : ""}`;
  return {
    file: `marks/ripple-${slug}.svg`,
    width: 512,
    height: 512,
    role,
    png: true,
    make: () =>
      svgShell(
        512,
        512,
        `${background ? `<rect width="512" height="512" rx="112" fill="${background}"/>` : ""}
  ${ripple(detail, color, "translate(0 0) scale(5.12)")}`,
      ),
  };
}

function lockupAsset(reverse: boolean, descriptor: boolean): Asset {
  const color = reverse ? BRAND.colors.cream : BRAND.colors.brick;
  const text = reverse ? BRAND.colors.cream : BRAND.colors.ink;
  const height = descriptor ? 280 : 220;
  return {
    file: `lockups/${descriptor ? "descriptor" : "horizontal"}-${reverse ? "cream" : "brick"}.svg`,
    width: 1200,
    height,
    role: descriptor ? "Horizontal lockup with brand tagline" : "Primary horizontal lockup",
    png: true,
    make: (fonts) =>
      svgShell(
        1200,
        height,
        `${ripple("full", color, "translate(194 20) scale(1.78)")}
  <text x="420" y="132" fill="${text}" font-family="Libre Caslon Display" font-size="88" font-weight="400" letter-spacing="-1">${BRAND.name}</text>
  ${descriptor ? `<text x="424" y="190" fill="${color}" font-family="Public Sans" font-size="22" font-weight="700" letter-spacing="3.2">${TAGLINE_UPPER}</text>` : ""}`,
        fonts,
      ),
  };
}

function stackedLockup(fonts: string, reverse = false): string {
  const mark = reverse ? BRAND.colors.cream : BRAND.colors.brick;
  const text = reverse ? BRAND.colors.cream : BRAND.colors.ink;
  return svgShell(
    800,
    800,
    `${ripple("full", mark, "translate(280 58) scale(2.4)")}
  <text x="400" y="488" text-anchor="middle" fill="${text}" font-family="Libre Caslon Display" font-size="108" font-weight="400">Frederick</text>
  <text x="400" y="594" text-anchor="middle" fill="${text}" font-family="Libre Caslon Display" font-size="108" font-weight="400">Radius</text>
  <text x="400" y="680" text-anchor="middle" fill="${mark}" font-family="Public Sans" font-size="20" font-weight="700" letter-spacing="2.5">${TAGLINE_UPPER}</text>`,
    fonts,
  );
}

function socialAvatar(fonts: string): string {
  return svgShell(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="${BRAND.colors.brick}"/>
  ${ripple("full", BRAND.colors.cream, "translate(162 162) scale(7)")}`,
    fonts,
  );
}

function facebookCover(fonts: string): string {
  return svgShell(
    1640,
    624,
    `<rect width="1640" height="624" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.cream, "translate(515 188) scale(1.75)")}
  <text x="720" y="327" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="92" font-weight="400" letter-spacing="-1.2">${BRAND.name}</text>
  <line x1="515" x2="1125" y1="404" y2="404" stroke="${BRAND.colors.cream}" stroke-opacity=".32" stroke-width="2"/>
  <text x="820" y="461" text-anchor="middle" fill="${BRAND.colors.cream}" fill-opacity=".9" font-family="Public Sans" font-size="23" font-weight="700" letter-spacing="2.4">${TAGLINE_UPPER}</text>`,
    fonts,
  );
}

function facebookPhotoCover(fonts: string, photoUrl: string): string {
  return svgShell(
    1640,
    624,
    `<defs>
    <linearGradient id="fb-photo-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.ink}" stop-opacity=".08"/>
      <stop offset="58%" stop-color="${BRAND.colors.ink}" stop-opacity=".08"/>
      <stop offset="100%" stop-color="${BRAND.colors.ink}" stop-opacity=".68"/>
    </linearGradient>
  </defs>
  <image href="${photoUrl}" width="1640" height="624" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1640" height="624" fill="url(#fb-photo-shade)"/>
  <rect x="180" y="0" width="8" height="624" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.cream, "translate(234 382) scale(1.2)")}
  <text x="385" y="476" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="70" font-weight="400">${BRAND.name}</text>
  <text x="1400" y="112" text-anchor="end" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="22" font-weight="750" letter-spacing="1.5">${TAGLINE_UPPER}</text>`,
    fonts,
  );
}

function feedBrand(fonts: string): string {
  return svgShell(
    1080,
    1080,
    `<rect width="1080" height="1080" fill="${BRAND.colors.brick}"/>
  ${rippleField(BRAND.colors.cream, "translate(440 360) scale(9)", 0.14)}
  ${ripple("full", BRAND.colors.cream, "translate(88 76) scale(1.25)")}
  <text x="235" y="176" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="61" font-weight="400">${BRAND.name}</text>
  <text x="88" y="675" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="82" font-weight="600" letter-spacing="-1.2">
    <tspan x="88" dy="0">Frederick County starts</tspan><tspan x="88" dy="94">where you are.</tspan>
  </text>
  <text x="92" y="965" fill="${BRAND.colors.cream}" fill-opacity=".82" font-family="Public Sans" font-size="26" font-weight="700" letter-spacing="4.5">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function feedPortrait(fonts: string): string {
  return svgShell(
    1080,
    1350,
    `<rect width="1080" height="1350" fill="${BRAND.colors.cream}"/>
  ${rippleField(BRAND.colors.brick, "translate(395 500) scale(9.4)", 0.09)}
  ${ripple("full", BRAND.colors.brick, "translate(82 78) scale(1.25)")}
  <text x="235" y="178" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="61" font-weight="400">${BRAND.name}</text>
  <text x="82" y="760" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="84" font-weight="600" letter-spacing="-1">
    <tspan x="82" dy="0">Frederick County starts</tspan><tspan x="82" dy="98">where you are.</tspan>
  </text>
  <line x1="82" x2="998" y1="1125" y2="1125" stroke="${BRAND.colors.border}" stroke-width="2"/>
  <text x="82" y="1212" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="25" font-weight="700" letter-spacing="4.4">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function facebookGroupLaunch(fonts: string, photoUrl: string): string {
  return svgShell(
    1080,
    1350,
    `<defs>
    <linearGradient id="group-photo-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.ink}" stop-opacity=".08"/>
      <stop offset="38%" stop-color="${BRAND.colors.ink}" stop-opacity=".04"/>
      <stop offset="72%" stop-color="${BRAND.colors.ink}" stop-opacity=".43"/>
      <stop offset="100%" stop-color="${BRAND.colors.ink}" stop-opacity=".78"/>
    </linearGradient>
  </defs>
  <image href="${photoUrl}" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1350" fill="url(#group-photo-shade)"/>
  ${ripple("compact", BRAND.colors.cream, "translate(66 66) scale(.82)")}
  <text x="171" y="137" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="43" font-weight="400">${BRAND.name}</text>
  <text x="66" y="570" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="100" font-weight="400" letter-spacing="-1.5">
    <tspan x="66" dy="0">FIND THE</tspan><tspan x="66" dy="106">FOOD TRUCKS.</tspan>
  </text>
  <rect x="68" y="730" width="76" height="8" fill="${BRAND.colors.brick}"/>
  <text x="68" y="815" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="33" font-weight="500">
    <tspan x="68" dy="0">20 local trucks.</tspan><tspan x="68" dy="46">Their latest location links.</tspan>
  </text>
  <text x="68" y="1270" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="22" font-weight="750" letter-spacing="3.1">FREDERICKRADIUS.APP  ·  CODE: FOOD-TRUCK</text>`,
    fonts,
  );
}

function photoPostTemplate(fonts: string): string {
  return svgShell(
    1080,
    1350,
    `<rect width="1080" height="1350" fill="${BRAND.colors.ink}"/>
  <rect x="0" y="0" width="1080" height="880" fill="${BRAND.colors.mutedInk}"/>
  <path d="M0 620 L300 390 L500 560 L720 300 L1080 650 V880 H0 Z" fill="${BRAND.colors.controlBorder}"/>
  <text x="540" y="460" text-anchor="middle" fill="${BRAND.colors.border}" font-family="Public Sans" font-size="28" font-weight="700" letter-spacing="3">ADD OWNED FREDERICK PHOTO</text>
  <rect x="0" y="880" width="1080" height="470" fill="${BRAND.colors.cream}"/>
  ${ripple("full", BRAND.colors.brick, "translate(74 930) scale(.88)")}
  <text x="190" y="1009" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="22" font-weight="700" letter-spacing="3.8">FIELD NOTE</text>
  <text x="74" y="1140" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="66" font-weight="650" letter-spacing="-.8">Story headline goes here.</text>
  <text x="76" y="1230" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="29" font-weight="400">Location · Frederick County</text>
  <text x="76" y="1302" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="21" font-weight="700" letter-spacing="3.6">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function photoStoryTemplate(fonts: string): string {
  return svgShell(
    1080,
    1920,
    `<rect width="1080" height="1920" fill="${BRAND.colors.ink}"/>
  <rect width="1080" height="1290" fill="${BRAND.colors.mutedInk}"/>
  <path d="M0 980 L270 700 L500 920 L735 610 L1080 990 V1290 H0 Z" fill="${BRAND.colors.controlBorder}"/>
  <text x="540" y="690" text-anchor="middle" fill="${BRAND.colors.border}" font-family="Public Sans" font-size="28" font-weight="700" letter-spacing="3">ADD OWNED FREDERICK PHOTO</text>
  <rect y="1290" width="1080" height="630" fill="${BRAND.colors.cream}"/>
  ${ripple("full", BRAND.colors.brick, "translate(76 1340) scale(.9)")}
  <text x="195" y="1421" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="22" font-weight="700" letter-spacing="3.8">FIELD NOTE</text>
  <text x="76" y="1585" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="72" font-weight="650" letter-spacing="-.8">
    <tspan x="76" dy="0">Story headline</tspan><tspan x="76" dy="84">goes here.</tspan>
  </text>
  <text x="78" y="1780" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="29">Location · Frederick County</text>
  <text x="78" y="1862" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="21" font-weight="700" letter-spacing="3.6">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function feedEvent(fonts: string): string {
  return svgShell(
    1080,
    1080,
    `<rect width="1080" height="1080" fill="${BRAND.colors.cream}"/>
  <rect x="1" y="1" width="1078" height="1078" fill="none" stroke="${BRAND.colors.border}" stroke-width="2"/>
  ${ripple("full", BRAND.colors.brick, "translate(82 70) scale(1.16)")}
  <text x="222" y="160" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="25" font-weight="700" letter-spacing="4.4">THIS WEEKEND</text>
  <line x1="82" x2="998" y1="230" y2="230" stroke="${BRAND.colors.border}" stroke-width="2"/>
  <text x="82" y="490" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="104" font-weight="650" letter-spacing="-1.5">
    <tspan x="82" dy="0">Event title</tspan><tspan x="82" dy="118">goes here</tspan>
  </text>
  <rect x="82" y="790" width="916" height="2" fill="${BRAND.colors.border}"/>
  <text x="82" y="866" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="34" font-weight="700">DATE · TIME</text>
  <text x="82" y="925" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="31" font-weight="400">Venue · Frederick County</text>
  <text x="82" y="1010" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="22" font-weight="700" letter-spacing="3.8">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function feedLive(fonts: string): string {
  return svgShell(
    1080,
    1080,
    `<rect width="1080" height="1080" fill="${BRAND.colors.cream}"/>
  <rect x="1" y="1" width="1078" height="1078" fill="none" stroke="${BRAND.colors.border}" stroke-width="2"/>
  ${rippleField(BRAND.colors.brick, "translate(460 430) scale(8)", 0.07)}
  <rect x="82" y="82" width="280" height="68" rx="34" fill="${BRAND.colors.forest}"/>
  <circle cx="121" cy="116" r="10" fill="${BRAND.colors.cream}"/>
  <text x="148" y="126" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="28" font-weight="700">OPEN NOW</text>
  <text x="82" y="560" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="94" font-weight="600" letter-spacing="-1.6">
    <tspan x="82" dy="0">Place name</tspan><tspan x="82" dy="108">goes here</tspan>
  </text>
  <text x="86" y="820" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="34" font-weight="400">Useful detail · Town</text>
  <line x1="82" x2="998" y1="908" y2="908" stroke="${BRAND.colors.border}" stroke-width="2"/>
  <text x="82" y="986" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="43" font-weight="400">${BRAND.name}</text>`,
    fonts,
  );
}

function storyBrand(fonts: string): string {
  return svgShell(
    1080,
    1920,
    `<rect width="1080" height="1920" fill="${BRAND.colors.brick}"/>
  ${rippleField(BRAND.colors.cream, "translate(130 900) scale(11)", 0.15)}
  ${ripple("full", BRAND.colors.cream, "translate(85 96) scale(1.3)")}
  <text x="235" y="192" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="62" font-weight="400">${BRAND.name}</text>
  <text x="86" y="990" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="94" font-weight="600" letter-spacing="-1.2">
    <tspan x="86" dy="0">Frederick County starts</tspan><tspan x="86" dy="112">where you are.</tspan>
  </text>
  <text x="90" y="1780" fill="${BRAND.colors.cream}" fill-opacity=".82" font-family="Public Sans" font-size="27" font-weight="700" letter-spacing="4.4">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function ogDefault(fonts: string): string {
  return svgShell(
    1200,
    630,
    `<rect width="1200" height="630" fill="${BRAND.colors.brick}"/>
  ${rippleField(BRAND.colors.cream, "translate(720 -70) scale(6.8)", 0.14)}
  ${ripple("full", BRAND.colors.cream, "translate(74 150) scale(2.65)")}
  <text x="408" y="292" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="93" font-weight="400" letter-spacing="-1.4">${BRAND.name}</text>
  <text x="414" y="362" fill="${BRAND.colors.cream}" fill-opacity=".86" font-family="Public Sans" font-size="25" font-weight="700" letter-spacing="3">${TAGLINE_UPPER}</text>`,
    fonts,
  );
}

function posterYouAreHere(fonts: string, photoUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <clipPath id="poster-photo-a"><rect x="96" y="96" width="1608" height="1260" rx="18"/></clipPath>
    <linearGradient id="poster-wash-a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.ink}" stop-opacity=".38"/>
      <stop offset="24%" stop-color="${BRAND.colors.ink}" stop-opacity="0"/>
      <stop offset="42%" stop-color="${BRAND.colors.ink}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${BRAND.colors.ink}" stop-opacity=".72"/>
    </linearGradient>
  </defs>
  <rect width="1800" height="2400" fill="${BRAND.colors.cream}"/>
  <image href="${photoUrl}" x="96" y="96" width="1608" height="1260" preserveAspectRatio="xMidYMid slice" clip-path="url(#poster-photo-a)"/>
  <rect x="96" y="96" width="1608" height="1260" rx="18" fill="url(#poster-wash-a)"/>
  ${ripple("compact", BRAND.colors.cream, "translate(146 146) scale(1.25)")}
  <text x="302" y="240" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="62" font-weight="400">${BRAND.name}</text>
  <text x="148" y="1260" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="28" font-weight="700" letter-spacing="4.8">FREDERICK COUNTY, MARYLAND</text>
  <line x1="148" x2="1652" y1="1460" y2="1460" stroke="${BRAND.colors.brick}" stroke-width="8"/>
  <text x="148" y="1705" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="118" font-weight="600" letter-spacing="-2">
    <tspan x="148" dy="0">Frederick County starts</tspan><tspan x="148" dy="136">where you are.</tspan>
  </text>
  <text x="154" y="2115" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="43" font-weight="400">See what is around you across Frederick County.</text>
  <text x="154" y="2275" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="31" font-weight="700" letter-spacing="5.2">FREDERICKRADIUS.APP</text>
  <rect x="1490" y="2228" width="162" height="8" fill="${BRAND.colors.forest}"/>
  <circle cx="1660" cy="2232" r="12" fill="${BRAND.colors.forest}"/>`,
    fonts,
  );
}

function posterWholeCounty(fonts: string, photoUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <clipPath id="poster-photo-b"><rect width="1800" height="1370"/></clipPath>
    <linearGradient id="poster-wash-b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.ink}" stop-opacity=".3"/>
      <stop offset="22%" stop-color="${BRAND.colors.ink}" stop-opacity="0"/>
      <stop offset="52%" stop-color="${BRAND.colors.ink}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${BRAND.colors.ink}" stop-opacity=".55"/>
    </linearGradient>
  </defs>
  <rect width="1800" height="2400" fill="${BRAND.colors.brick}"/>
  <image href="${photoUrl}" width="1800" height="1370" preserveAspectRatio="xMidYMid slice" clip-path="url(#poster-photo-b)"/>
  <rect width="1800" height="1370" fill="url(#poster-wash-b)"/>
  <rect y="1362" width="1800" height="16" fill="${BRAND.colors.forest}"/>
  ${ripple("compact", BRAND.colors.cream, "translate(120 113) scale(1.12)")}
  <text x="268" y="198" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="58" font-weight="400">${BRAND.name}</text>
  <text x="128" y="1625" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="28" font-weight="700" letter-spacing="5">FREDERICK COUNTY, MARYLAND</text>
  <text x="128" y="1835" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="104" font-weight="600" letter-spacing="-1.5">
    <tspan x="128" dy="0">See what is around you</tspan><tspan x="128" dy="122">across Frederick County.</tspan>
  </text>
  <text x="134" y="2180" fill="${BRAND.colors.cream}" fill-opacity=".86" font-family="Public Sans" font-size="42" font-weight="400">${BRAND.tagline}</text>
  <line x1="134" x2="1666" y1="2252" y2="2252" stroke="${BRAND.colors.cream}" stroke-opacity=".32" stroke-width="2"/>
  <text x="134" y="2336" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="30" font-weight="700" letter-spacing="5.2">FREDERICKRADIUS.APP</text>`,
    fonts,
  );
}

function posterProduct(fonts: string, todayUiUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <clipPath id="today-screen"><rect x="1038" y="342" width="620" height="1145" rx="48"/></clipPath>
    <filter id="phone-shadow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="${BRAND.colors.ink}" flood-opacity=".2"/>
    </filter>
  </defs>
  <rect width="1800" height="2400" fill="${BRAND.colors.cream}"/>
  <rect x="0" y="0" width="790" height="2400" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.cream, "translate(112 114) scale(1.12)")}
  <text x="258" y="200" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="58" font-weight="400">${BRAND.name}</text>
  <text x="112" y="650" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="88" font-weight="650" letter-spacing="-1.8">
    <tspan x="112" dy="0">Find what is</tspan><tspan x="112" dy="104">open.</tspan><tspan x="112" dy="130">See what is</tspan><tspan x="112" dy="104">happening.</tspan>
  </text>
  <text x="112" y="1235" fill="${BRAND.colors.cream}" fill-opacity=".86" font-family="Public Sans" font-size="34" font-weight="400">
    <tspan x="112" dy="0">Current local information</tspan><tspan x="112" dy="50">for Frederick County.</tspan>
  </text>
  <text x="112" y="2255" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="28" font-weight="750" letter-spacing="4.2">FREDERICKRADIUS.APP</text>
  <rect x="1002" y="306" width="692" height="1217" rx="75" fill="${BRAND.colors.ink}" filter="url(#phone-shadow)"/>
  <image href="${todayUiUrl}" x="1038" y="342" width="620" height="1145" preserveAspectRatio="xMidYMin slice" clip-path="url(#today-screen)"/>
  <circle cx="1348" cy="326" r="8" fill="${BRAND.colors.controlBorder}"/>
  <text x="850" y="1810" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="24" font-weight="750" letter-spacing="3.8">THE TODAY VIEW</text>
  <text x="850" y="1945" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="50" font-weight="650" letter-spacing="-.7">
    <tspan x="850" dy="0">Today puts current conditions</tspan><tspan x="850" dy="66">beside what is happening nearby.</tspan>
  </text>
  <line x1="850" x2="1658" y1="2180" y2="2180" stroke="${BRAND.colors.border}" stroke-width="3"/>
  <text x="850" y="2265" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="30">Built for where you are right now.</text>`,
    fonts,
  );
}

function posterAskRadius(fonts: string, askUiUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <clipPath id="ask-screen"><rect x="146" y="356" width="630" height="1363" rx="52"/></clipPath>
    <filter id="ask-shadow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="${BRAND.colors.ink}" flood-opacity=".2"/>
    </filter>
  </defs>
  <rect width="1800" height="2400" fill="${BRAND.colors.cream}"/>
  <rect x="0" y="0" width="1800" height="22" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.brick, "translate(112 94) scale(1.08)")}
  <text x="252" y="177" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="58" font-weight="400">${BRAND.name}</text>
  <rect x="110" y="320" width="702" height="1436" rx="82" fill="${BRAND.colors.ink}" filter="url(#ask-shadow)"/>
  <image href="${askUiUrl}" x="146" y="356" width="630" height="1363" preserveAspectRatio="xMidYMin slice" clip-path="url(#ask-screen)"/>
  <text x="930" y="590" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="26" font-weight="750" letter-spacing="4.2">ASK RADIUS</text>
  <text x="930" y="760" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="102" font-weight="650" letter-spacing="-2">
    <tspan x="930" dy="0">Dinner before a</tspan><tspan x="930" dy="116">7:30 show?</tspan>
  </text>
  <text x="930" y="1085" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="39" font-weight="400">
    <tspan x="930" dy="0">Radius checks current local data</tspan><tspan x="930" dy="57">before it answers.</tspan>
  </text>
  <rect x="930" y="1300" width="650" height="112" rx="56" fill="${BRAND.colors.brick}"/>
  <text x="1255" y="1371" text-anchor="middle" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="32" font-weight="750">TRY ASK RADIUS</text>
  <rect x="930" y="1595" width="220" height="220" rx="12" fill="none" stroke="${BRAND.colors.controlBorder}" stroke-width="4" stroke-dasharray="14 12"/>
  <text x="1040" y="1688" text-anchor="middle" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="21" font-weight="750" letter-spacing="2.4"><tspan x="1040" dy="0">ADD TESTED</tspan><tspan x="1040" dy="31">QR CODE</tspan></text>
  <text x="1200" y="1672" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="33" font-weight="650">Scan or visit</text>
  <text x="1200" y="1726" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="30" font-weight="750">frederickradius.app</text>
  <line x1="930" x2="1645" y1="2105" y2="2105" stroke="${BRAND.colors.border}" stroke-width="3"/>
  <text x="930" y="2200" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="31">Answers reflect the guide's current local data.</text>`,
    fonts,
  );
}

function qrPlaceholder(x: number, y: number, size: number): string {
  const center = x + size / 2;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="none" stroke="${BRAND.colors.controlBorder}" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="${center}" y="${y + size / 2 - 9}" text-anchor="middle" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="18" font-weight="750" letter-spacing="1.4"><tspan x="${center}" dy="0">ADD TESTED</tspan><tspan x="${center}" dy="25">QR CODE</tspan></text>`;
}

function qrGroup(
  url: string,
  x: number,
  y: number,
  size: number,
  dark = BRAND.colors.ink,
  light = BRAND.colors.cream,
): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const margin = 4;
  const cell = Math.max(1, Math.floor(size / (count + margin * 2)));
  const renderedSize = cell * (count + margin * 2);
  const offsetX = x + (size - renderedSize) / 2;
  const offsetY = y + (size - renderedSize) / 2;
  const modules: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.modules.get(row, col)) continue;
      modules.push(
        `<rect x="${offsetX + (col + margin) * cell}" y="${offsetY + (row + margin) * cell}" width="${cell}" height="${cell}" fill="${dark}"/>`,
      );
    }
  }
  return `<g shape-rendering="crispEdges">
    <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${light}"/>
    ${modules.join("\n    ")}
  </g>`;
}

function posterFieldGuide(fonts: string, artworkUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <linearGradient id="field-guide-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.cream}" stop-opacity=".02"/>
      <stop offset="68%" stop-color="${BRAND.colors.cream}" stop-opacity=".04"/>
      <stop offset="100%" stop-color="${BRAND.colors.cream}" stop-opacity=".68"/>
    </linearGradient>
  </defs>
  <image href="${artworkUrl}" width="1800" height="2400" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1800" height="2400" fill="url(#field-guide-shade)"/>
  <rect x="0" width="22" height="2400" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.brick, "translate(116 105) scale(1.02)")}
  <text x="248" y="184" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="56" font-weight="400">${BRAND.name}</text>
  <text x="122" y="388" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="24" font-weight="750" letter-spacing="4.7">A DIGITAL FIELD GUIDE FOR FREDERICK COUNTY</text>
  <text x="116" y="625" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="142" font-weight="400" letter-spacing="-2.4">
    <tspan x="116" dy="0">A field guide</tspan><tspan x="116" dy="146">that knows what</tspan><tspan x="116" dy="146">time it is.</tspan>
  </text>
  <text x="122" y="2172" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="36" font-weight="500">
    <tspan x="122" dy="0">Current local information, organized</tspan><tspan x="122" dy="50">around where you are.</tspan>
  </text>
  <text x="122" y="2320" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="27" font-weight="750" letter-spacing="4.2">FREDERICKRADIUS.APP</text>
  <rect x="1390" y="2020" width="286" height="286" rx="18" fill="${BRAND.colors.cream}"/>
  ${qrGroup(POSTER_QR_URL, 1413, 2043, 240)}`,
    fonts,
  );
}

function posterRightNow(fonts: string, photoUrl: string): string {
  return svgShell(
    1800,
    2400,
    `<defs>
    <linearGradient id="right-now-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.colors.ink}" stop-opacity=".1"/>
      <stop offset="42%" stop-color="${BRAND.colors.ink}" stop-opacity=".04"/>
      <stop offset="100%" stop-color="${BRAND.colors.ink}" stop-opacity=".9"/>
    </linearGradient>
  </defs>
  <image href="${photoUrl}" width="1800" height="2400" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1800" height="2400" fill="url(#right-now-shade)"/>
  <rect x="0" width="22" height="2400" fill="${BRAND.colors.brick}"/>
  ${ripple("compact", BRAND.colors.cream, "translate(116 106) scale(1.06)")}
  <text x="254" y="190" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="58" font-weight="400">${BRAND.name}</text>
  <text x="122" y="1425" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="154" font-weight="400" letter-spacing="-2.8">
    <tspan x="122" dy="0">See Frederick</tspan><tspan x="122" dy="156">as it is</tspan><tspan x="122" dy="156">right now.</tspan>
  </text>
  <text x="128" y="2048" fill="${BRAND.colors.cream}" fill-opacity=".86" font-family="Public Sans" font-size="35" font-weight="500">
    <tspan x="128" dy="0">What is useful around you changes by the hour.</tspan><tspan x="128" dy="51">Radius keeps the current view in one place.</tspan>
  </text>
  <text x="128" y="2308" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="27" font-weight="750" letter-spacing="4.2">FREDERICKRADIUS.APP</text>
  <rect x="1390" y="2050" width="286" height="286" rx="18" fill="${BRAND.colors.cream}"/>
  ${qrGroup(POSTER_QR_URL, 1413, 2073, 240)}`,
    fonts,
  );
}

function nfcSignalFront(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.cream}"/>
  <rect x="0" width="18" height="713" fill="${BRAND.colors.brick}"/>
  ${rippleField(BRAND.colors.paperDeep, "translate(590 72) scale(5.4)", 1)}
  ${ripple("compact", BRAND.colors.brick, "translate(70 54) scale(.72)")}
  <text x="166" y="117" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="40" font-weight="400">${BRAND.name}</text>
  <text x="70" y="360" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="92" font-weight="400" letter-spacing="-1.5">Tap to start nearby.</text>
  <text x="74" y="438" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="25" font-weight="500">${BRAND.tagline}</text>
  <circle cx="894" cy="535" r="17" fill="${BRAND.colors.brick}"/>
  <text x="74" y="618" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="18" font-weight="750" letter-spacing="2.8">NFC ENABLED · TAP THE FRONT</text>`,
    fonts,
  );
}

function nfcSignalBack(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.ink}"/>
  <rect x="0" width="18" height="713" fill="${BRAND.colors.brick}"/>
  <text x="78" y="123" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="20" font-weight="750" letter-spacing="3.2">FREDERICK RADIUS</text>
  <text x="76" y="280" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="72" font-weight="400"><tspan x="76" dy="0">Tap the front.</tspan><tspan x="76" dy="78">Scan if you cannot.</tspan></text>
  <text x="80" y="520" fill="${BRAND.colors.cream}" fill-opacity=".76" font-family="Public Sans" font-size="23">No download. No account required.</text>
  <text x="80" y="606" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="21" font-weight="750" letter-spacing="2.6">FREDERICKRADIUS.APP</text>
  <rect x="734" y="122" width="292" height="338" rx="22" fill="${BRAND.colors.cream}"/>
  ${qrGroup(CARD_QR_URL, 760, 148, 240)}
  <text x="880" y="430" text-anchor="middle" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="16" font-weight="750" letter-spacing="2">SCAN TO OPEN</text>
  ${ripple("compact", BRAND.colors.cream, "translate(810 504) scale(1.34)")}`,
    fonts,
  );
}

function nfcGeneralFront(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.brick}"/>
  ${ripple("full", BRAND.colors.cream, "translate(73 81) scale(3.2)")}
  <text x="445" y="305" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="86" font-weight="400">Frederick</text>
  <text x="445" y="391" fill="${BRAND.colors.cream}" font-family="Libre Caslon Display" font-size="86" font-weight="400">Radius</text>
  <text x="449" y="465" fill="${BRAND.colors.cream}" fill-opacity=".9" font-family="Public Sans" font-size="24" font-weight="650">${BRAND.tagline}</text>
  <text x="449" y="596" fill="${BRAND.colors.cream}" fill-opacity=".78" font-family="Public Sans" font-size="19" font-weight="650" letter-spacing="2.6">TAP THE CARD TO OPEN</text>`,
    fonts,
  );
}

function nfcGeneralBack(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.cream}"/>
  <rect x="0" y="0" width="20" height="713" fill="${BRAND.colors.brick}"/>
  <text x="112" y="175" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="22" font-weight="750" letter-spacing="3.5">TAP FOR FREDERICK RADIUS</text>
  <text x="112" y="300" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="54" font-weight="650" letter-spacing="-.8"><tspan x="112" dy="0">Current local information</tspan><tspan x="112" dy="68">for Frederick County.</tspan></text>
  <text x="112" y="510" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="25">If tapping does not work, scan the tested QR code</text>
  <text x="112" y="548" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="25">or visit the printed address.</text>
  <text x="112" y="622" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="24" font-weight="750">FREDERICKRADIUS.APP</text>
  ${qrPlaceholder(784, 150, 220)}`,
    fonts,
  );
}

function nfcPartnerFront(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.cream}"/>
  <rect x="0" y="0" width="1088" height="20" fill="${BRAND.colors.forest}"/>
  ${ripple("compact", BRAND.colors.brick, "translate(76 66) scale(.82)")}
  <text x="183" y="143" fill="${BRAND.colors.ink}" font-family="Libre Caslon Display" font-size="44" font-weight="400">${BRAND.name}</text>
  <rect x="76" y="218" width="420" height="294" rx="24" fill="none" stroke="${BRAND.colors.controlBorder}" stroke-width="3" stroke-dasharray="13 10"/>
  <text x="286" y="354" text-anchor="middle" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="22" font-weight="750" letter-spacing="2.2"><tspan x="286" dy="0">ADD PARTNER</tspan><tspan x="286" dy="31">LOGO</tspan></text>
  <text x="566" y="297" fill="${BRAND.colors.brick}" font-family="Public Sans" font-size="20" font-weight="750" letter-spacing="3.1">RADIUS PARTNER</text>
  <text x="566" y="385" fill="${BRAND.colors.ink}" font-family="Public Sans" font-size="45" font-weight="650"><tspan x="566" dy="0">PARTNER OR</tspan><tspan x="566" dy="57">VENUE NAME</tspan></text>
  <text x="566" y="510" fill="${BRAND.colors.mutedInk}" font-family="Public Sans" font-size="23">Town or neighborhood</text>
  <text x="76" y="625" fill="${BRAND.colors.forest}" font-family="Public Sans" font-size="19" font-weight="750" letter-spacing="2.5">TAP FOR CURRENT DETAILS</text>`,
    fonts,
  );
}

function nfcPartnerBack(fonts: string): string {
  return svgShell(
    1088,
    713,
    `<rect width="1088" height="713" fill="${BRAND.colors.forest}"/>
  <text x="82" y="150" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="21" font-weight="750" letter-spacing="3.3">TAP TO OPEN</text>
  <text x="82" y="270" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="51" font-weight="650" letter-spacing="-.7"><tspan x="82" dy="0">CURRENT OFFER, MENU,</tspan><tspan x="82" dy="64">EVENT, OR VENUE PAGE</tspan></text>
  <line x1="82" x2="720" y1="444" y2="444" stroke="${BRAND.colors.cream}" stroke-opacity=".28" stroke-width="2"/>
  <text x="82" y="512" fill="${BRAND.colors.cream}" fill-opacity=".82" font-family="Public Sans" font-size="22">Printed fallback:</text>
  <text x="82" y="560" fill="${BRAND.colors.cream}" font-family="Public Sans" font-size="23" font-weight="750">FREDERICKRADIUS.APP/YOUR-LINK</text>
  <text x="82" y="634" fill="${BRAND.colors.cream}" fill-opacity=".74" font-family="Public Sans" font-size="18">Replace every placeholder and test the programmed card before printing.</text>
  <rect x="784" y="150" width="220" height="220" rx="10" fill="${BRAND.colors.cream}"/>
  ${qrPlaceholder(784, 150, 220)}
  ${ripple("compact", BRAND.colors.cream, "translate(841 478) scale(1.05)")}`,
    fonts,
  );
}

async function main() {
  assertLockedBrandContract();
  await assertBrandGuidanceIsCurrent();

  const [
    displayFont,
    textFont,
    textItalicFont,
    summerPhoto,
    fallPhoto,
    nightPhoto,
    cartographicArtwork,
    todayUi,
    askUi,
  ] = await Promise.all([
    readFile(FONT_SOURCE.display),
    readFile(FONT_SOURCE.text),
    readFile(FONT_SOURCE.textItalic),
    readFile(path.join(ROOT, "public/images/seasons/summer/SUMMER MUST USE.jpg")),
    readFile(path.join(ROOT, "public/images/seasons/fall/FALL COLORS.jpg")),
    readFile(path.join(ROOT, "public/images/seasons/spring/Frederick Night.jpg")),
    readFile(path.join(OUT, "campaign/cartographic-ripple-background.png")),
    readFile(path.join(OUT, "examples/ui-today-mobile.webp")),
    readFile(path.join(OUT, "examples/ui-ask-radius-mobile.webp")),
  ]);
  const embeddedFonts = fontCss(
    `data:font/woff2;base64,${displayFont.toString("base64")}`,
    `data:font/woff2;base64,${textFont.toString("base64")}`,
    `data:font/woff2;base64,${textItalicFont.toString("base64")}`,
  );
  const summerPhotoUrl = `data:image/jpeg;base64,${summerPhoto.toString("base64")}`;
  const fallPhotoUrl = `data:image/jpeg;base64,${fallPhoto.toString("base64")}`;
  const nightPhotoUrl = `data:image/jpeg;base64,${nightPhoto.toString("base64")}`;
  const cartographicArtworkUrl = `data:image/png;base64,${cartographicArtwork.toString("base64")}`;
  const todayUiUrl = `data:image/webp;base64,${todayUi.toString("base64")}`;
  const askUiUrl = `data:image/webp;base64,${askUi.toString("base64")}`;

  await Promise.all([
    mkdir(path.join(OUT, "marks"), { recursive: true }),
    mkdir(path.join(OUT, "lockups"), { recursive: true }),
    mkdir(path.join(OUT, "social"), { recursive: true }),
    mkdir(path.join(OUT, "posters"), { recursive: true }),
    mkdir(path.join(OUT, "nfc"), { recursive: true }),
    mkdir(path.join(OUT, "campaign"), { recursive: true }),
    mkdir(path.join(OUT, "examples"), { recursive: true }),
    mkdir(path.join(OUT, "fonts"), { recursive: true }),
    mkdir(path.join(OUT, "fonts/static"), { recursive: true }),
    mkdir(path.join(OUT, "licenses"), { recursive: true }),
  ]);

  await Promise.all([
    copyFile(FONT_SOURCE.display, path.join(OUT, "fonts/libre-caslon-display-400.woff2")),
    copyFile(FONT_SOURCE.text, path.join(OUT, "fonts/public-sans-variable.woff2")),
    copyFile(FONT_SOURCE.textItalic, path.join(OUT, "fonts/public-sans-variable-italic.woff2")),
    copyFile(FONT_SOURCE.displayDesktop, path.join(OUT, "fonts/LibreCaslonDisplay-Regular.ttf")),
    copyFile(FONT_SOURCE.textDesktop, path.join(OUT, "fonts/PublicSans-Variable.ttf")),
    copyFile(FONT_SOURCE.textItalicDesktop, path.join(OUT, "fonts/PublicSans-VariableItalic.ttf")),
    ...STATIC_PUBLIC_SANS.map(({ file }) =>
      copyFile(
        path.join(FONT_SOURCE.staticDesktopDir, file),
        path.join(OUT, "fonts/static", file),
      ),
    ),
    copyFile(FONT_SOURCE.readme, path.join(OUT, "fonts/README.md")),
    copyFile(
      path.join(ROOT, "public/from-above/photos/pg-001-bb09@1200.webp"),
      path.join(OUT, "examples/frederick-aerial.webp"),
    ),
    copyFile(
      path.join(ROOT, "node_modules/@fontsource/libre-caslon-display/LICENSE"),
      path.join(OUT, "licenses/OFL-Libre-Caslon-Display.txt"),
    ),
    copyFile(
      path.join(ROOT, "node_modules/@fontsource-variable/public-sans/LICENSE"),
      path.join(OUT, "licenses/OFL-Public-Sans.txt"),
    ),
  ]);

  const assets: Asset[] = [
    markAsset("full", BRAND.colors.brick, null, "Primary mark at 48px and larger"),
    markAsset("full", BRAND.colors.cream, null, "Reverse primary mark at 48px and larger"),
    markAsset("compact", BRAND.colors.brick, null, "Compact mark from 24px to 47px"),
    markAsset("compact", BRAND.colors.cream, null, "Reverse compact mark from 24px to 47px"),
    markAsset("favicon", BRAND.colors.brick, null, "Single-arc favicon mark below 24px"),
    markAsset("favicon", BRAND.colors.cream, null, "Reverse single-arc favicon mark below 24px"),
    markAsset("full", BRAND.colors.cream, BRAND.colors.brick, "Brick app icon"),
    lockupAsset(false, false),
    lockupAsset(true, false),
    lockupAsset(false, true),
    lockupAsset(true, true),
    {
      file: "lockups/stacked-brick.svg",
      width: 800,
      height: 800,
      role: "Stacked lockup with brand tagline",
      png: true,
      make: stackedLockup,
    },
    {
      file: "lockups/stacked-cream.svg",
      width: 800,
      height: 800,
      role: "Reverse stacked lockup with brand tagline",
      png: true,
      make: (fonts) => stackedLockup(fonts, true),
    },
    {
      file: "social/avatar.svg",
      width: 1024,
      height: 1024,
      role: "Canonical social avatar",
      png: true,
      make: socialAvatar,
    },
    {
      file: "social/facebook-cover.svg",
      width: 1640,
      height: 624,
      role: "Facebook cover with a centered desktop and mobile safe-area lockup",
      png: true,
      make: facebookCover,
    },
    {
      file: "social/facebook-cover-photo.svg",
      width: 1640,
      height: 624,
      role: "Natural-photography Facebook cover with mobile-safe lockup",
      png: true,
      make: (fonts) => facebookPhotoCover(fonts, fallPhotoUrl),
    },
    {
      file: "social/feed-brand.svg",
      width: 1080,
      height: 1080,
      role: "Square brand post",
      png: true,
      make: feedBrand,
    },
    {
      file: "social/feed-portrait.svg",
      width: 1080,
      height: 1350,
      role: "Portrait brand post",
      png: true,
      make: feedPortrait,
    },
    {
      file: "social/facebook-group-launch.svg",
      width: 1080,
      height: 1350,
      role: "Facebook food-truck launch post using owned Frederick photography",
      png: true,
      make: (fonts) => facebookGroupLaunch(fonts, fallPhotoUrl),
    },
    {
      file: "social/photo-post-template.svg",
      width: 1080,
      height: 1350,
      role: "Editable owned-photography post template",
      png: true,
      make: photoPostTemplate,
    },
    {
      file: "social/photo-story-template.svg",
      width: 1080,
      height: 1920,
      role: "Editable owned-photography story template",
      png: true,
      make: photoStoryTemplate,
    },
    {
      file: "social/feed-event-template.svg",
      width: 1080,
      height: 1080,
      role: "Editable square event template",
      png: true,
      make: feedEvent,
    },
    {
      file: "social/feed-live-template.svg",
      width: 1080,
      height: 1080,
      role: "Editable open-now template",
      png: true,
      make: feedLive,
    },
    {
      file: "social/story-brand.svg",
      width: 1080,
      height: 1920,
      role: "Story brand frame",
      png: true,
      make: storyBrand,
    },
    {
      file: "social/og-default.svg",
      width: 1200,
      height: 630,
      role: "Default Open Graph share card",
      png: true,
      make: ogDefault,
    },
    {
      file: "posters/you-are-here.svg",
      width: 1800,
      height: 2400,
      role: "Portrait poster using owned Frederick photography",
      png: true,
      make: (fonts) => posterYouAreHere(fonts, summerPhotoUrl),
    },
    {
      file: "posters/whole-county.svg",
      width: 1800,
      height: 2400,
      role: "Portrait countywide launch poster using owned Frederick photography",
      png: true,
      make: (fonts) => posterWholeCounty(fonts, fallPhotoUrl),
    },
    {
      file: "posters/product-today.svg",
      width: 1800,
      height: 2400,
      role: "18 by 24 product poster using the current Today interface",
      png: true,
      make: (fonts) => posterProduct(fonts, todayUiUrl),
    },
    {
      file: "posters/ask-radius.svg",
      width: 1800,
      height: 2400,
      role: "18 by 24 Ask Radius activation poster using the current interface",
      png: true,
      make: (fonts) => posterAskRadius(fonts, askUiUrl),
    },
    {
      file: "campaign/poster-field-guide.svg",
      width: 1800,
      height: 2400,
      role: "18 by 24 campaign poster built around the live field-guide idea",
      png: true,
      pdf: { width: "18in", height: "24in" },
      make: (fonts) => posterFieldGuide(fonts, cartographicArtworkUrl),
    },
    {
      file: "campaign/poster-right-now.svg",
      width: 1800,
      height: 2400,
      role: "18 by 24 campaign poster using owned Frederick night photography",
      png: true,
      pdf: { width: "18in", height: "24in" },
      make: (fonts) => posterRightNow(fonts, nightPhotoUrl),
    },
    {
      file: "nfc/general-front.svg",
      width: 1088,
      height: 713,
      role: "CR80 general NFC card front with 0.125 inch bleed at 300 dpi",
      png: true,
      make: nfcGeneralFront,
    },
    {
      file: "nfc/general-back.svg",
      width: 1088,
      height: 713,
      role: "CR80 general NFC card back with printed URL and tested-QR placeholder",
      png: true,
      make: nfcGeneralBack,
    },
    {
      file: "nfc/partner-front.svg",
      width: 1088,
      height: 713,
      role: "CR80 partner or venue NFC card front template",
      png: true,
      make: nfcPartnerFront,
    },
    {
      file: "nfc/partner-back.svg",
      width: 1088,
      height: 713,
      role: "CR80 partner or venue NFC card back template with URL and QR placeholders",
      png: true,
      make: nfcPartnerBack,
    },
    {
      file: "nfc/signal-front.svg",
      width: 1088,
      height: 713,
      role: "CR80 premium Radius Signal NFC card front",
      png: true,
      pdf: { width: "3.625in", height: "2.375in" },
      make: nfcSignalFront,
    },
    {
      file: "nfc/signal-back.svg",
      width: 1088,
      height: 713,
      role: "CR80 premium Radius Signal NFC card back with a working QR fallback",
      png: true,
      pdf: { width: "3.625in", height: "2.375in" },
      make: nfcSignalBack,
    },
  ];

  // Keep exported SVGs self-contained: embedded OFL font files mean the
  // wordmark stays correct when an asset is opened outside this repo. Raster
  // through Chromium rather than librsvg/Sharp; Chromium honors SVG @font-face
  // while librsvg silently fell back to a generic sans for embedded WOFF2.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const asset of assets) {
      const destination = path.join(OUT, asset.file);
      const source = asset.make(embeddedFonts);
      assertUsesOnlyBrandColors(asset.file, source);
      await writeFile(destination, source);
      if (asset.png) {
        const pngDestination = destination.replace(/\.svg$/, ".png");
        await page.setViewportSize({ width: asset.width, height: asset.height });
        await page.setContent(
          `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${source}</body></html>`,
          { waitUntil: "load" },
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: pngDestination, omitBackground: true });
      }
      if (asset.pdf) {
        await page.evaluate(() => {
          const svg = document.querySelector("svg");
          if (!svg) return;
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.style.width = "100vw";
          svg.style.height = "100vh";
        });
        await page.pdf({
          path: destination.replace(/\.svg$/, ".pdf"),
          width: asset.pdf.width,
          height: asset.pdf.height,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          printBackground: true,
          pageRanges: "1",
        });
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    brand: BRAND,
    generatedAt: new Date().toISOString(),
    source: "scripts/build-brand-assets.ts",
    fonts: [
      {
        file: "fonts/LibreCaslonDisplay-Regular.ttf",
        family: "Libre Caslon Display",
        format: "TrueType",
        style: "normal",
        weight: "400",
        role: "Installable desktop font for the wordmark and rare editorial or hero moments",
        license: "licenses/OFL-Libre-Caslon-Display.txt",
      },
      {
        file: "fonts/PublicSans-Variable.ttf",
        family: "Public Sans",
        format: "TrueType variable",
        style: "normal",
        weight: "100 900",
        role: "Installable desktop font for product titles, interface, text, and data",
        license: "licenses/OFL-Public-Sans.txt",
      },
      {
        file: "fonts/PublicSans-VariableItalic.ttf",
        family: "Public Sans",
        format: "TrueType variable",
        style: "italic",
        weight: "100 900",
        role: "Installable desktop italic for emphasis and attribution",
        license: "licenses/OFL-Public-Sans.txt",
      },
      ...STATIC_PUBLIC_SANS.map(({ file, style, weight }) => ({
        file: `fonts/static/${file}`,
        family: "Public Sans",
        format: "TrueType static",
        style,
        weight,
        role: "Compatibility desktop font for design software without variable-font support",
        license: "licenses/OFL-Public-Sans.txt",
      })),
      {
        file: "fonts/libre-caslon-display-400.woff2",
        family: "Libre Caslon Display",
        format: "WOFF2",
        style: "normal",
        weight: "400",
        role: "Browser font used by the guide and generated assets",
        license: "licenses/OFL-Libre-Caslon-Display.txt",
      },
      {
        file: "fonts/public-sans-variable.woff2",
        family: "Public Sans",
        format: "WOFF2 variable",
        style: "normal",
        weight: "100 900",
        role: "Browser font used by the guide and generated assets",
        license: "licenses/OFL-Public-Sans.txt",
      },
      {
        file: "fonts/public-sans-variable-italic.woff2",
        family: "Public Sans",
        format: "WOFF2 variable",
        style: "italic",
        weight: "100 900",
        role: "Browser italic used by the guide and generated assets",
        license: "licenses/OFL-Public-Sans.txt",
      },
    ],
    assets: assets.map(({ file, width, height, role, png, pdf }) => ({
      file,
      width,
      height,
      role,
      exports: ["svg", ...(png ? ["png"] : []), ...(pdf ? ["pdf"] : [])],
    })),
    platform: {
      iconVersion: PLATFORM_BRAND.iconVersion,
      themeColor: PLATFORM_BRAND.themeColor,
      generatedBy: "scripts/build-push-icons.ts",
      assets: [
        { file: "public/icons/icon.svg", url: PLATFORM_BRAND.icons.anySvg, role: "PWA launcher SVG" },
        { file: "public/icons/icon-192.png", url: PLATFORM_BRAND.icons.any192, role: "192 px launcher and push icon" },
        { file: "public/icons/icon-512.png", url: PLATFORM_BRAND.icons.any512, role: "512 px launcher" },
        { file: "public/icons/icon-maskable.svg", url: PLATFORM_BRAND.icons.maskableSvg, role: "Maskable launcher SVG" },
        { file: "public/icons/icon-maskable-512.png", url: PLATFORM_BRAND.icons.maskable512, role: "512 px maskable launcher" },
        { file: "src/app/apple-icon.png", url: PLATFORM_BRAND.icons.apple180, role: "180 px Apple touch icon" },
        { file: "public/icons/badge-72.png", url: PLATFORM_BRAND.icons.badge, role: "72 px monochrome notification badge" },
        { file: "src/app/icon.png", role: "32 px browser app icon" },
        { file: "src/app/favicon.ico", role: "16, 32, and 48 px multi-image favicon" },
      ],
      dynamic: [
        { route: "/apple-splash", role: "Installed-app launch image" },
        { route: "/api/og", role: "1200 by 630 Open Graph or 1080 by 1920 story image" },
      ],
    },
  };
  const tokenCss = `:root {\n${Object.entries(BRAND.colors)
    .map(([name, value]) => `  --radius-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value};`)
    .join("\n")}\n  --radius-font-display: "${BRAND.type.display}";\n  --radius-font-text: "${BRAND.type.text}";\n}\n`;
  await Promise.all([
    writeFile(path.join(OUT, "tokens.json"), `${JSON.stringify(BRAND, null, 2)}\n`),
    writeFile(path.join(OUT, "tokens.css"), tokenCss),
  ]);
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${assets.length} source assets and requested exports in ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
