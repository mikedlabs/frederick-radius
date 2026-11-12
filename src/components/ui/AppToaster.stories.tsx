import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import { toast } from "sonner";
import { applyAppearance, getAppearance } from "@/lib/appearance";
import { contrastRatio } from "@/lib/color/brandHue";
import { notifyError, notifyRemoved, notifySaved } from "@/lib/feedback/notify";
import AppToaster from "./AppToaster";
import { Button } from "./Button";

type Kind = "saved" | "removed" | "firstSave" | "failure";
const WIDTHS = [320, 375, 390, 430];
const item = { type: "place", id: "baker-park-frederick" } as const;
const onUndo = fn();
const onForward = fn();
const onRetry = fn();

const raise: Record<Kind, () => void> = {
  saved: () => notifySaved({ label: "Baker Park", onUndo, item }),
  removed: () => notifyRemoved({ label: "Baker Park", onUndo, item }),
  firstSave: () => notifySaved({
    label: "Baker Park",
    title: "Your saved list starts here",
    description: "Anything you save stays together under Saved.",
    onUndo,
    forward: { label: "Keep handy", onClick: onForward },
    item,
  }),
  failure: () => notifyError({
    title: "Could not remove from Saved",
    description: "This device could not confirm the saved change. Please try again.",
    onRetry,
  }),
};

/** Page copy runs behind the place the toast lands, so a surface that lets
 *  text show through is obvious in review. */
function ToastStage({ kind }: { kind: Kind }) {
  useEffect(() => {
    raise[kind]();
    return () => { toast.dismiss(); };
  }, [kind]);
  return (
    <div className="flex min-h-dvh flex-col justify-end gap-3 p-4 pb-24 text-[13px] leading-relaxed" style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}>
      <p>Baker Park Carillon plays on Sunday afternoons. Hours today run from 11am to 9pm.</p>
      <p>Plan from here, order online, or report a broken link.</p>
      <div><Button variant="secondary" onClick={raise[kind]}>Show the message again</Button></div>
      <AppToaster />
    </div>
  );
}

const meta = {
  title: "Radius UI/Toast",
  component: ToastStage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The one Sonner configuration for the app. Raise messages through src/lib/feedback/notify.ts: a save or a removal carries Undo for six seconds, and a failure stays for eight with its reason and a retry when one exists. Toasts for one saved item share an id, so a second tap replaces the message instead of stacking another.",
      },
    },
  },
  args: { kind: "saved" },
  argTypes: { kind: { control: "inline-radio", options: ["saved", "removed", "firstSave", "failure"] } },
  beforeEach: () => {
    toast.dismiss();
    onUndo.mockClear();
    onForward.mockClear();
    onRetry.mockClear();
  },
} satisfies Meta<typeof ToastStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Composite the element's own background over its ancestors and return the
 *  opaque result, so translucent surfaces fail instead of flattering the math. */
function paintedColor(element: Element, property: "color" | "backgroundColor" | "borderTopColor") {
  const owner = element.ownerDocument;
  const view = owner.defaultView!;
  const sample = owner.createElement("canvas");
  sample.width = sample.height = 1;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Computed contrast requires a canvas context.");
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
  for (const node of property === "backgroundColor" ? chain : chain.slice(0, -1)) {
    context.fillStyle = view.getComputedStyle(node).backgroundColor;
    context.fillRect(0, 0, 1, 1);
  }
  if (property !== "backgroundColor") {
    context.fillStyle = view.getComputedStyle(element)[property];
    context.fillRect(0, 0, 1, 1);
  }
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

async function frontToast(title: string) {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    found = [...document.querySelectorAll<HTMLElement>("[data-sonner-toast][data-front='true']")]
      .find((node) => node.querySelector("[data-title]")?.textContent === title);
    expect(found).toBeDefined();
    expect(found).toHaveAttribute("data-mounted", "true");
  });
  // Sonner eases the toast in over 400ms; geometry is only final at rest.
  await waitFor(() => expect(found!.getAnimations().length).toBe(0));
  return found!;
}

