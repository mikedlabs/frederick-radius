import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import MomentFacts from "./MomentFacts";

const meta = {
  title: "Moments/MomentFacts",
  component: MomentFacts,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A moment's decision facts as 2-up tiles on Cream: a sentence-case label, the value in title type that wraps instead of truncating, and the site that published it. A fact without a source is not shown.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="app-main-reading mx-auto max-w-screen-sm pt-4">
        <Story />
      </div>
    ),
  ],
  args: {
    facts: [
      {
        label: "Dates",
        value: "Sat Oct 10 and Sun Oct 11",
        source_url: "https://www.thurmont.com/2236/Colorfest",
      },
      { label: "Admission", value: "Free", source_url: "https://colorfest.org/plan-your-visit/" },
    ],
  },
} satisfies Meta<typeof MomentFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Colorfest's two sourced facts. */
export const Sourced: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Sat Oct 10 and Sun Oct 11")).toBeVisible();
    await expect(canvas.getByRole("link", { name: /thurmont\.com/ })).toBeInTheDocument();
  },
};

/** An unsourced fact is dropped, so only the sourced tile remains. */
export const UnsourcedFactHidden: Story = {
  args: {
    facts: [
      { label: "Parking", value: "$10 cash" },
      { label: "Admission", value: "Free", source_url: "https://colorfest.org/plan-your-visit/" },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("$10 cash")).toBeNull();
    await expect(canvas.getByText("Free")).toBeVisible();
  },
};
