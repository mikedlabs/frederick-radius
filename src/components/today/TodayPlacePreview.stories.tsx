import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import TodayPlacePreview from "./TodayPlacePreview";

const unknownPlace: DaypartPick = {
  slug: "story-coffee-place", name: "Sample community coffee house near the river", rating: null,
  confidence: "unconfirmed", fact: "Hours are not confirmed.", where: "Brunswick", distance: "6 min walk",
};
const meta = {
  title: "Today/Place preview", component: TodayPlacePreview,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "The shared Today lead preview. Hours and rankings are isolated fixtures; existing exact-place owned/Commons assets retain their source records." } } },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { place: unknownPlace, category: "coffee" },
} satisfies Meta<typeof TodayPlacePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const usablePreview: NonNullable<Story["play"]> = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const card = canvasElement.querySelector<HTMLElement>("[data-today-place-preview]")!;
  await expect(canvas.getByRole("heading", { name: args.place.name })).toBeVisible();
  await expect(canvas.getByText(args.place.fact!, { exact: true })).toBeVisible();
  await expect(canvasElement.querySelector("a a")).toBeNull();
  await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  for (const control of [canvas.getByRole("link", { name: `View place: ${args.place.name}` }), canvas.getByRole("link", { name: `Map: ${args.place.name}` })]) {
    control.scrollIntoView({ block: "center" });
    const bounds = control.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  const image = card.querySelector<HTMLImageElement>("img");
  if (image) {
    image.scrollIntoView({ block: "center" });
    await waitFor(async () => { await image.decode(); expect(image.naturalWidth).toBeGreaterThan(1); expect(image.naturalHeight).toBeGreaterThan(1); });
    await expect(card.querySelector("[data-today-pick-context]")?.closest("[data-place-card-photo]")).toBeNull();
  } else {
    await expect(card.querySelector("[data-place-card-photo]")).toBeNull();
    await expect(card.querySelector(".place-card-photo-credit")).toBeNull();
  }
};

export const UnknownHoursWithoutPhoto: Story = { play: usablePreview };
export const UnknownHours320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: usablePreview,
};
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: usablePreview,
};
export const OwnedExactPlace: Story = {
  args: { place: { ...unknownPlace, slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", where: "Frederick", distance: null }, category: "outdoors" },
  play: async (context) => {
    await usablePreview(context);
    const frame = context.canvasElement.querySelector("[data-place-card-photo]")!;
    await expect(frame.getAttribute("data-place-card-photo-source")).toBe("owned");
    await expect(context.canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  },
};
export const LicensedExactPlace: Story = {
  args: { place: { ...unknownPlace, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", where: "Frederick", distance: null }, category: "museum" },
  play: async (context) => {
    await usablePreview(context);
    const canvas = within(context.canvasElement);
    await expect(await canvas.findByText("Photo by Pete Giove-Fourwinds.")).toBeVisible();
    await expect(canvas.getByText("Resized and converted for display; cards may crop the image responsively.")).toBeVisible();
    for (const control of [canvas.getByRole("link", { name: "Wikimedia Commons" }), canvas.getByRole("link", { name: "CC BY-SA 3.0" })]) {
      control.scrollIntoView({ block: "center" });
      await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      await expect(control.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    }
  },
};
