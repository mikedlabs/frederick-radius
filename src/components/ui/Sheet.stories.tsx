import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { CloudSun, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { expect, waitFor, within } from "storybook/test";

import Sheet from "./Sheet";
import BottomSheet, { SheetHandle } from "./BottomSheet";
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
    // Wait for a painted, settled target on every opening, including reopen.
    // A dialog role exists while its spring entrance is still moving.
    const waitForCloseTarget = async (target: HTMLElement) => {
      await waitFor(async () => {
        const before = target.getBoundingClientRect();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const rect = target.getBoundingClientRect();
        expect(Math.abs(rect.x - before.x)).toBeLessThanOrEqual(0.25);
        expect(Math.abs(rect.y - before.y)).toBeLessThanOrEqual(0.25);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.width).toBeGreaterThanOrEqual(44);
        for (const [x, y] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
          const hit = target.ownerDocument.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y);
          expect(hit === target || (hit !== null && target.contains(hit))).toBe(true);
        }
      });
    };
    await waitForCloseTarget(close);
    await userEvent.click(close);
    await waitFor(() => {
      expect(page.queryByRole("dialog", { name: "Weather details" })).toBeNull();
      expect(dialog).not.toBeInTheDocument();
    });
    const trigger = page.getByRole("button", { name: "Open weather details" });
    await userEvent.click(trigger);
    const reopened = await page.findByRole("dialog", { name: "Weather details" });
    const reopenedClose = within(reopened).getByRole("button", { name: "Close Weather details" });
    await waitForCloseTarget(reopenedClose);
    await userEvent.click(reopenedClose);
    await waitFor(() => {
      expect(page.queryByRole("dialog", { name: "Weather details" })).toBeNull();
      expect(reopened).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
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
              className="grid h-11 w-11 shrink-0 place-items-center"
              style={{ color: "var(--app-ink-3)" }}
            >
              <CloudSun className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-sans text-3xl font-extrabold leading-none" style={{ color: "var(--app-ink)" }}>
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
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-link)" }}>
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

/**
 * The open sheet and the gestures the pull stories share. A pull is dispatched
 * as pointer events: the press on the handle row, where the sheet listens, and
 * the moves and release on the window, where Motion follows a drag.
 */
async function openSheetGestures(canvasElement: HTMLElement) {
  const view = canvasElement.ownerDocument.defaultView!;
  const page = within(canvasElement.ownerDocument.body);
  const dialog = await page.findByRole("dialog", { name: "Weather details" });
  const panel = dialog.querySelector<HTMLElement>("[data-bottom-sheet-panel]")!;
  const backdrop = dialog.querySelector<HTMLElement>("[data-bottom-sheet-backdrop]")!;
  const row = panel.querySelector<HTMLElement>("[data-sheet-handle]")!;
  const pause = (ms: number) => new Promise<void>((resolve) => view.setTimeout(resolve, ms));
  const top = () => panel.getBoundingClientRect().top;
  const scrim = () => Number(view.getComputedStyle(backdrop).opacity);
  const point = (type: string, target: EventTarget, x: number, y: number) =>
    target.dispatchEvent(new view.PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse",
      isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y,
    }));
  const nextFrame = () => new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
  // The drag and its DOM transform are frame-driven. Hold one gesture open
  // until its visible position has been checked, then always release it.
  const pull = async (start: Element, x: number, y: number, checkPosition: () => void) => {
    point("pointerdown", start, x, y);
    try {
      for (let step = 1; step <= 10; step += 1) {
        await pause(24);
        point("pointermove", view, x, y + step * 6);
        await nextFrame();
      }
      await waitFor(checkPosition, { timeout: 1500 });
    } finally {
      point("pointerup", view, x, y + 60);
    }
  };
  // The entrance spring must finish before a rest position means anything.
  const settle = async () => {
    let rest = 0;
    await waitFor(async () => {
      const before = top();
      await pause(60);
      await nextFrame();
      rest = top();
      expect(Math.abs(rest - before)).toBeLessThanOrEqual(0.25);
      expect(scrim()).toBeCloseTo(0.45, 2);
    });
    return rest;
  };
  // A point beside the pill, on the row's spacer, to prove the whole row drags.
  const spacer = () => {
    const rowBox = row.getBoundingClientRect();
    const x = rowBox.right - 40;
    const y = rowBox.top + rowBox.height / 2;
    const hit = view.document.elementFromPoint(x, y);
    expect(row.contains(hit)).toBe(true);
    expect(hit?.closest("button")).toBeNull();
    return { hit: hit!, x, y };
  };
  const returnsTo = (rest: number) => waitFor(() => {
    expect(Math.abs(top() - rest)).toBeLessThanOrEqual(1);
    expect(scrim()).toBeCloseTo(0.45, 2);
  }, { timeout: 1500 });
  return { view, dialog, top, point, pull, settle, spacer, returnsTo };
}

