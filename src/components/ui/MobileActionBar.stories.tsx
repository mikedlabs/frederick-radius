import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CalendarCheck, Globe, Mail, Navigation, Phone, ShoppingBag } from "lucide-react";
import { expect, within } from "storybook/test";

import { MobileActionBar, MobileBarLink, MOBILE_ACTION_BAR_HEIGHT_PX } from "./MobileActionBar";

/**
 * The place page's bottom action bar on a phone: a flat bar attached to the
 * bottom edge with one filled coral action (Directions) and quiet ink cells.
 * The page content above it carries the shell's bottom reserve, so the last
 * line of the page always scrolls clear of the bar.
 */
function PlaceBar({ cells, lastAction = "Order" }: { cells: 3 | 4; lastAction?: "Order" | "Reserve" }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      <main
        className="app-main-reading mx-auto max-w-screen-md pt-4"
        data-bottom-nav-reserve="true"
      >
        <p className="text-[15px]" style={{ color: "var(--app-ink)" }}>
          Baker Park has a playground, picnic tables and tennis courts.
        </p>
        <p data-last-content className="mt-4 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Updated Sep 19, 2026
        </p>
      </main>
      <MobileActionBar ariaLabel="Actions for Baker Park">
        <MobileBarLink
          href="https://www.google.com/maps/dir/?api=1&destination=39.4143,-77.4105"
          icon={Navigation}
          label="Directions"
          ariaLabel="Directions to Baker Park"
          external
          primary
          decisionAction="directions"
        />
        {cells === 4 && (
          <MobileBarLink href="mailto:parks@example.org" icon={Mail} label="Email" ariaLabel="Email Baker Park" decisionAction="email" />
        )}
        <MobileBarLink href="tel:3015550100" icon={Phone} label="Call" ariaLabel="Call Baker Park" decisionAction="call" />
        {cells === 4 ? (
          lastAction === "Reserve" ? (
            <MobileBarLink href="https://example.org/reserve" icon={CalendarCheck} label="Reserve" ariaLabel="Reserve at Baker Park" external decisionAction="reservation" />
          ) : (
            <MobileBarLink href="https://example.org/order" icon={ShoppingBag} label="Order" ariaLabel="Order at Baker Park" external decisionAction="order" />
          )
        ) : (
          <MobileBarLink href="https://example.org/" icon={Globe} label="Website" ariaLabel="Baker Park website" external decisionAction="website" />
        )}
      </MobileActionBar>
    </div>
  );
}

const meta = {
  title: "Radius UI/MobileActionBar",
  component: PlaceBar,
  parameters: { layout: "fullscreen" },
  args: { cells: 3 },
} satisfies Meta<typeof PlaceBar>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectFlatAttachedBar(canvasElement: HTMLElement) {
  const bar = canvasElement.querySelector<HTMLElement>("[data-mobile-action-bar]");
  if (!bar) throw new Error("The action bar must render.");
  const box = bar.getBoundingClientRect();
  const view = canvasElement.ownerDocument.defaultView!;
  const style = view.getComputedStyle(bar);
  // Attached to the bottom edge across the full width, with no lift.
  await expect(Math.abs(box.bottom - view.innerHeight)).toBeLessThanOrEqual(1);
  await expect(Math.round(box.left)).toBe(0);
  await expect(Math.round(box.width)).toBe(view.innerWidth);
  await expect(style.boxShadow).toBe("none");
  await expect(style.borderTopWidth).toBe("1px");
  await expect(Math.round(box.height)).toBe(MOBILE_ACTION_BAR_HEIGHT_PX);

  const toolbar = within(bar).getByRole("toolbar", { name: "Actions for Baker Park" });
  const toolbarBox = toolbar.getBoundingClientRect();
  // The toolbar itself never runs past the screen edge, even with four cells.
  await expect(toolbarBox.left).toBeGreaterThanOrEqual(-0.5);
  await expect(toolbarBox.right).toBeLessThanOrEqual(view.innerWidth + 0.5);
  const links = within(toolbar).getAllByRole("link");
  let filled = 0;
  for (const link of links) {
    const linkBox = link.getBoundingClientRect();
    // Every action keeps a 44px target and stays inside the bar.
    await expect(linkBox.height).toBeGreaterThanOrEqual(44);
    await expect(linkBox.width).toBeGreaterThanOrEqual(44);
    await expect(linkBox.left).toBeGreaterThanOrEqual(toolbarBox.left - 0.5);
    await expect(linkBox.right).toBeLessThanOrEqual(toolbarBox.right + 0.5);
    // No label is clipped.
    const label = link.querySelector("span")!;
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
    if (view.getComputedStyle(link).backgroundColor !== "rgba(0, 0, 0, 0)") filled += 1;
  }
  // Directions is the one filled coral action.
  await expect(filled).toBe(1);

  // The page's own bottom reserve keeps its last line clear of the bar.
  const main = canvasElement.querySelector<HTMLElement>("main")!;
  await expect(parseFloat(view.getComputedStyle(main).paddingBottom)).toBeGreaterThanOrEqual(MOBILE_ACTION_BAR_HEIGHT_PX);
  await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth + 1);
}

export const Phone390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => expectFlatAttachedBar(canvasElement),
};

export const Phone320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => expectFlatAttachedBar(canvasElement),
};

export const FourActions375: Story = {
  args: { cells: 4 },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  play: async ({ canvasElement }) => expectFlatAttachedBar(canvasElement),
};

/** The tightest real case: four cells with the longest commerce label on a
 * 320px phone. Every cell keeps its 44px target and an unclipped label. */
export const FourActions320: Story = {
  args: { cells: 4, lastAction: "Reserve" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => expectFlatAttachedBar(canvasElement),
};

export const Dark: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-appearance");
    root.setAttribute("data-appearance", "dark");
    return () => {
      if (previous === null) root.removeAttribute("data-appearance");
      else root.setAttribute("data-appearance", previous);
    };
  },
  play: async ({ canvasElement }) => expectFlatAttachedBar(canvasElement),
};
