import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { downtownGuide, weekendGuide } from "@/lib/today/local-outing-guides";
import LocalOutingGuide from "./LocalOutingGuide";

const todayOrigin = "/today?in=frederick#local-outings";
const weekend = weekendGuide(new Date("2026-11-20T19:00:00-05:00"));

const meta = {
  title: "Today/Local outing guide",
  component: LocalOutingGuide,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => (
    <main className="app-main-reading mx-auto max-w-screen-md pt-4 sm:pt-6 lg:max-w-screen-lg"><Story /></main>
  )],
  args: { guide: downtownGuide, returnTo: todayOrigin },
} satisfies Meta<typeof LocalOutingGuide>;
export default meta;
type Story = StoryObj<typeof meta>;

const usableGuide: NonNullable<Story["play"]> = async ({ args, canvasElement }) => {
  const canvas = within(canvasElement);
  await canvasElement.ownerDocument.fonts.ready;
  await expect(canvas.getByRole("heading", { level: 1, name: args.guide.title })).toBeVisible();
  await expect(canvas.getByRole("img", { name: args.guide.photo.alt })).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Back to Today" })).toHaveAttribute(
    "href",
    args.returnTo === todayOrigin ? todayOrigin : "/today",
  );
  const stops = canvas.getByRole("list");
  await expect(within(stops).getAllByRole("listitem")).toHaveLength(args.guide.stops.length);
  for (const stop of args.guide.stops) {
    const action = within(stops).getByRole("link", { name: `${stop.action.label} for ${stop.title}` });
    await expect(action).toHaveAttribute("href", stop.action.href);
    if (stop.source.href !== stop.action.href) {
      await expect(within(stops).getByRole("link", { name: `${stop.source.label}, source for ${stop.title}` }))
        .toHaveAttribute("href", stop.source.href);
    }
  }
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  for (const link of canvas.getAllByRole("link")) {
    const bounds = link.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth + 1);
  }
};

export const DowntownOnPhone: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: usableGuide,
};

export const WeekendOnPhone: Story = {
  args: { guide: weekend, returnTo: "https://example.org/" },
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  play: usableGuide,
};

export const NarrowWithEnlargedText: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "200%";
    return () => { root.style.fontSize = previous; };
  },
  play: usableGuide,
};

export const WeekendInDarkAppearance: Story = {
  args: { guide: weekend },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.dataset.appearance;
    root.dataset.appearance = "dark";
    return () => {
      if (previous === undefined) delete root.dataset.appearance;
      else root.dataset.appearance = previous;
    };
  },
  play: usableGuide,
};