/**
 * A short pull that the visitor lets go of returns the sheet to rest with its
 * scrim, from anywhere on the handle row. Before this was pinned, release
 * momentum carried the sheet down and parked it there with the scrim gone.
 */
export const ShortPullReturnsToRest: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <SheetFixture />,
  play: async ({ canvasElement }) => {
    const sheet = await openSheetGestures(canvasElement);
    const close = within(sheet.dialog).getByRole("button", { name: "Close Weather details" });
    const rest = await sheet.settle();

    const { hit, x, y } = sheet.spacer();
    await sheet.pull(hit, x, y, () => {
      expect(sheet.top() - rest).toBeGreaterThan(30);
    });
    await sheet.returnsTo(rest);
    await expect(sheet.dialog).toBeInTheDocument();

    // A press that begins on Close is a button press, never a drag.
    const closeBox = close.getBoundingClientRect();
    await sheet.pull(close, closeBox.left + closeBox.width / 2, closeBox.top + closeBox.height / 2, () => {
      expect(Math.abs(sheet.top() - rest)).toBeLessThanOrEqual(1);
    });
    await expect(sheet.dialog).toBeInTheDocument();
  },
};

/** Renders again when the window resizes, as a sheet with responsive content does. */
function ResizingSheetFixture() {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <div data-window-width={width ?? undefined}>
      <SheetFixture />
    </div>
  );
}

/**
 * A pull still moves the sheet after the window changes width, as it does when
 * a phone rotates. Motion forgets a sheet's measured layout when the sheet
 * renders within 250 ms of a resize. The next drag then started from the
 * entrance's "0%" and wrote "0%6" as a position, which the browser ignores, so
 * the sheet and its scrim stayed put under the pull.
 */
export const PullAfterResize: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <ResizingSheetFixture />,
  play: async ({ canvasElement }) => {
    const sheet = await openSheetGestures(canvasElement);
    const { view } = sheet;
    const rest = await sheet.settle();

    // Report a new width to every resize listener. Afterwards report the real
    // one again, so no listener is left holding a width the window never had.
    const realWidth = Object.getOwnPropertyDescriptor(view, "innerWidth");
    const width = view.innerWidth + 1;
    Object.defineProperty(view, "innerWidth", { configurable: true, get: () => width });
    try {
      view.dispatchEvent(new view.Event("resize"));
      await waitFor(() => {
        expect(canvasElement.querySelector(`[data-window-width="${width}"]`)).not.toBeNull();
      });
      const { hit, x, y } = sheet.spacer();
      await sheet.pull(hit, x, y, () => {
        expect(sheet.top() - rest).toBeGreaterThan(30);
      });
    } finally {
      if (realWidth) Object.defineProperty(view, "innerWidth", realWidth);
      else Reflect.deleteProperty(view, "innerWidth");
      view.dispatchEvent(new view.Event("resize"));
    }
    await sheet.returnsTo(rest);
    await expect(sheet.dialog).toBeInTheDocument();
  },
};

/**
 * A press on the handle row while the sheet is leaving does not interrupt the
 * exit. Each press on the row writes the sheet's position in pixels before
 * Motion decides whether a drag may start. A write that also stopped the
 * running animation would park the sheet on screen, unable to finish closing.
 */
export const PressWhileLeaving: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <SheetFixture />,
  play: async ({ canvasElement, userEvent }) => {
    const sheet = await openSheetGestures(canvasElement);
    const close = within(sheet.dialog).getByRole("button", { name: "Close Weather details" });
    await sheet.settle();
    const { hit, x, y } = sheet.spacer();

    await userEvent.click(close);
    sheet.point("pointerdown", hit, x, y);
    sheet.point("pointerup", sheet.view, x, y);
    await waitFor(() => {
      expect(sheet.dialog).not.toBeInTheDocument();
    }, { timeout: 1500 });
  },
};

