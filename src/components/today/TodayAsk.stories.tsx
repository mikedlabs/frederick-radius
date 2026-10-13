import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TodayAsk, { TodayQuickNeeds } from "./TodayAsk";

const meta = {
  title: "Today/Find doorway",
  component: TodayAsk,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { embedded: true },
} satisfies Meta<typeof TodayAsk>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactDoorway: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
    await expect(find).toHaveAttribute("href", "/search");
    await expect(within(find).getByText("Find what you need")).toBeVisible();
    await expect(find.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = canvas.getByRole("link", { name });
      await expect(shortcut).toBeVisible();
      await expect(shortcut.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const FirstDecisionDoorway: Story = {
  args: { showQuickNeeds: false, density: "arrival" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
    await expect(find).toHaveAttribute("href", "/search");
    await expect(find.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    await expect(find.getBoundingClientRect().height).toBeLessThanOrEqual(64);
    await expect(canvas.queryByText("Search a name, a need, or a question.")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Open now" })).not.toBeInTheDocument();
  },
};

export const SecondaryWaysToExplore: Story = {
  render: () => <TodayQuickNeeds />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = canvas.getByRole("link", { name });
      await expect(shortcut).toBeVisible();
      await expect(shortcut.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await expect(canvas.queryByRole("link", { name: "Find a place, service, event, or answer" })).not.toBeInTheDocument();
  },
};
