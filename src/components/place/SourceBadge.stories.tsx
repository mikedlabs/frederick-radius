import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { contrastRatio, type RGB } from "@/lib/color/brandHue";
import type { PlaceCardData } from "@/lib/loaders/places";
import SourceBadge, { SOURCE_BADGE_META, type SourceBadgeTier } from "./SourceBadge";

/**
 * Where a place record came from, in the two sizes the app uses: a compact
 * tinted capsule on cards and in the place sheet, and a glyph with plain text
 * in the place detail header. Every tier has to stay readable in both
 * appearances, and "Radius reviewed" must not look verified or generated.
 */

const SOURCES: Record<SourceBadgeTier, Pick<PlaceCardData, "source" | "is_verified" | "google_verified">> = {
  reviewed: { source: "manual", is_verified: false, google_verified: false },
  checked: { source: "discovered", is_verified: true, google_verified: true },
  community: { source: "dfp", is_verified: false, google_verified: false },
  official: { source: "fc-gis", is_verified: false, google_verified: false },
};
const TIERS = Object.keys(SOURCES) as SourceBadgeTier[];

function setAppearance(appearance: "light" | "dark") {
  const root = document.documentElement;
  const previous = root.getAttribute("data-appearance");
  root.setAttribute("data-appearance", appearance);
  return () => {
    if (previous === null) root.removeAttribute("data-appearance");
    else root.setAttribute("data-appearance", previous);
  };
}

/** Paint a CSS color over an opaque base and read back the sRGB bytes, so
 * color-mix() results and translucent tints compare as the eye sees them. */
function paint(color: string, base: RGB = { r: 255, g: 255, b: 255 }): RGB {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

function Tiers({ size }: { size: "sm" | "md" }) {
  return (
    <ul
      className="flex w-[288px] flex-col items-start gap-3 rounded-[var(--app-radius-md)] p-4"
      style={{ background: "var(--app-bg-elevated-solid)" }}
    >
      {TIERS.map((tier) => (
        <li key={tier} data-tier={tier}>
          <SourceBadge place={SOURCES[tier] as PlaceCardData} size={size} />
        </li>
      ))}
    </ul>
  );
}

async function expectReadableTiers(canvasElement: HTMLElement, size: "sm" | "md", appearance: "light" | "dark") {
  await expect(document.documentElement.getAttribute("data-appearance")).toBe(appearance);
  const surface = paint(getComputedStyle(canvasElement.querySelector("ul")!).backgroundColor);
  for (const tier of TIERS) {
    const row = canvasElement.querySelector<HTMLElement>(`[data-tier="${tier}"]`)!;
    const badge = row.firstElementChild as HTMLElement;
    const style = getComputedStyle(badge);
    const context = `${tier} ${size} ${appearance}`;
    await expect(within(row).getByText(SOURCE_BADGE_META[tier].label, { exact: false })).toBeVisible();
    await expect(badge.querySelector(".sr-only")?.textContent, context).toContain(SOURCE_BADGE_META[tier].explanation);

    // The capsule tint sits on the card surface; the detail size has none.
    const ground = paint(style.backgroundColor, surface);
    if (size === "md") {
      await expect(ground, context).toEqual(surface);
      await expect(parseFloat(style.borderTopLeftRadius), context).toBe(0);
    } else {
      await expect(ground, context).not.toEqual(surface);
      await expect(parseFloat(style.borderTopLeftRadius), context).toBeGreaterThan(8);
    }
    await expect(contrastRatio(paint(style.color, ground), ground), context).toBeGreaterThanOrEqual(4.5);
    const glyph = badge.querySelector("svg")!;
    await expect(contrastRatio(paint(getComputedStyle(glyph).color, ground), ground), context).toBeGreaterThanOrEqual(3);
  }

  // A person reviewed the record. That is neither a verification check nor
  // the sparkle people read as machine output.
  const reviewed = canvasElement.querySelector('[data-tier="reviewed"] svg')!;
  await expect(reviewed).toHaveClass("lucide-notebook-pen");
  await expect(canvasElement.querySelector(".lucide-sparkles")).toBeNull();
  await expect(canvasElement.querySelectorAll(".lucide-circle-check")).toHaveLength(1);
  await expect(canvasElement.querySelector('[data-tier="checked"] .lucide-circle-check')).not.toBeNull();
}

function tiers(size: "sm" | "md", appearance: "light" | "dark"): Story {
  return {
    args: { size },
    beforeEach: () => setAppearance(appearance),
    render: (args) => <Tiers size={args.size ?? "sm"} />,
    play: async ({ canvasElement }) => expectReadableTiers(canvasElement, size, appearance),
  };
}

const meta = {
  title: "Places/Source badge",
  component: SourceBadge,
  parameters: { layout: "centered" },
  args: { place: SOURCES.reviewed as PlaceCardData, size: "sm" },
} satisfies Meta<typeof SourceBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardCapsuleLight = tiers("sm", "light");
export const CardCapsuleDark = tiers("sm", "dark");
export const DetailHeaderLight = tiers("md", "light");
export const DetailHeaderDark = tiers("md", "dark");
