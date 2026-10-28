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
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "The shared Today lead preview. Hours and rankings are isolated fixtures. Owned or licensed reference images stay held until an exact current-appearance review is accepted." } } },
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
  const location = [args.place.where, args.place.distance].filter(Boolean).join(" · ");
  await expect(canvas.getByText(location, { exact: true })).toBeVisible();
  for (const selector of ["[data-today-pick-name]", "[data-today-pick-fact]", "[data-today-pick-location]"]) {
    const field = card.querySelector<HTMLElement>(selector)!;
    const range = document.createRange(); range.selectNodeContents(field);
    const text = range.getBoundingClientRect(), bounds = field.getBoundingClientRect(), cardBounds = card.getBoundingClientRect();
    await expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight + 1);
    await expect(text.left).toBeGreaterThanOrEqual(cardBounds.left - 1);
    await expect(text.right).toBeLessThanOrEqual(cardBounds.right + 1);
    await expect(text.top).toBeGreaterThanOrEqual(bounds.top - 2);
    await expect(text.bottom).toBeLessThanOrEqual(bounds.bottom + 2);
  }
  await expect(canvasElement.querySelector("a a")).toBeNull();
  await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  const save = card.querySelector<HTMLButtonElement>(`button[data-save-ref="place:${args.place.slug}"]`)!;
  await expect(save).not.toBeNull();
  await expect(save.closest("a")).toBeNull();
  for (const control of [canvas.getByRole("link", { name: `View place: ${args.place.name}` }), canvas.getByRole("link", { name: `Map: ${args.place.name}` }), save]) {
    control.scrollIntoView({ block: "center" });
    const bounds = control.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(48);
  }
  const image = card.querySelector<HTMLImageElement>("img");
  if (image) {
    image.scrollIntoView({ block: "center" });
    await waitFor(async () => { await image.decode(); expect(image.naturalWidth).toBeGreaterThan(1); expect(image.naturalHeight).toBeGreaterThan(1); });
    await expect(card.querySelector("[data-today-pick-context]")?.closest("[data-place-card-photo]")).toBeNull();
  } else {
    await expect(card.querySelector("[data-place-card-photo]")).toBeNull();
    await expect(card.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(card.querySelector('[data-place-category-art][aria-hidden="true"]')).not.toBeNull();
  }
};

// Real venue identity, with an isolated unknown-hours fixture and no photo.
export const ShortNameWithoutPhoto: Story = {
  args: { place: { ...unknownPlace, slug: "ibiza-cafe", name: "Ibiza Cafe", fact: "Hours are not confirmed.", where: "Frederick", distance: null } },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async (context) => {
    await usablePreview(context);
    const card = context.canvasElement.querySelector<HTMLElement>("[data-today-place-preview]")!;
    await expect(card.getAttribute("data-has-photo")).toBe("false");
    // A short factual recommendation keeps its decorative category identity
    // beside the facts and all three actions within one compact card.
    const bounds = card.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(350);
    await expect(bounds.width).toBeLessThanOrEqual(360);
    const height = bounds.height;
    await expect(height).toBeGreaterThanOrEqual(140);
    await expect(height).toBeLessThanOrEqual(240);
    const art = card.querySelector<HTMLElement>("[data-place-category-art]")!;
    await expect(art.getBoundingClientRect().width).toBeLessThan(bounds.width * 0.35);
    const name = card.querySelector<HTMLElement>("[data-today-pick-name]")!;
    const nameSize = parseFloat(getComputedStyle(name).fontSize);
    await expect(nameSize).toBeGreaterThanOrEqual(22);
    await expect(nameSize).toBeLessThanOrEqual(26);
    const fact = card.querySelector<HTMLElement>("[data-today-pick-fact]")!;
    const location = card.querySelector<HTMLElement>("[data-today-pick-location]")!;
    await expect(location.getBoundingClientRect().top).toBeGreaterThanOrEqual(fact.getBoundingClientRect().bottom - 1);
  },
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
  play: async (context) => {
    await usablePreview(context);
    const name = context.canvasElement.querySelector<HTMLElement>("[data-today-pick-name]")!;
    const fact = context.canvasElement.querySelector<HTMLElement>("[data-today-pick-fact]")!;
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    await expect(parseFloat(getComputedStyle(name).fontSize)).toBeGreaterThanOrEqual(44);
    await expect(parseFloat(getComputedStyle(name).fontSize)).toBeLessThanOrEqual(52);
    await expect(parseFloat(getComputedStyle(fact).fontSize)).toBeGreaterThanOrEqual(30);
  },
};
export const OwnedReferenceNeedsAppearanceReview: Story = {
  args: { place: { ...unknownPlace, slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", where: "Frederick", distance: null }, category: "outdoors" },
  play: async (context) => {
    await usablePreview(context);
    const card = context.canvasElement.querySelector("[data-today-place-preview]")!;
    await expect(card).toHaveAttribute("data-has-photo", "false");
    await expect(card.querySelector("img, [data-place-card-photo]")).toBeNull();
    await expect(context.canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  },
};
export const LicensedReferenceNeedsAppearanceReview: Story = {
  args: { place: { ...unknownPlace, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", where: "Frederick", distance: null }, category: "museum" },
  play: async (context) => {
    await usablePreview(context);
    // Identity and a license do not establish current appearance. The shared
    // source/credit components retain positive browser coverage elsewhere.
    const card = context.canvasElement.querySelector("[data-today-place-preview]")!;
    await expect(card).toHaveAttribute("data-has-photo", "false");
    await expect(card.querySelector("img, [data-place-card-photo], .place-card-photo-credit")).toBeNull();
  },
};
