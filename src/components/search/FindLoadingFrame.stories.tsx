import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SearchOverlayFallback } from "@/components/nav/TopBar";
import { applyAppearance, getAppearance } from "@/lib/appearance";
import { FIND_FRAME_PANEL_CLASS, FIND_FRAME_ROOT_CLASS, FIND_FRAME_SCRIM_CLASS } from "./find-frame";

/** Opens the header's real loading frame on its own. In the app it shows only
 * while an open beats the Find chunk, so it is rarely seen there. */
function LoadingFrameWorkshop() {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <main className="mx-auto max-w-screen-sm space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Find loading frame</h1>
        <p className="text-[15px] leading-relaxed">
          This preview shows the frame Find draws before its code has arrived.
          It holds no search results.
        </p>
        <Button onClick={(event) => {
          openerRef.current = event.currentTarget;
          setOpen(true);
        }}>
          Open the loading frame
        </Button>
      </main>
      {open && (
        <SearchOverlayFallback
          onClose={close}
          openerRef={openerRef}
          // The workshop must not add entries to Storybook's own route history.
          historyLayerId=""
          returnScrollY={null}
        />
      )}
    </>
  );
}

const meta = {
  title: "Radius UI/Find loading frame",
  component: LoadingFrameWorkshop,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    docs: {
      description: {
        component: "The header draws this frame when Find opens before its code has loaded. It uses the dialog root, scrim and panel from find-frame.ts, the same values SearchOverlay draws, so the swap to the real workspace moves nothing. On a phone the panel fills the screen on the page ground. From the sm breakpoint it is a centered panel over the scrim. Close and Escape dismiss it, and focus returns to the opener.",
      },
    },
  },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
} satisfies Meta<typeof LoadingFrameWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;

function inAppearance(appearance: "light" | "dark") {
  return () => {
    const previous = getAppearance();
    applyAppearance(appearance, false);
    return () => applyAppearance(previous, false);
  };
}

async function openAndCheckFrame(canvasElement: HTMLElement, wide: boolean) {
  const canvas = within(canvasElement);
  const opener = canvas.getByRole("button", { name: "Open the loading frame" });
  await userEvent.click(opener);
  const dialogElement = await canvas.findByRole("dialog", { name: "Loading search" });
  const dialog = within(dialogElement);
  await expect(dialogElement.className).toBe(FIND_FRAME_ROOT_CLASS);
  await expect(dialogElement).toHaveAttribute("aria-modal", "true");
  const scrim = dialogElement.querySelector<HTMLElement>("[data-find-loading-scrim]")!;
  const panel = dialogElement.querySelector<HTMLElement>("[data-find-loading-panel]")!;
  await expect(scrim.className).toBe(FIND_FRAME_SCRIM_CLASS);
  await expect(panel.className).toBe(FIND_FRAME_PANEL_CLASS);
  await expect(dialog.getByText("What do you need?")).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveTextContent("Loading search.");
  const close = dialog.getByRole("button", { name: "Close search" });
  await waitFor(() => expect(close).toHaveFocus());
  // The visible Close is compact; its tap extender keeps the center reachable.
  const box = close.getBoundingClientRect();
  const hit = close.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  await expect(hit !== null && close.contains(hit)).toBe(true);
  if (wide) {
    await expect(getComputedStyle(scrim).display).toBe("block");
    const frame = dialogElement.getBoundingClientRect();
    const sheet = panel.getBoundingClientRect();
    await expect(Math.abs((sheet.left + sheet.right) / 2 - (frame.left + frame.right) / 2)).toBeLessThanOrEqual(1);
    await expect(sheet.height).toBeLessThan(frame.height);
  } else {
    await expect(getComputedStyle(scrim).display).toBe("none");
    const sheet = panel.getBoundingClientRect();
    await expect(sheet.width).toBe(dialogElement.getBoundingClientRect().width);
  }
  return { canvas, opener, close };
}

export const Phone: Story = {
  beforeEach: inAppearance("light"),
  play: async ({ canvasElement }) => {
    const { canvas, opener, close } = await openAndCheckFrame(canvasElement, false);
    await userEvent.click(close);
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const NarrowPhone: Story = {
  beforeEach: inAppearance("light"),
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    await openAndCheckFrame(canvasElement, false);
  },
};

export const PhoneDark: Story = {
  beforeEach: inAppearance("dark"),
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.appearance).toBe("dark");
    await openAndCheckFrame(canvasElement, false);
  },
};

export const Desktop: Story = {
  beforeEach: inAppearance("light"),
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const { canvas, opener } = await openAndCheckFrame(canvasElement, true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const DesktopDark: Story = {
  beforeEach: inAppearance("dark"),
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.appearance).toBe("dark");
    await openAndCheckFrame(canvasElement, true);
  },
};
