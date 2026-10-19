import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { Music } from "lucide-react";
import { useState } from "react";
import Pill from "./Pill";

const meta = {
  title: "Radius UI/Pill", component: Pill,
  parameters: { layout: "centered", a11y: { test: "error" } },
  args: { children: "Music", count: 8, icon: <Music className="h-3.5 w-3.5" aria-hidden /> },
} satisfies Meta<typeof Pill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Choices: Story = { render: () => <div className="flex flex-wrap items-center gap-3 p-4">
  <Pill active>Today</Pill><Pill>Tomorrow</Pill><Pill tone="cool" active>Frederick</Pill>
</div> };

function MusicChoice() {
  const [active, setActive] = useState(false);
  return <div className="space-y-3 p-4">
    <p className="text-sm">Use the music filter to narrow the event list.</p>
    <Pill active={active} count={8} icon={<Music className="h-3.5 w-3.5" aria-hidden />} onClick={() => setActive(value => !value)}>Music</Pill>
  </div>;
}
export const NativeKeyboardChoice: Story = {
  render: () => <MusicChoice />,
  play: async ({ canvasElement }) => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    const keys = browser.server.browser === "webkit" && browser.server.platform === "darwin" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
    const canvas = within(canvasElement);
    const instruction = canvas.getByText("Use the music filter to narrow the event list.");
    // The browser runner replaces its iframe between story files. A trusted
    // click on noninteractive text establishes this frame before native Tab,
    // without assigning focus to the control or simulating its activation.
    let setupPointerTrusted = false;
    instruction.addEventListener("pointerdown", event => { setupPointerTrusted = event.isTrusted; }, { once: true });
    await browser.userEvent.click(instruction);
    expect(setupPointerTrusted).toBe(true);
    const choice = canvas.getByRole("button", { name: /Music/ });
    const before = choice.getBoundingClientRect();
    expect([document.body, document.documentElement]).toContain(document.activeElement);
    await browser.userEvent.keyboard(keys);
    expect(choice).toHaveFocus();
    expect(choice.matches(":focus-visible")).toBe(true);
    expect(parseFloat(getComputedStyle(choice).outlineWidth)).toBeGreaterThanOrEqual(2);
    await browser.userEvent.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(choice.getBoundingClientRect().height).toBe(before.height);
    expect(choice.getBoundingClientRect().width).toBe(before.width);
    await browser.userEvent.keyboard(" ");
    expect(choice).toHaveAttribute("aria-pressed", "false");
    expect(choice.getBoundingClientRect().height).toBe(before.height);
    expect(choice.getBoundingClientRect().width).toBe(before.width);
  },
};


function ClippedChoices() {
  const [active, setActive] = useState(false);
  return <div className="space-y-3 p-4">
    <p className="text-sm">Choose a filter or switch to another town.</p>
    <nav aria-label="Clipped event and town choices" className="flex w-[296px] max-w-[calc(100vw-32px)] gap-1.5 overflow-x-auto p-1">
      <Pill size="sm" active={active} onClick={() => setActive(value => !value)}>A</Pill>
      <Pill size="sm" href="/m/brunswick">Brunswick</Pill>
      <Pill size="sm" icon={<Music className="h-3.5 w-3.5" aria-hidden />} count={8}>Music</Pill>
      <Pill size="sm" href="/m/frederick">Frederick</Pill>
      <Pill size="sm">Tomorrow</Pill>
    </nav>
  </div>;
}

