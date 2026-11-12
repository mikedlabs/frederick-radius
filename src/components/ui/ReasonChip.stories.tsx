import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import ReasonChip, { ReasonChipRow, type ReasonTone } from "./ReasonChip";

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
    docs: { description: { component: "A reason only labels why a record is shown, so it is plain small text: no fill, ring, corner or capsule. The open cue keeps a small status dot. Labels retain their meaning in the light and dark appearances. This fixture shows every existing tone; it does not describe current venue availability." } },
  },
} satisfies Meta<typeof ReasonChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {
  args: { label: "Reason" },
  render: () => (
    <div className="flex max-w-sm flex-wrap gap-3 p-4" aria-label="Reason chip examples">
      {reasons.map(({ tone, label }) => <ReasonChip key={tone} tone={tone} label={label} />)}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const { label, tone } of reasons) {
      const chip = canvas.getByText(label);
      await expect(chip).toBeVisible();
      await expect(chip).toHaveAttribute("data-reason-tone", tone);
      // Plain text: no capsule, tile or ring around an informational label.
      const style = getComputedStyle(chip);
      await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      await expect(style.borderTopLeftRadius).toBe("0px");
      await expect(style.boxShadow).toBe("none");
    }
  },
};

export const RowWithSeparators: Story = {
  args: { label: "Reason" },
  render: () => <ReasonChipRow reasons={reasons.slice(0, 3)} />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByLabelText("Reasons this is shown");
    for (const { label } of reasons.slice(0, 3)) await expect(within(row).getByText(label)).toBeVisible();
    // Two quiet middle dots separate three reasons; they are hidden from
    // assistive technology so the labels read as a plain list.
    const separators = [...row.querySelectorAll('[aria-hidden="true"]')].filter((node) => node.textContent === "·");
    await expect(separators).toHaveLength(2);
  },
};
