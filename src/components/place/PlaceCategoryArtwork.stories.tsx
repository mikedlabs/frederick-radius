import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import PlaceCategoryArtwork from "./PlaceCategoryArtwork";

const meta = {
  title: "Places/Category artwork", component: PlaceCategoryArtwork,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "The stand-in for a place with no eligible photograph: a flat plate with the category icon. It is not a merchant logo, a monogram or a representation of the place." } } },
  decorators: [(Story) => <div style={{ width: 160, height: 160 }}><Story /></div>],
  args: { category: "coffee" },
  play: async ({ canvasElement }) => {
    const art = canvasElement.querySelector<HTMLElement>("[data-place-category-art]")!;
    await expect(art).toHaveAttribute("aria-hidden", "true");
    await expect(canvasElement.querySelector("img")).toBeNull();
    // One centered icon, no lettering, no gradient and no ring ornament.
    await expect(art.textContent).toBe("");
    await expect(getComputedStyle(art).backgroundImage).toBe("none");
    for (const pseudo of ["::before", "::after"]) await expect(getComputedStyle(art, pseudo).content).toBe("none");
    const plate = art.getBoundingClientRect();
    const icon = art.querySelector("svg")!.getBoundingClientRect();
    await expect(Math.abs((icon.left + icon.right) / 2 - (plate.left + plate.right) / 2)).toBeLessThanOrEqual(1);
    await expect(Math.abs((icon.top + icon.bottom) / 2 - (plate.top + plate.bottom) / 2)).toBeLessThanOrEqual(1);
  },
} satisfies Meta<typeof PlaceCategoryArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Coffee: Story = {};
export const Outdoors: Story = { args: { category: "outdoors" } };
export const Food: Story = { args: { category: "restaurant" } };
