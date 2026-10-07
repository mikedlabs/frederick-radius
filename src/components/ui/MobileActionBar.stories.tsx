import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Globe, Mail, Navigation, Phone } from "lucide-react";
import { expect } from "storybook/test";

import { MobileActionBar, MobileBarLink } from "./MobileActionBar";

const meta = {
  title: "Radius UI/MobileActionBar",
  component: MobileActionBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The detail-page action bar replaces the tab bar on phones. It is a full-width solid bar with one top rule, one wide brand-press primary with its glyph and label, and every other action as a 48-pixel outlined square named by its accessible label.",
      },
    },
  },
  args: { ariaLabel: "Actions for Gravel & Grind", children: null },
  render: (args) => (
    <div className="min-h-screen bg-[var(--app-bg)] p-4">
      <p className="text-[15px]" style={{ color: "var(--app-ink-2)" }}>
        The bar sits at the bottom of the screen on phones.
      </p>
      <MobileActionBar ariaLabel={args.ariaLabel}>
        <MobileBarLink href="mailto:hello@example.com" icon={Mail} label="Email" />
        <MobileBarLink href="tel:+13015550100" icon={Phone} label="Call" />
        <MobileBarLink href="https://example.com" icon={Globe} label="Website" external />
        <MobileBarLink
          href="https://www.google.com/maps/dir/?api=1"
          icon={Navigation}
          label="Directions"
          primary
          external
        />
      </MobileActionBar>
    </div>
  ),
} satisfies Meta<typeof MobileActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlaceActionsAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const toolbar = canvasElement.querySelector<HTMLElement>('[role="toolbar"]')!;
    const cells = [...toolbar.querySelectorAll<HTMLElement>("a")];
    for (const cell of cells) {
      await expect(cell.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    }
    // The primary leads visually even though it is last in the markup.
    const primary = toolbar.querySelector<HTMLElement>('[data-bar-primary="true"]')!;
    const lefts = cells.map((cell) => cell.getBoundingClientRect().left);
    await expect(primary.getBoundingClientRect().left).toBe(Math.min(...lefts));
  },
};

export const PlaceActionsAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};
