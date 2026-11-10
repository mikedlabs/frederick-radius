import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { contrastRatio, type RGB } from "@/lib/color/brandHue";
import PlaceHero from "./PlaceHero";

/**
 * The photoless place hero. About nine in ten place pages have no photograph,
 * so this plate is the first thing most visitors see on a place. It is one
 * flat sunken band with the category emblem centered and the category pill in
 * the corner. These stories pin its geometry and its readability on the two
 * common phone widths in both appearances, and at 320 with the longest
 * category name. The shorter card band is pinned at a two-up card width,
 * where that same label reaches across the emblem's column.
 */

/** A slug with no owned, curated or provider photo, so the plan is empty. */
const slug = "component-workshop-photoless-place";

/** The place page insets the hero card 16px from each viewport edge. */
const PAGE_GUTTER = 32;

function setAppearance(appearance: "light" | "dark") {
  const root = document.documentElement;
  const previous = root.getAttribute("data-appearance");
  root.setAttribute("data-appearance", appearance);
  return () => {
    if (previous === null) root.removeAttribute("data-appearance");
    else root.setAttribute("data-appearance", previous);
  };
}

/** Resolve any CSS color, including a token or a color-mix(), to sRGB bytes. */
function resolveColor(value: string): RGB {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true })!;
  const swatch = document.createElement("span");
  swatch.style.color = value;
  document.body.appendChild(swatch);
  context.fillStyle = getComputedStyle(swatch).color;
  swatch.remove();
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

async function expectPhotolessPlate(
  canvasElement: HTMLElement,
  appearance: "light" | "dark",
  category: string,
  size: "hero" | "card",
) {
  const label = CATEGORY_BY_SLUG[category].name;
  await expect(document.documentElement.getAttribute("data-appearance")).toBe(appearance);

  const hero = canvasElement.querySelector<HTMLElement>("[data-place-hero]")!;
  const plate = hero.querySelector<HTMLElement>("[data-place-hero-plate]")!;
  const seal = hero.querySelector<HTMLElement>("[data-place-hero-seal]")!;
  const pill = hero.querySelector<HTMLElement>("[data-place-hero-pill]")!;
  await expect(hero).toHaveAttribute("data-place-hero-source", "none");
  await expect(hero.querySelector("img")).toBeNull();

  const heroBox = hero.getBoundingClientRect();
  const plateBox = plate.getBoundingClientRect();
  const sealBox = seal.getBoundingClientRect();
  const pillBox = pill.getBoundingClientRect();
  const geometry = JSON.stringify({ hero: heroBox, plate: plateBox, seal: sealBox, pill: pillBox });

  // The plate fills the whole band. It once collapsed to the emblem's height,
  // which left the emblem jammed against the top edge of the card.
  await expect(heroBox.height, geometry).toBe(size === "hero" ? 148 : 96);
  await expect(Math.abs(plateBox.height - heroBox.height), geometry).toBeLessThanOrEqual(1);
  await expect(Math.abs(plateBox.width - heroBox.width), geometry).toBeLessThanOrEqual(1);

  // The hero emblem is centered in the band. The card band is too short to
  // center an emblem clear of the pill, so there it is centered in the space
  // the pill leaves, with the same gap above and below.
  const gapAbove = sealBox.top - (size === "hero" ? heroBox.top : pillBox.bottom);
  const gapBelow = heroBox.bottom - sealBox.bottom;
  await expect(Math.abs(gapAbove - gapBelow), geometry).toBeLessThanOrEqual(1);
  await expect(gapAbove, geometry).toBeGreaterThanOrEqual(size === "hero" ? 36 : 8);
  const gapLeft = sealBox.left - heroBox.left;
  const gapRight = heroBox.right - sealBox.right;
  await expect(Math.abs(gapLeft - gapRight), geometry).toBeLessThanOrEqual(1);

  // The category pill stays inside the band and never covers the emblem.
  const intersects = pillBox.left < sealBox.right && pillBox.right > sealBox.left
    && pillBox.top < sealBox.bottom && pillBox.bottom > sealBox.top;
  await expect(intersects, geometry).toBe(false);
  await expect(pillBox.left, geometry).toBeGreaterThanOrEqual(heroBox.left);
  await expect(pillBox.right, geometry).toBeLessThanOrEqual(heroBox.right);
  await expect(within(pill).getByText(label)).toBeVisible();

  // One flat surface: no gradient, no glow layer and no corner marks.
  const plateStyle = getComputedStyle(plate);
  await expect(plateStyle.backgroundImage).toBe("none");
  await expect(resolveColor(plateStyle.backgroundColor)).toEqual(resolveColor("var(--app-bg-sunken)"));
  await expect(getComputedStyle(plate, "::before").content).toBe("none");
  await expect(getComputedStyle(plate, "::after").content).toBe("none");
  await expect(getComputedStyle(seal).boxShadow).toBe("none");
  const layers = [...hero.children].filter((child) => child !== plate && child !== pill);
  await expect(layers).toHaveLength(0);

  // The pill is a themed surface with an ink label, not a white photo overlay.
  const pillStyle = getComputedStyle(pill);
  const pillSurface = resolveColor(pillStyle.backgroundColor);
  await expect(pillSurface).toEqual(resolveColor("var(--app-bg-elevated-solid)"));
  await expect(resolveColor(pillStyle.color)).toEqual(resolveColor("var(--app-ink-2)"));
  await expect(contrastRatio(resolveColor(pillStyle.color), pillSurface)).toBeGreaterThanOrEqual(4.5);
  await expect(pillStyle.backdropFilter === "none" || pillStyle.backdropFilter === "").toBe(true);

  // The glyphs must stay visible on their own surfaces in this appearance.
  const pillGlyph = pill.querySelector<SVGElement>("svg")!;
  await expect(contrastRatio(resolveColor(getComputedStyle(pillGlyph).color), pillSurface)).toBeGreaterThanOrEqual(3);
  const sealGlyph = seal.querySelector<SVGElement>("svg")!;
  await expect(
    contrastRatio(resolveColor(getComputedStyle(sealGlyph).color), resolveColor(getComputedStyle(seal).backgroundColor)),
  ).toBeGreaterThanOrEqual(3);

  await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
}

