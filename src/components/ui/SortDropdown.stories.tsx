import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import SortDropdown, { type SortOption } from "./SortDropdown";

type SavedSort = "town" | "open" | "recent" | "az";
const OPTIONS: ReadonlyArray<SortOption<SavedSort>> = [
  { key: "town", label: "By town", hint: "Group saved places by town" },
  { key: "open", label: "Open now", hint: "What you can go to right now" },
  { key: "recent", label: "Recent", hint: "Most recently saved first" },
  { key: "az", label: "A→Z", hint: "Alphabetical by name" },
];

/** The two real placements: at the end of a list toolbar (Saved, category
 *  lists) and at the start of a row (the Events Display panel on phones). */
function Toolbar({ align }: { align: "left" | "right" }) {
  const [sort, setSort] = useState<SavedSort>("town");
  const control = <SortDropdown options={OPTIONS} value={sort} onChange={setSort} align={align} />;
  return (
    // Focusable, as the app's own <main> is (the skip-link target).
    <main tabIndex={-1} className="px-4 py-6">
      <div className="flex items-center gap-2">
        {align === "left" && control}
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>12 saved places</p>
        {align === "right" && <div className="ml-auto">{control}</div>}
      </div>
      <button type="button" className="tap-44 mt-4 text-sm font-semibold">Open the first place</button>
      <p className="mt-56 text-sm" style={{ color: "var(--app-ink-2)" }}>You are sorting {OPTIONS.find((option) => option.key === sort)?.label}.</p>
    </main>
  );
}

const meta = {
  title: "Radius UI/Sort dropdown",
  component: SortDropdown,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  args: { options: OPTIONS, value: "town", onChange: () => undefined },
  render: () => <Toolbar align="right" />,
} satisfies Meta<typeof SortDropdown>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

const PHONE_WIDTHS = [320, 375, 390] as const;

/** The browser gate can resize its frame; the Storybook canvas checks the
 *  viewport it was opened at. */
async function eachPhoneWidth(check: (width: number) => Promise<void>) {
  if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return check(window.innerWidth);
  const { page } = await import("vitest/browser");
  for (const width of PHONE_WIDTHS) {
    await page.viewport(width, 844);
    await waitFor(() => expect(window.innerWidth).toBe(width));
    await check(width);
  }
}

async function menuStaysOnScreen({ canvasElement }: Context) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: /^Sort:/ });
  await eachPhoneWidth(async (width) => {
    await userEvent.click(trigger);
    const menu = canvas.getByRole("group", { name: "Sort" });
    const box = menu.getBoundingClientRect();
    await expect(box.left, `menu left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    await expect(box.right, `menu right edge at ${width}px`).toBeLessThanOrEqual(width);
    await expect(menu.scrollWidth, `menu text is not cut off at ${width}px`).toBeLessThanOrEqual(menu.clientWidth + 1);
    // The surface is the solid token: nothing behind it shows through the text.
    const probe = canvasElement.ownerDocument.createElement("div");
    probe.style.background = "var(--app-bg-elevated-solid)";
    menu.append(probe);
    await expect(getComputedStyle(menu).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
    probe.remove();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(width);
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveFocus();
  });
}

export const ToolbarEnd: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: menuStaysOnScreen,
};

export const RowStart: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: () => <Toolbar align="left" />,
  play: menuStaysOnScreen,
};

export const ClosesWhenAPressLandsOutside: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Sort:/ });
    const outside = canvas.getByText("12 saved places");

    // A press on the menu itself is not an outside press.
    await userEvent.click(trigger);
    canvas.getByRole("group", { name: "Sort" }).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // A finger that starts a scroll sends pointerdown and never mousedown.
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await expect(canvas.queryByRole("group", { name: "Sort" })).toBeNull();
  },
};

export const ClosesWhenFocusLeaves: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Sort:/ });
    const next = canvas.getByRole("button", { name: "Open the first place" });

    // Tab walks the choices in order, then leaves. The menu closes behind it.
    await userEvent.click(trigger);
    for (const option of OPTIONS) {
      await userEvent.tab();
      await expect(canvas.getByRole("button", { name: new RegExp(`^${option.label}`) })).toHaveFocus();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    }
    await userEvent.tab();
    await expect(next).toHaveFocus();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("group", { name: "Sort" })).toBeNull();

    // Safari does not focus a pressed button; it parks focus on the focusable
    // <main> around the control. That must not close the menu mid-press, so
    // the choice still commits and hands focus back to the trigger.
    await userEvent.click(trigger);
    canvasElement.querySelector("main")!.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(canvas.getByRole("button", { name: /^Recent/ }));
    await expect(trigger).toHaveAccessibleName("Sort: Recent");
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByText("You are sorting Recent.")).toBeVisible();

    // Focus on nothing (a Safari tap leaves it on the page) keeps the menu
    // open, and Escape from there closes it without pulling focus back.
    await userEvent.click(trigger);
    trigger.blur();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).not.toHaveFocus();
  },
};
