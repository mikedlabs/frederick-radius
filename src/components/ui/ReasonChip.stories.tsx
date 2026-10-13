import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import ReasonChip, { type ReasonTone } from "./ReasonChip";

const reasons: { tone: ReasonTone; label: string }[] = [
  { tone: "open", label: "Open now" },
  { tone: "near", label: "Near Carroll Creek" },
  { tone: "verified", label: "Recently verified" },
  { tone: "free", label: "Free admission" },
  { tone: "rated", label: "Highly rated" },
  { tone: "neutral", label: "Hours not posted" },
];

const meta = {
  title: "Primitives/Reason chip",
  component: ReasonChip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    docs: { description: { component: "Reason labels retain their meaning in the operating system’s light and dark color schemes. This fixture shows every existing tone; it does not describe current venue availability." } },
  },
} satisfies Meta<typeof ReasonChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {
  args: { label: "Reason" },
  render: () => (
    <div className="flex max-w-sm flex-wrap gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4" aria-label="Reason chip examples">
      {reasons.map(({ tone, label }) => <ReasonChip key={tone} tone={tone} label={label} />)}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const { label } of reasons) await expect(canvas.getByText(label)).toBeVisible();
  },
};