type PillContext = Parameters<NonNullable<Story["play"]>>[0];
async function clippedRail(context: PillContext, reduced: boolean) {
  const { canvasElement } = context;
  if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
  const browser = await import("vitest/browser");
  const canvas = within(canvasElement);
  const instruction = canvas.getByText("Choose a filter or switch to another town.");
  // A real click establishes the current test iframe without pre-focusing a
  // control. The following edge click and Tab remain trusted browser input.
  let trustedSetup = false;
  instruction.addEventListener("pointerdown", event => { trustedSetup = event.isTrusted; }, { once: true });
  await browser.userEvent.click(instruction);
  expect(trustedSetup).toBe(true);
  const protocol = browser.server.browser === "chromium" ? browser.cdp() : undefined;
  try {
    if (protocol) await protocol.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
    // Chromium gets actual OS-media emulation here. Other engines still prove
    // physical ownership and keyboard behavior; release E2E owns their media.
    const actualReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (protocol) expect(actualReduced).toBe(reduced);
    await document.fonts.ready;
    const row = canvas.getByRole("navigation", { name: "Clipped event and town choices" });
    expect(getComputedStyle(row).overflowY).toBe("auto");
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    const choice = within(row).getByRole("button", { name: /^A$/ });
    const town = within(row).getByRole("link", { name: /^Brunswick$/ });
    const ownsPhysicalEdges = (control: HTMLElement) => {
      const box = control.getBoundingClientRect(), clip = row.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.top).toBeGreaterThanOrEqual(clip.top);
      expect(box.bottom).toBeLessThanOrEqual(clip.bottom);
      // Probe inside each physical edge. Rounded capsule corners are outside
      // the painted hit shape; all four edge centers must remain reachable.
      const centerX = box.left + box.width / 2, centerY = box.top + box.height / 2;
      for (const [x, y] of [[box.left + 1, centerY], [box.right - 1, centerY],
        [centerX, box.top + 1], [centerX, box.bottom - 1], [centerX, centerY]]) {
        const hit = document.elementFromPoint(x, y);
        expect(hit === control || Boolean(hit && control.contains(hit))).toBe(true);
      }
      return box;
    };
    const before = ownsPhysicalEdges(choice);
    ownsPhysicalEdges(town);
    let edgePointerTrusted = false;
    let edgePointerY = 0;
    choice.addEventListener("pointerdown", event => { edgePointerTrusted = event.isTrusted; edgePointerY = event.clientY; }, { once: true });
    // Provider positions are relative to the padding box, so subtract the
    // border to land exactly one physical pixel inside the bottom edge.
    const border = getComputedStyle(choice);
    await browser.userEvent.click(choice, { position: {
      x: before.width / 2 - parseFloat(border.borderLeftWidth),
      y: before.height - 1 - parseFloat(border.borderTopWidth),
    } });
    expect(edgePointerTrusted).toBe(true);
    expect(Math.abs(edgePointerY - (before.bottom - 1))).toBeLessThanOrEqual(0.5);
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(choice.getBoundingClientRect().height).toBe(before.height);
    expect(choice.getBoundingClientRect().width).toBe(before.width);
    await browser.userEvent.click(instruction);
    expect([document.body, document.documentElement]).toContain(document.activeElement);
    const tab = browser.server.browser === "webkit" && browser.server.platform === "darwin" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
    await browser.userEvent.keyboard(tab);
    expect(choice).toHaveFocus();
    expect(choice.matches(":focus-visible")).toBe(true);
    const focus = getComputedStyle(choice);
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(focus.outlineOffset) + parseFloat(focus.outlineWidth)).toBeLessThanOrEqual(0);
    expect(focus.outlineColor).toBe(focus.color);
    const face = choice.querySelector<HTMLElement>(":scope > [data-press-face]")!;
    const scale = () => new DOMMatrixReadOnly(getComputedStyle(face).transform === "none" ? undefined : getComputedStyle(face).transform).a;
    const shadow = getComputedStyle(choice).boxShadow;
    await browser.userEvent.keyboard("[Space>]");
    try {
      expect(choice.matches(":active")).toBe(true);
      if (actualReduced) {
        expect(scale()).toBe(1);
        expect(getComputedStyle(choice).boxShadow).not.toBe(shadow);
      } else await waitFor(() => expect(scale()).toBeLessThan(1));
      expect(choice.getBoundingClientRect().height).toBe(before.height);
      expect(choice.getBoundingClientRect().width).toBe(before.width);
      ownsPhysicalEdges(choice);
    } finally { await browser.userEvent.keyboard("[/Space]"); }
    expect(choice).toHaveAttribute("aria-pressed", "false");
    await browser.userEvent.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    ownsPhysicalEdges(choice);
    ownsPhysicalEdges(town);
  } finally {
    if (protocol) await protocol.send("Emulation.setEmulatedMedia", { features: [] });
  }
}

export const ClippedScrollingRow: Story = { render: () => <ClippedChoices />, play: context => clippedRail(context, false) };
export const ClippedScrollingRowReducedMotion: Story = {
  globals: { motion: "reduce" }, render: () => <ClippedChoices />, play: context => clippedRail(context, true),
};
