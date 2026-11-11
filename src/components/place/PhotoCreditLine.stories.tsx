import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { curatedPhotoCredit } from "@/lib/curated-photo-source";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import PhotoCreditLine from "./PhotoCreditLine";

// Real reviewed records, so each state shows the exact line a visitor sees.
const edited = curatedPhotoCredit(getLandmarkPhoto("chappelle-co")!);
const original = curatedPhotoCredit(getLandmarkPhoto("brewers-alley-frederick")!);
const county = curatedPhotoCredit(getLandmarkPhoto("ballenger-creek-park-frederick")!);

const meta = {
  title: "Places/Photo credit line",
  component: PhotoCreditLine,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(343px, calc(100vw - 32px))", color: "var(--app-ink-3)" }}><Story /></div>],
  args: { credit: edited },
} satisfies Meta<typeof PhotoCreditLine>;
export default meta;
type Story = StoryObj<typeof meta>;

async function checkLine(canvasElement: HTMLElement, text: string, links: string[]) {
  const line = canvasElement.querySelector<HTMLElement>("[data-photo-credit-text]")!;
  await expect(line).toBeVisible();
  await expect(line.textContent).toBe(text);
  const anchors = within(canvasElement).getAllByRole("link");
  await expect(anchors.map((anchor) => anchor.textContent)).toEqual(links);
  for (const anchor of anchors) {
    // Color alone never marks a credit link, and each keeps a 44px target.
    await expect(getComputedStyle(anchor).textDecorationLine).toContain("underline");
    const box = anchor.getBoundingClientRect();
    await expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(anchor).toHaveAttribute("target", "_blank");
  }
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
}

export const EditedWithYear: Story = {
  play: ({ canvasElement }) => checkLine(canvasElement,
    "Acroterion · 2022 · CC BY-SA 4.0 · Wikimedia Commons · edited", ["CC BY-SA 4.0", "Wikimedia Commons"]),
};

export const UneditedWithOriginalSource: Story = {
  args: { credit: original },
  play: ({ canvasElement }) => checkLine(canvasElement,
    "Stacy (Rambling Traveler) · 2004 · CC BY-SA 2.0 · Wikimedia Commons · Original photograph",
    ["CC BY-SA 2.0", "Wikimedia Commons", "Original photograph"]),
};

export const CountyProvidedAt320: Story = {
  args: { credit: county },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: ({ canvasElement }) => checkLine(canvasElement,
    "Frederick County Parks & Recreation · Used with permission · Frederick County · edited",
    ["Used with permission", "Frederick County"]),
};
