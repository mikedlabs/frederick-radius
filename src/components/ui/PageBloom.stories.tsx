import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import PageBloom from "./PageBloom";
import { MotionConfig } from "framer-motion";
import { expect } from "storybook/test";

const meta = {
  title: "Radius UI/PageBloom",
  component: PageBloom,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component:
    "Decorative paper and color wash. Ambient loops run only in a visible tab with full motion enabled. The same static wash and grain remain for operating-system reduced motion or hidden tabs. Preference changes and the preview Motion toolbar take effect without reopening the page." } } },
  decorators: [(Story, context) => (
    <MotionConfig reducedMotion={context.globals.motion === "reduce" ? "always" : "user"}>
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--app-bg)] p-6">
      <Story />
      <div className="relative max-w-md space-y-2">
        <h2 className="font-serif text-2xl text-[var(--app-ink)]">A quiet Frederick moment</h2>
        <p className="text-[var(--app-ink-2)]">The paper and color stay present while the content remains easy to read.</p>
      </div>
    </div>
    </MotionConfig>
  )],
  args: { variant: "warm-cool", motif: false, className: "!absolute" },
} satisfies Meta<typeof PageBloom>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PaperWash: Story = {};
export const CoolWash: Story = { args: { variant: "cool" } };
export const EditorialMotif: Story = { args: { variant: "warm", motif: true } };

export const ReducedMotion: Story = {
  globals: { motion: "reduce" },
  args: { motif: true },
  play: async ({ canvasElement }) => {
    const bloom = canvasElement.querySelector("[data-page-bloom]")!;
    await expect(bloom).toHaveAttribute("data-ambient-motion", "static");
    for (const layer of bloom.querySelectorAll("[data-ambient-layer]")) {
      await expect(getComputedStyle(layer).transform).toBe("none");
    }
    await expect(canvasElement.firstElementChild!.getBoundingClientRect().height).toBeGreaterThanOrEqual(window.innerHeight);
  },
};
