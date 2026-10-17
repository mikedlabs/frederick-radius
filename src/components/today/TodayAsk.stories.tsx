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
    await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
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
    await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
    await expect(find.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    await expect(within(find).getByText("Find what you need")).toBeVisible();
    await expect(canvas.queryByText("Search a name, a need, or a question.")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Open now" })).not.toBeInTheDocument();
  },
};

export const EnlargedTextArrival: Story = {
  args: { showQuickNeeds: false, density: "arrival" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  decorators: [(Story) => <div data-app-primary-tab="/today" style={{ width: 288 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
    const box = find.getBoundingClientRect();
    await expect(within(find).getByText("Search")).toBeVisible();
    const prompt = find.querySelector("[data-find-prompt]")!;
    await expect(getComputedStyle(prompt).whiteSpace).toBe("nowrap");
    await expect(prompt.scrollWidth).toBeLessThanOrEqual(prompt.clientWidth + 1);
    await expect(box.height).toBeGreaterThanOrEqual(56);
    await expect(box.height).toBeLessThan(120);
    const arrow = find.querySelector("svg:last-of-type")!.getBoundingClientRect();
    await expect(arrow.right).toBeLessThanOrEqual(box.right + 1);
    await expect(arrow.bottom).toBeLessThanOrEqual(box.bottom + 1);
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