async function expectReadableToast(node: HTMLElement) {
  const view = node.ownerDocument.defaultView!;
  const root = node.ownerDocument.documentElement;
  const toaster = node.closest<HTMLElement>("[data-sonner-toaster]")!;
  const context = `${node.querySelector("[data-title]")?.textContent} at ${root.clientWidth}px, ${root.dataset.appearance ?? "light"}`;

  await expect(toaster.dataset.sonnerTheme, context).toBe(getAppearance());
  await expect(view.getComputedStyle(toaster).zIndex, context).toBe(view.getComputedStyle(root).getPropertyValue("--z-toast").trim());
  await expect(view.getComputedStyle(node).pointerEvents, context).toBe("auto");

  // Opaque surface: nothing on the page reads through the message.
  const surfaceStyle = view.getComputedStyle(node).backgroundColor;
  await expect(surfaceStyle, context).toMatch(/^rgb\(/);
  const surface = paintedColor(node, "backgroundColor");

  for (const part of node.querySelectorAll("[data-title], [data-description], [data-icon]")) {
    const minimum = part.matches("[data-icon]") ? 3 : 4.5;
    await expect(contrastRatio(paintedColor(part, "color"), surface), `${context}: ${part.getAttributeNames().join(" ")}`).toBeGreaterThanOrEqual(minimum);
  }

  const box = node.getBoundingClientRect();
  await expect(box.left, context).toBeGreaterThanOrEqual(0);
  await expect(box.right, context).toBeLessThanOrEqual(root.clientWidth);

  const buttons = [...node.querySelectorAll<HTMLElement>("[data-button]")];
  for (const button of buttons) {
    const label = `${context}: ${button.textContent}`;
    const rect = button.getBoundingClientRect();
    await expect(rect.height, label).toBe(32);
    await expect(contrastRatio(paintedColor(button, "color"), paintedColor(button, "backgroundColor")), label).toBeGreaterThanOrEqual(4.5);
    await expect(contrastRatio(paintedColor(button, "borderTopColor"), surface), label).toBeGreaterThanOrEqual(3);
    // The 44px extender owns the points above and below the 32px control.
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (const offset of [-21, 0, 21]) {
      await expect(node.ownerDocument.elementFromPoint(x, y + offset), `${label} hit at ${offset}px`).toBe(button);
    }
  }

  // Two controls, or one on the narrowest phones, sit under the message so it
  // never wraps into a thin column beside them.
  const content = node.querySelector<HTMLElement>("[data-content]")!.getBoundingClientRect();
  if (buttons.length === 2 || (buttons.length === 1 && root.clientWidth < 360)) {
    await expect(buttons[0].getBoundingClientRect().top, context).toBeGreaterThanOrEqual(content.bottom);
    await expect(content.width, context).toBeGreaterThanOrEqual(220);
  }
  if (buttons.length === 2) {
    const [first, second] = buttons.map((button) => button.getBoundingClientRect());
    await expect(first.top, context).toBe(second.top);
    await expect(second.left - first.right, context).toBeLessThanOrEqual(12);
  }
}

const TITLES: Record<Kind, string> = {
  saved: "Saved · Baker Park",
  removed: "Removed from Saved · Baker Park",
  firstSave: "Your saved list starts here",
  failure: "Could not remove from Saved",
};

async function everyStateAtEveryWidth() {
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  const browser = inBrowserGate ? await import("vitest/browser") : null;
  for (const width of browser ? WIDTHS : [document.documentElement.clientWidth]) {
    if (browser) await browser.page.viewport(width, 844);
    await waitFor(() => expect(document.documentElement.clientWidth).toBe(width));
    for (const kind of Object.keys(raise) as Kind[]) {
      toast.dismiss();
      await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).toBeNull());
      raise[kind]();
      await expectReadableToast(await frontToast(TITLES[kind]));
    }
  }
}

export const Saved: Story = {
  play: async () => {
    const node = await frontToast(TITLES.saved);
    await expectReadableToast(node);
    await userEvent.click(node.querySelector<HTMLElement>("[data-button]")!);
    await expect(onUndo).toHaveBeenCalledTimes(1);
  },
};

export const Removed: Story = { args: { kind: "removed" } };

export const FirstSave: Story = {
  args: { kind: "firstSave" },
  play: async () => {
    const node = await frontToast(TITLES.firstSave);
    await expectReadableToast(node);
    await expect([...node.querySelectorAll("[data-button]")].map((button) => button.textContent)).toEqual(["Undo", "Keep handy"]);
  },
};

export const Failure: Story = {
  args: { kind: "failure" },
  play: async () => {
    const node = await frontToast(TITLES.failure);
    await expectReadableToast(node);
    await expect(node).toHaveAttribute("data-type", "error");
    await expect(getComputedStyle(node).borderInlineStartWidth).toBe("3px");
    await userEvent.click(node.querySelector<HTMLElement>("[data-button]")!);
    await expect(onRetry).toHaveBeenCalledTimes(1);
  },
};

/** A second message for the same item replaces the first in place. */
export const SameItemReplaces: Story = {
  play: async () => {
    await frontToast(TITLES.saved);
    raise.removed();
    const node = await frontToast(TITLES.removed);
    await expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
    await expect(node).not.toHaveAttribute("data-type", "success");
    raise.firstSave();
    await frontToast(TITLES.firstSave);
    raise.removed();
    const replaced = await frontToast(TITLES.removed);
    // Nothing from the two-button toast carries over.
    await expect(replaced.querySelector("[data-description]")).toBeNull();
    await expect(replaced.querySelectorAll("[data-button]")).toHaveLength(1);
  },
};

export const EveryWidth: Story = {
  parameters: { docs: { description: { story: "The browser gate raises all four messages at 320, 375, 390 and 430 pixels and measures the surface, the text contrast and the 44-pixel hit area of each button." } } },
  play: everyStateAtEveryWidth,
};

export const DarkAppearance: Story = {
  args: { kind: "firstSave" },
  beforeEach: () => {
    const previous = getAppearance();
    applyAppearance("dark", false);
    return () => { applyAppearance(previous, false); };
  },
  play: everyStateAtEveryWidth,
};
