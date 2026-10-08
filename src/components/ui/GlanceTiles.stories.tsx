import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CarFront, Clock, Ticket } from "lucide-react";
import { expect } from "storybook/test";

import GlanceTiles from "./GlanceTiles";

const meta = {
  title: "Radius UI/GlanceTiles",
  component: GlanceTiles,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Two or three tiles under a detail page's title that answer when it is, how to get in and, only when a source says so, where to park. Each tile is at least 96px tall, with an icon, a sentence-case label, the value in title type that wraps instead of truncating, and one support line. An absent fact is an absent tile, so two tiles is the common case.",
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
    tiles: [
      {
        id: "when",
        icon: Clock,
        label: "When",
        value: "Tonight, 7:30 PM",
        support: "Until 10:00 PM",
      },
      {
        id: "getting-in",
        icon: Ticket,
        label: "Getting in",
        value: "$25",
        support: "Tickets sold online",
      },
    ],
  },
} satisfies Meta<typeof GlanceTiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The common case: When and Getting in, side by side. */
export const TwoTiles: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByLabelText("At a glance");
    await expect(list).toHaveAttribute("data-glance-tiles", "2");
    await expect(canvas.getByText("Tonight, 7:30 PM")).toBeVisible();
    await expect(canvas.getByText("Tickets sold online")).toBeVisible();
    const tiles = Array.from(list.querySelectorAll("[data-glance-tile]"));
    await expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      await expect(tile.getBoundingClientRect().height).toBeGreaterThanOrEqual(96);
    }
  },
};

/** A multi-day festival: the dates wrap inside the tile rather than truncate. */
export const MultiDayFree: Story = {
  args: {
    tiles: [
      {
        id: "when",
        icon: Clock,
        label: "When",
        value: "Sat Oct 10 and Sun Oct 11",
        support: "Starts 9:00 AM, ends 5:00 PM Sun",
      },
      { id: "getting-in", icon: Ticket, label: "Getting in", value: "Free" },
    ],
  },
  play: async ({ canvas }) => {
    const value = canvas.getByText("Sat Oct 10 and Sun Oct 11");
    await expect(value).toBeVisible();
    await expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth + 1);
    await expect(canvas.getByText("Free")).toBeVisible();
  },
};

/** A sourced parking fact adds the third tile; When spans the row on phones. */
export const WithParking: Story = {
  args: {
    tiles: [
      {
        id: "when",
        icon: Clock,
        label: "When",
        value: "Sat Oct 10, 7:30 PM",
        support: "Until 10:00 PM",
      },
      { id: "getting-in", icon: Ticket, label: "Getting in", value: "Free" },
      {
        id: "parking",
        icon: CarFront,
        label: "Parking",
        value: "Carroll Creek Parking Deck",
        support: "0.2 mi, straight line",
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("0.2 mi, straight line")).toBeVisible();
    await expect(canvas.getByLabelText("At a glance")).toHaveAttribute("data-glance-tiles", "3");
  },
};

/** At 320px the three tiles still fit without horizontal scroll. */
export const WithParkingNarrow: Story = {
  ...WithParking,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector("dl")!;
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1);
  },
};

/** No tiles renders nothing at all. */
export const Empty: Story = {
  args: { tiles: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("dl")).toBeNull();
  },
};
