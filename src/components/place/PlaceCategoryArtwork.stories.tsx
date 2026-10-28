import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import PlaceCategoryArtwork from "./PlaceCategoryArtwork";

const meta = {
  title: "Places/Category artwork", component: PlaceCategoryArtwork,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "Decorative category color and initial for a place with no eligible photograph. This is not a merchant logo or representation of its appearance." } } },
  decorators: [(Story) => <div style={{ width: 160, height: 160 }}><Story /></div>],
  args: { name: "Neighborhood coffee house", category: "coffee" },
  play: async ({ canvasElement }) => {
    const art = canvasElement.querySelector("[data-place-category-art]");
    await expect(art).toHaveAttribute("aria-hidden", "true");
    await expect(canvasElement.querySelector("img")).toBeNull();
  },
} satisfies Meta<typeof PlaceCategoryArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Coffee: Story = {};
export const Outdoors: Story = { args: { name: "County park", category: "outdoors" } };
export const Food: Story = { args: { name: "Local restaurant", category: "restaurant" } };
