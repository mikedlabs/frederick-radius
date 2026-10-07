import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import PageBloom from "./PageBloom";
import { expect } from "storybook/test";

const meta = {
  title: "Radius UI/PageBloom",
  component: PageBloom,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component:
    "Static field-guide paper: a soft top light and the paper grain. It draws no decorative glow and nothing in it moves. The optional motif is a still Ripple registration mark for an editorial moment." } } },
  decorators: [(Story) => (
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--app-bg)] p-6">
      <Story />
      <div className="relative max-w-md space-y-2">
        <h2 className="font-serif text-2xl text-[var(--app-ink)]">A quiet Frederick moment</h2>
        <p className="text-[var(--app-ink-2)]">The paper stays present while the content remains easy to read.</p>
      </div>
    </div>
  )],
  args: { variant: "warm-cool", motif: false, className: "!absolute" },
} satisfies Meta<typeof PageBloom>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Paper: Story = {
  play: async ({ canvasElement }) => {
    const bloom = canvasElement.querySelector("[data-page-bloom]")!;
    await expect(bloom.querySelector("[data-page-paper]")).not.toBeNull();
    await expect(bloom.querySelector(".aurora-grain")).not.toBeNull();
    await expect(bloom.querySelectorAll("[data-ambient-layer]")).toHaveLength(0);
  },
};
export const EditorialMotif: Story = {
  args: { variant: "warm", motif: true },
  play: async ({ canvasElement }) => {
    const motif = canvasElement.querySelector("[data-page-motif]")!;
    await expect(getComputedStyle(motif).transform).toBe("none");
    await expect(canvasElement.firstElementChild!.getBoundingClientRect().height).toBeGreaterThanOrEqual(window.innerHeight);
  },
};
