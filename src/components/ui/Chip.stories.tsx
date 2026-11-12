import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Chip } from "./Chip";

const meta = {
  title: "Radius UI/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A compact, non-interactive status label. Chips report category, freshness or state; they never masquerade as buttons.",
      },
    },
  },
  args: {
    children: "Confirmed open",
    tone: "positive",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "brand", "cool", "positive", "warning", "danger", "accent"],
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmedOpen: Story = {};

export const TrustStates: Story = {
  render: () => (
    <div className="flex max-w-sm flex-wrap items-center justify-center gap-2 p-4">
      <Chip tone="positive" title="Hours were checked today.">Confirmed open</Chip>
      <Chip tone="warning" title="The last hours check is older than seven days.">
        Hours not recently verified
      </Chip>
      <Chip tone="neutral" title="This source did not return a current status.">
        Status unavailable
      </Chip>
      <Chip tone="danger">Temporarily closed</Chip>
    </div>
  ),
};
export const LocalContext: Story = {
  render: () => (
    <div className="flex max-w-sm flex-wrap items-center justify-center gap-2 p-4">
      <Chip tone="cool">Downtown Frederick</Chip>
      <Chip tone="accent">Live music</Chip>
      <Chip tone="positive">Good in the rain</Chip>
      <Chip tone="neutral" tabular>6 min walk</Chip>
      <Chip tone="brand">Starts in 40 min</Chip>
    </div>
  ),
};

function srgbChannels(color: string): [number, number, number] {
  // Resolve any computed color (rgb() or color(srgb ...)) through a canvas.
  const context = document.createElement("canvas").getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function luminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function blend(top: string, under: [number, number, number]): [number, number, number] {
  const context = document.createElement("canvas").getContext("2d")!;
  context.fillStyle = `rgb(${under.join(",")})`;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = top;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** The warning label stays AA in the dark appearance on its own tint. The
 *  pressed Ochre it used before measured about 2.1:1 here. */
export const WarningDarkContrast: Story = {
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-appearance");
    root.setAttribute("data-appearance", "dark");
    return () => {
      if (previous === null) root.removeAttribute("data-appearance");
      else root.setAttribute("data-appearance", previous);
    };
  },
  render: () => (
    <div className="p-4" style={{ background: "var(--app-bg-elevated-solid)" }} data-chip-ground>
      <Chip tone="warning">Hours not recently verified</Chip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ground = canvasElement.querySelector<HTMLElement>("[data-chip-ground]")!;
    const chip = ground.querySelector<HTMLElement>("span")!;
    const base = srgbChannels(getComputedStyle(ground).backgroundColor);
    const tint = blend(getComputedStyle(chip).backgroundColor, base);
    const text = srgbChannels(getComputedStyle(chip).color);
    const [hi, lo] = [luminance(text), luminance(tint)].sort((a, b) => b - a);
    await expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
  },
};

export const LongStatusAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: () => (
    <div className="flex w-[calc(100vw-24px)] flex-wrap gap-2 p-3">
      <Chip tone="warning">Hours not recently verified</Chip>
      <Chip tone="neutral">Frederick County source unavailable</Chip>
      <Chip tone="cool">Near Carroll Creek Linear Park</Chip>
    </div>
  ),
};
