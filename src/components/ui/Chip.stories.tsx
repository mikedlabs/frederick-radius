import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Chip } from "./Chip";

const meta = {
  title: "Radius UI/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A compact, non-interactive status label. Chips report category, freshness or state; they never masquerade as buttons.",
      },
    },
  },
  args: {
    children: "Confirmed open",
    tone: "positive",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "brand", "cool", "positive", "warning", "danger", "accent"],
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmedOpen: Story = {};

export const TrustStates: Story = {
  render: () => (
    <div className="flex max-w-sm flex-wrap items-center justify-center gap-2 p-4">
      <Chip tone="positive" title="Hours were checked today.">Confirmed open</Chip>
      <Chip tone="warning" title="The last hours check is older than seven days.">
        Hours not recently verified
      </Chip>
      <Chip tone="neutral" title="This source did not return a current status.">
        Status unavailable
      </Chip>
      <Chip tone="danger">Temporarily closed</Chip>
    </div>
  ),
};
export const LocalContext: Story = {
  render: () => (
    <div className="flex max-w-sm flex-wrap items-center justify-center gap-2 p-4">
      <Chip tone="cool">Downtown Frederick</Chip>
      <Chip tone="accent">Live music</Chip>
      <Chip tone="positive">Good in the rain</Chip>
      <Chip tone="neutral" tabular>6 min walk</Chip>
      <Chip tone="brand">Starts in 40 min</Chip>
    </div>
  ),
};

export const LongStatusAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: () => (
    <div className="flex w-[calc(100vw-24px)] flex-wrap gap-2 p-3">
      <Chip tone="warning">Hours not recently verified</Chip>
      <Chip tone="neutral">Frederick County source unavailable</Chip>
      <Chip tone="cool">Near Carroll Creek Linear Park</Chip>
    </div>
  ),
};
