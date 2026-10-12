import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { momentBySlug } from "@/data/civic-moments";
import MomentHero from "./MomentHero";
import { momentDateLine, momentHeroImage } from "./momentGuide";

const colorfest = momentBySlug("catoctin-colorfest-2026")!;
const streets = momentBySlug("in-the-street-2026")!;

const meta = {
  title: "Moments/MomentHero",
  component: MomentHero,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Opens a moment hub with the most honest picture it has. An owned photograph of the occasion runs full-bleed with an Ink scrim on its bottom 60% and the title on it. A licensed town photograph runs full-bleed at 16:10 with nothing drawn on it, a credit that names what it shows after it loads, and the title on Cream below. Without a photograph the title sits on Cream. Every rung closes with one 6px Brick rule.",
      },
    },
  },
  // The hero cancels the reading column's gutter on phones, so the story
  // reproduces that column.
  decorators: [
    (Story) => (
      <div className="app-main-reading mx-auto max-w-screen-sm pt-4">
        <Story />
      </div>
    ),
  ],
  args: {
    title: colorfest.title,
    dateLine: momentDateLine(colorfest.days),
    image: momentHeroImage(colorfest),
  },
} satisfies Meta<typeof MomentHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The owner's own photograph of In The Streets, with the title on it. */
export const Owned: Story = {
  args: {
    title: streets.title,
    dateLine: momentDateLine([{ date: "2026-09-12" }]),
    image: momentHeroImage(streets),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: streets.title })).toBeVisible();
  },
};

/**
 * Colorfest's licensed Thurmont town photograph from Wikimedia Commons. It
 * needs network access; offline, the photo is removed and the title stays on
 * Cream, which is the same honest fallback production uses.
 */
export const Licensed: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Catoctin Colorfest" })).toBeVisible();
    await expect(canvas.getByText("OCT 10-11 · 2026")).toBeInTheDocument();
  },
};

/** No photograph: the title and date line on Cream. */
export const NoPhoto: Story = {
  args: {
    image: { kind: "none" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("img")).toBeNull();
    await expect(canvas.getByRole("heading", { level: 1, name: "Catoctin Colorfest" })).toBeVisible();
  },
};
