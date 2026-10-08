import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import MomentDays from "./MomentDays";

const meta = {
  title: "Moments/MomentDays",
  component: MomentDays,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "One date plate per day a moment runs, in calendar order, with no counts. Each plate also carries its full date for assistive technology.",
      },
    },
  },
  args: {
    days: [{ date: "2026-10-10" }, { date: "2026-10-11" }],
  },
} satisfies Meta<typeof MomentDays>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Colorfest's Saturday and Sunday. */
export const Weekend: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
    await expect(canvas.getByText("Saturday, October 10, 2026")).toBeInTheDocument();
  },
};

/** A nine-day run reads as nine plates that wrap. */
export const LongRun: Story = {
  args: {
    days: Array.from({ length: 9 }, (_, i) => ({ date: `2026-09-${String(18 + i).padStart(2, "0")}` })),
  },
};
