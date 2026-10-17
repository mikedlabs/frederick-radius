import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import PageChapter from "./PageChapter";

const meta = {
  title: "Radius UI/Page chapter geometry",
  component: PageChapter,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  // Match the real Today page's font-relative side gutters. At 200% text,
  // 320px leaves 256px for the complete chapter register.
  decorators: [(Story) => <main style={{ paddingInline: "1rem" }}><Story /></main>],
  args: {
    label: "Follow the day",
    variant: "plain",
    children: <section><h2>Events today</h2><p>Browse the full event board.</p></section>,
  },
} satisfies Meta<typeof PageChapter>;
export default meta;
type Story = StoryObj<typeof meta>;

const enlargedText: NonNullable<Story["beforeEach"]> = () => {
  const previous = document.documentElement.style.fontSize;
  document.documentElement.style.fontSize = "200%";
  return () => { document.documentElement.style.fontSize = previous; };
};

function registerFits(enlarged: boolean, wraps = false): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const document = canvasElement.ownerDocument;
    const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
    if (inBrowserGate) {
      const { page } = await import("vitest/browser");
      await page.viewport(320, 568);
      await waitFor(() => expect(document.documentElement.clientWidth).toBe(320));
    }
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await expect(getComputedStyle(document.documentElement).fontSize).toBe(enlarged ? "32px" : "16px");
    const chapter = within(canvasElement).getByRole("group", { name: args.label });
    const register = chapter.querySelector<HTMLElement>(".content-chapter__register")!;
    const label = register.querySelector<HTMLElement>(".content-chapter__label")!;
    const rule = register.querySelector<HTMLElement>(".content-chapter__rule")!;
    await expect(label.textContent).toBe(args.label);
    await expect(within(chapter).getByRole("heading", { name: "Events today" })).toBeVisible();
    await expect(getComputedStyle(label).overflowX).toBe("visible");
    for (const element of [chapter, register, document.body, document.documentElement]) {
      await expect(element.scrollWidth, `${element.className || element.tagName}: no horizontal overflow`).toBeLessThanOrEqual(element.clientWidth + 1);
    }
    const registerBounds = register.getBoundingClientRect();
    const ruleBounds = rule.getBoundingClientRect();
    await expect(ruleBounds.right).toBeLessThanOrEqual(registerBounds.right);
    await expect(label.getBoundingClientRect().left).toBeGreaterThanOrEqual(registerBounds.left);
    const range = document.createRange();
    range.selectNodeContents(label);
    // Check every rendered line of the full text, rather than hiding overflow
    // or relying only on the document's clipped scroll width.
    for (const line of range.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(registerBounds.left);
      await expect(line.right).toBeLessThanOrEqual(registerBounds.right);
    }
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
    if (wraps) await expect(label.getBoundingClientRect().height).toBeGreaterThan(lineHeight);
    else if (!enlarged) await expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight + 1);
  };
}

export const FollowTheDay320: Story = { play: registerFits(false) };
export const EnlargedFollowTheDay320: Story = {
  beforeEach: enlargedText,
  play: registerFits(true),
};
export const EnlargedLongLabel320: Story = {
  args: { label: "Community updates and useful things to do across Frederick County" },
  beforeEach: enlargedText,
  play: registerFits(true, true),
};