function photoless(
  viewport: "radiusMobileNarrow" | "radiusMobileCompact" | "radiusMobile",
  viewportWidth: number,
  appearance: "light" | "dark",
  category: string,
  size: "hero" | "card" = "hero",
): Story {
  return {
    args: { category, size },
    globals: { viewport: { value: viewport, isRotated: false } },
    beforeEach: () => setAppearance(appearance),
    decorators: [
      (Story) => (
        <div
          className="overflow-hidden rounded-[var(--app-radius-xl)] tactile tactile-e2"
          style={{ width: viewportWidth - PAGE_GUTTER }}
        >
          <Story />
        </div>
      ),
    ],
    play: async ({ canvasElement }) => expectPhotolessPlate(canvasElement, appearance, category, size),
  };
}

const meta = {
  title: "Places/Photoless hero",
  component: PlaceHero,
  parameters: { layout: "centered" },
  args: { slug, name: "Workshop place without a photograph", category: "worship", size: "hero", priority: true },
} satisfies Meta<typeof PlaceHero>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Compact375Light = photoless("radiusMobileCompact", 375, "light", "worship");
export const Compact375Dark = photoless("radiusMobileCompact", 375, "dark", "worship");
export const Phone390Light = photoless("radiusMobile", 390, "light", "worship");
export const Phone390Dark = photoless("radiusMobile", 390, "dark", "worship");

/** The longest category name on the narrowest supported phone. */
export const LongestLabelAt320Light = photoless("radiusMobileNarrow", 320, "light", "agritourism");
export const LongestLabelAt320Dark = photoless("radiusMobileNarrow", 320, "dark", "agritourism");

/** The 96px card band at a two-up card width (200px less the page gutter),
 * where the longest label spans the card and crosses the emblem's column. */
export const CardBandLongestLabelLight = photoless("radiusMobileNarrow", 200, "light", "agritourism", "card");
export const CardBandLongestLabelDark = photoless("radiusMobileNarrow", 200, "dark", "agritourism", "card");
