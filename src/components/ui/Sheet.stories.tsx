import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { CloudSun, ExternalLink } from "lucide-react";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";

import Sheet from "./Sheet";
import { Button } from "./Button";

const meta = {
  title: "Radius UI/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The canonical focused-detail layer. It portals above persistent navigation, stays full-width on a phone, and becomes a centered instrument on larger screens.",
      },
    },
  },
  args: {
    open: true,
    onClose: () => undefined,
    title: "Weather details",
    subtitle: "Component preview",
    children: null,
  },
  beforeEach: () => {
    // The sheet dismisses on a real route change. Keep the preview router in
    // the same document instead of pretending its iframe is the Today route.
    const original = usePathname.getMockImplementation();
    usePathname.mockReturnValue(window.location.pathname);
    return () => {
      if (original) usePathname.mockImplementation(original);
      else usePathname.mockReset();
    };
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Weather details" });
    const close = within(dialog).getByRole("button", { name: "Close Weather details" });
    // Test the painted target, not just an accessible button behind a handle.
    await waitFor(() => {
      const rect = close.getBoundingClientRect();
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
      for (const [x, y] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
        const hit = close.ownerDocument.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y);
        expect(hit === close || (hit !== null && close.contains(hit))).toBe(true);
      }
    });
    await userEvent.click(close);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Weather details" })).toBeNull());
    const trigger = page.getByRole("button", { name: "Open weather details" });
    await userEvent.click(trigger);
    const reopened = await page.findByRole("dialog", { name: "Weather details" });
    await userEvent.click(within(reopened).getByRole("button", { name: "Close Weather details" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function SheetFixture({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--app-bg)" }}>
      <Button onClick={() => setOpen(true)}>Open weather details</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Weather details"
        subtitle="Component preview"
        maxHeight="72dvh"
      >
        <div
          className="overflow-hidden rounded-[var(--app-radius-md)] border"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
          }}
        >
          <div className="flex items-center gap-3 p-4">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
              style={{ color: "var(--app-cool)", background: "var(--app-cool-tint-14)" }}
            >
              <CloudSun className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-editorial text-3xl leading-none" style={{ color: "var(--app-ink)" }}>
                72°
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--app-ink-2)" }}>
                Partly cloudy
              </p>
            </div>
          </div>
          <div
            className="flex min-h-11 items-center justify-between gap-3 border-t px-4 text-xs"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <span>Sample data for component review</span>
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-brand-press)" }}>
              Source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

export const MobileOpen: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
  },
  render: () => <SheetFixture />,
};

export const MobileNarrow: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: () => <SheetFixture />,
};

export const Mobile390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <SheetFixture />,
};

export const MobileLarge: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  render: () => <SheetFixture />,
};

export const DesktopOpen: Story = {
  globals: {
    viewport: { value: "radiusDesktop", isRotated: false },
  },
  render: () => <SheetFixture />,
};

export const ReducedMotion: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
    motion: "reduce",
  },
  render: () => <SheetFixture />,
};
