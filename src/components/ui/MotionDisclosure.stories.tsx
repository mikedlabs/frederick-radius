import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChevronDown, MapPin, Navigation } from "lucide-react";
import { useState } from "react";

import MotionDisclosure from "./MotionDisclosure";

const meta = {
  title: "Radius UI/MotionDisclosure",
  component: MotionDisclosure,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The shared progressive-detail surface. Content stays mounted for a continuous reveal, while a closed disclosure is hidden from assistive technology and removed from keyboard navigation with inert.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[min(30rem,calc(100vw-24px))] rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)] [border-color:var(--app-border)]">
        <Story />
      </div>
    ),
  ],
  args: {
    id: "nearby-detail",
    open: true,
    children: (
      <div className="space-y-2 pt-3">
        <p className="font-semibold text-[var(--app-ink)]">Carroll Creek Park</p>
        <p className="text-sm leading-relaxed text-[var(--app-ink-2)]">
          A mapped public restroom is nearby. Radius will show availability only when it can be confirmed.
        </p>
        <a
          href="/map?amenity=restroom"
          className="tap-44 inline-flex items-center gap-2 font-semibold text-[var(--app-brand)]"
        >
          <Navigation className="h-4 w-4" aria-hidden />
          See it on the map
        </a>
      </div>
    ),
  },
} satisfies Meta<typeof MotionDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};

function ProgressiveRevealFixture() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="progressive-nearby-detail"
        onClick={() => setOpen((value) => !value)}
        className="tap-44 flex w-full items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)] text-[var(--app-brand)] shadow-[inset_2px_0_0_var(--app-brand)]"
        >
          <MapPin className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 font-semibold text-[var(--app-ink)]">
          Why this is nearby
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none"
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      <MotionDisclosure id="progressive-nearby-detail" open={open}>
        <div className="space-y-2 pt-3 text-sm leading-relaxed text-[var(--app-ink-2)]">
          <p>Walking time appears after Radius has a confirmed starting point.</p>
          <a className="tap-44 inline-flex items-center font-semibold text-[var(--app-brand)]" href="/map">
            Open walking directions
          </a>
        </div>
      </MotionDisclosure>
    </div>
  );
}

export const ProgressiveReveal: Story = {
  render: () => <ProgressiveRevealFixture />,
};

export const ReducedMotion: Story = {
  globals: { motion: "reduce" },
  render: () => <ProgressiveRevealFixture />,
};
