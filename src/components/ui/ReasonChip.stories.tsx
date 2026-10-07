import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ReasonChip, { ReasonChipRow } from "./ReasonChip";

const meta = {
  title: "Radius UI/ReasonChip",
  component: ReasonChip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The small reason pill on place tiles and event cards. Quality reasons such as Local favorite and Top rated read in neutral ink, because Plum is reserved for arts and editorial accents.",
      },
    },
  },
  args: { label: "Local favorite", tone: "rated" },
} satisfies Meta<typeof ReasonChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rated: Story = {};

export const EveryTone: Story = {
  render: () => (
    <div className="p-4">
      <ReasonChipRow
        reasons={[
          { label: "Open now", tone: "open" },
          { label: "Near Carroll Creek", tone: "near" },
          { label: "Hours checked", tone: "verified" },
          { label: "Free", tone: "free" },
          { label: "Local favorite", tone: "rated" },
          { label: "Kid-friendly", tone: "neutral" },
        ]}
      />
    </div>
  ),
};
