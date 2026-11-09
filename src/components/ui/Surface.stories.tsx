import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Surface } from "./Surface";

const meta = {
  title: "Radius UI/Surface",
  component: Surface,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The canonical bordered/inset container. One primitive replaces the hand-repeated rounded/border/fill recipe. Three roles: raised (a lifted card, the default), sunken (an inset well), and flat (a bordered block on the base canvas). It owns only the shell; content comes from its own primitives.",
      },
    },
  },
  args: {
    variant: "raised",
    padding: "md",
    interactive: false,
  },
  argTypes: {
    variant: { control: "select", options: ["raised", "sunken", "flat"] },
    padding: { control: "select", options: ["none", "sm", "md", "lg"] },
    interactive: { control: "boolean" },
  },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Raised: Story = {
  render: (args) => (
    <Surface {...args} className="max-w-xs">
      <p className="text-body" style={{ color: "var(--app-ink)" }}>
        A lifted card on the page, with a border and a soft fill.
      </p>
    </Surface>
  ),
};

export const Roles: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-3 p-4">
      <Surface variant="raised">
        <span className="text-meta" style={{ color: "var(--app-ink-2)" }}>raised · a lifted card</span>
      </Surface>
      <Surface variant="sunken">
        <span className="text-meta" style={{ color: "var(--app-ink-2)" }}>sunken · an inset well</span>
      </Surface>
      <Surface variant="flat">
        <span className="text-meta" style={{ color: "var(--app-ink-2)" }}>flat · a bordered block</span>
      </Surface>
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Surface as="button" interactive variant="raised" className="max-w-xs text-left">
      <span className="text-body" style={{ color: "var(--app-ink)" }}>A tappable card</span>
      <span className="mt-1 block text-meta" style={{ color: "var(--app-ink-2)" }}>
        Adds the shared press grammar.
      </span>
    </Surface>
  ),
};
