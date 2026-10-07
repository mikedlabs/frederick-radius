import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import PageBloom from "./PageBloom";

const meta = {
  title: "Radius UI/PageBloom",
  component: PageBloom,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component:
    "Decorative paper and color wash. Ambient loops run only in a visible tab with full motion enabled. The same static wash and grain remain for operating-system reduced motion or hidden tabs. Preference changes take effect without reopening the page." } } },
  decorators: [(Story) => (
    <div className="relative isolate min-h-80 overflow-hidden bg-[var(--app-bg)] p-6">
      <Story />
      <div className="relative max-w-md space-y-2">
        <h2 className="font-serif text-2xl text-[var(--app-ink)]">A quiet Frederick moment</h2>
        <p className="text-[var(--app-ink-2)]">The paper and color stay present while the content remains easy to read.</p>
      </div>
    </div>
  )],
  args: { variant: "warm-cool", motif: false, className: "!absolute" },
} satisfies Meta<typeof PageBloom>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PaperWash: Story = {};
export const CoolWash: Story = { args: { variant: "cool" } };
export const EditorialMotif: Story = { args: { variant: "warm", motif: true } };