function ExplicitReturnFocusFixture() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <main className="min-h-screen space-y-4 p-4" style={{ background: "var(--app-bg)" }}>
      <label className="block">
        Other task
        <input className="block min-h-11 rounded-lg border px-3" />
      </label>
      <button ref={triggerRef} type="button" className="min-h-11 rounded-xl px-4 font-semibold" onClick={() => setOpen(true)}>
        Open pointer details
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pointer details" returnFocusRef={triggerRef}>
        <p>Closing returns to the control that opened these details.</p>
      </Sheet>
    </main>
  );
}

export const ExplicitPointerReturn: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
    motion: "reduce",
  },
  render: () => <ExplicitReturnFocusFixture />,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const previousTask = page.getByRole("textbox", { name: "Other task" });
    const trigger = page.getByRole("button", { name: "Open pointer details" });
    const expectReturned = async () => {
      await waitFor(() => {
        expect(page.queryByRole("dialog", { name: "Pointer details" })).toBeNull();
        expect(trigger).toHaveFocus();
      });
    };

    previousTask.focus();
    expect(previousTask).toHaveFocus();
    // Safari pointer activation can preserve another control's focus. A
    // native click deliberately opens without a test helper focusing it.
    trigger.click();
    const dialog = await page.findByRole("dialog", { name: "Pointer details" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close Pointer details" }));
    await expectReturned();

    previousTask.focus();
    expect(previousTask).toHaveFocus();
    trigger.click();
    await page.findByRole("dialog", { name: "Pointer details" });
    await userEvent.keyboard("{Escape}");
    await expectReturned();
  },
};


function GuardedSheetFixture() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <main className="min-h-screen p-4" style={{ background: "var(--app-bg)" }}>
      <button ref={triggerRef} type="button" className="min-h-11 rounded-xl px-4 font-semibold" onClick={() => setOpen(true)}>Open guarded details</button>
      <BottomSheet
        present={open}
        onClose={() => setOpen(false)}
        ariaLabel="Guarded details"
        returnFocusRef={triggerRef}
        canDismiss={() => !pendingRef.current}
      >
        {(dismiss) => (
          <>
            <SheetHandle onClose={dismiss} closeLabel="Close guarded details" />
            <div className="space-y-3 p-4">
              <h2 className="text-lg font-semibold">Guarded details</h2>
              <p role="status">{pending ? "Operation in progress" : "Ready to close"}</p>
              <Button onClick={() => {
                pendingRef.current = true;
                setPending(true);
              }}>Start operation</Button>
              <Button onClick={() => {
                pendingRef.current = false;
                setPending(false);
              }}>Finish operation</Button>
            </div>
          </>
        )}
      </BottomSheet>
    </main>
  );
}

export const GuardedDismissal: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
    motion: "reduce",
  },
  render: () => <GuardedSheetFixture />,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole("button", { name: "Open guarded details" });
    await userEvent.click(trigger);
    const dialog = await page.findByRole("dialog", { name: "Guarded details" });
    const content = within(dialog);
    const close = content.getByRole("button", { name: "Close guarded details" });
    await waitFor(() => {
      const rect = close.getBoundingClientRect();
      const hit = close.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      expect(hit === close || (hit !== null && close.contains(hit))).toBe(true);
    });
    await userEvent.click(content.getByRole("button", { name: "Start operation" }));
    await expect(content.getByRole("status")).toHaveTextContent("Operation in progress");
    await userEvent.click(close);
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    // The backdrop is a pointer convenience that assistive tech never meets:
    // the handle row's labeled button is the dialog's only Close control.
    const backdrop = dialog.querySelector<HTMLButtonElement>("[data-bottom-sheet-backdrop]")!;
    await expect(backdrop).toHaveAttribute("aria-hidden", "true");
    await expect(backdrop.tabIndex).toBe(-1);
    const closeControls = content.getAllByRole("button", { name: /^Close/ });
    await expect(closeControls).toHaveLength(1);
    await expect(closeControls[0]).toBe(close);
    // Its visual center is covered by the panel, so activate the element
    // itself instead of a point on the screen.
    backdrop.click();
    await expect(dialog).toBeVisible();
    await userEvent.click(content.getByRole("button", { name: "Finish operation" }));
    await expect(content.getByRole("status")).toHaveTextContent("Ready to close");
    await userEvent.click(close);
    await waitFor(() => {
      expect(page.queryByRole("dialog", { name: "Guarded details" })).toBeNull();
      expect(trigger).toHaveFocus();
    });
  },
};
