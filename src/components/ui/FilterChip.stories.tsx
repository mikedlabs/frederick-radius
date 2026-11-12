import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import FilterChip from "./FilterChip";

const meta = {
  title: "Radius UI/Filter chip",
  component: FilterChip,
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    docs: {
      description: {
        component:
          "A compact single-select filter. It passes no tone to Pill, so a selected chip takes Pill's default ink fill; coral stays reserved for the page's one bold block and its one filled action. Callers that rely on this default include PlaceList, RadiusBuilder and the cuisine facets.",
      },
    },
  },
  args: { label: "Pizza", count: 12, onClick: fn() },
} satisfies Meta<typeof FilterChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedIsInk: Story = {
  render: (args) => (
    <div className="flex items-center gap-3 p-4">
      <FilterChip {...args} active />
      <FilterChip label="Tacos" count={4} onClick={args.onClick} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selected = canvas.getByRole("button", { name: /Pizza/ });
    const quiet = canvas.getByRole("button", { name: /Tacos/ });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    const probe = document.createElement("span");
    probe.style.color = "var(--app-ink)";
    canvasElement.append(probe);
    try {
      await expect(getComputedStyle(selected).backgroundColor).toBe(getComputedStyle(probe).color);
    } finally {
      probe.remove();
    }
    await expect(getComputedStyle(quiet).borderTopWidth).toBe("1px");
    for (const chip of [selected, quiet]) {
      await expect(chip.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};
