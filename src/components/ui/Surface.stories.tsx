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
          "The canonical bordered/inset container. One primitive replaces the hand-repeated rounded/border/elevated-fill recipe. Three roles: elevated (a raised card, the default), sunken (an inset well), and flat (a bordered block on the base canvas). It owns only the shell; content comes from its own primitives.",
      },
    },
  },
  args: {
    variant: "elevated",
    padding: "md",
    interactive: false,
  },
  argTypes: {
    variant: { control: "select", options: ["elevated", "sunken", "flat"] },
    padding: { control: "select", options: ["none", "sm", "md", "lg"] },
    interactive: { control: "boolean" },
  },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Elevated: Story = {
  render: (args) => (
    <Surface {...args} className="max-w-xs">
      <p className="text-body" style={{ color: "var(--app-ink)" }}>
        A raised card on the page. Border plus the elevated fill.
      </p>
    </Surface>
  ),
};

export const Roles: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-3 p-4">
      <Surface variant="elevated">
        <span className="text-meta" style={{ color: "var(--app-ink-2)" }}>elevated · a raised card</span>
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
    <Surface as="button" interactive variant="elevated" className="max-w-xs text-left">
      <span className="text-body" style={{ color: "var(--app-ink)" }}>A tappable card</span>
      <span className="mt-1 block text-meta" style={{ color: "var(--app-ink-2)" }}>
        Adds the shared press grammar.
      </span>
    </Surface>
  ),
};
