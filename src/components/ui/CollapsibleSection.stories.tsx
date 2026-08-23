import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";

import CollapsibleSection from "./CollapsibleSection";

const meta = {
  title: "Radius UI/CollapsibleSection",
  component: CollapsibleSection,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A remembered progressive disclosure. Costly browse content can mount only after the first open, then stays mounted for an instant return.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[min(30rem,calc(100vw-24px))] rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 [border-color:var(--app-border)]">
        <Story />
      </div>
    ),
  ],
  args: {
    title: "All restaurants",
    count: 126,
    countLabel: "places",
    storageKey: "storybook.collapsible.restaurants",
    mountOnOpen: true,
    children: (
      <div className="space-y-2 pt-2 text-sm text-[var(--app-ink-2)]">
        <p>Nearby places appear after this section is opened.</p>
        <Link href="/category/restaurant" className="tap-44 inline-flex items-center font-semibold text-[var(--app-brand)]">
          Browse restaurants
        </Link>
      </div>
    ),
  },
} satisfies Meta<typeof CollapsibleSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeferredClosed: Story = {};

export const Open: Story = {
  args: { defaultOpen: true },
};
