import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { DaypartRow } from "@/lib/loaders/daypartPicks";
import DaypartNeeds from "./DaypartNeeds";

const row: DaypartRow = {
  category: "coffee",
  label: "Coffee",
  href: "/places?category=coffee",
  picks: [{ slug: "story-coffee", name: "Sample coffee place", rating: null, confidence: "confirmed", fact: "Open until 5pm.", where: "Frederick" }],
};

const meta = {
  title: "Today/Current place answer",
  component: DaypartNeeds,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { rows: [row], variant: "brief" },
  beforeEach: () => {
    const previousFetch = window.fetch;
    const fixtureFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      // A failed enhancement keeps the supplied, isolated story shelf.
      if (url.startsWith("/api/want?")) return Promise.resolve(new Response(null, { status: 503 }));
      return previousFetch(input, init);
    };
    window.fetch = fixtureFetch;
    return () => { if (window.fetch === fixtureFetch) window.fetch = previousFetch; };
  },
} satisfies Meta<typeof DaypartNeeds>;

export default meta;
type Story = StoryObj<typeof meta>;
async function readablePlace(canvasElement: HTMLElement) {
  // The enhancement briefly replaces the supplied card with its skeleton.
  // Re-query after the rejected fixture request restores the real shelf.
  await waitFor(() => expect(canvasElement.querySelector("[data-today-place-lead], [data-today-opening-soon]")).toBeVisible());
  const card = canvasElement.querySelector<HTMLElement>("[data-today-place-preview], [data-today-opening-soon-preview], [data-today-opening-soon]")!;
  // Visibility can precede the real shelf's entrance animation settling.
  // A translated ancestor yields fractional DOMRect precision in Chromium;
  // measure the settled target without rounding or lowering its minimum.
  const panel = card.closest<HTMLElement>(".today-decision-swap");
  await waitFor(() => expect(panel?.getAnimations().some((animation) =>
    animation.pending || animation.playState === "running",
  ) ?? false).toBe(false));
  await expect(card.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  const name = card.querySelector<HTMLElement>("[data-today-pick-name]")!;
  const context = card.querySelector<HTMLElement>("[data-today-pick-context]")!;
  await expect(parseFloat(getComputedStyle(name).fontSize)).toBeGreaterThanOrEqual(17);
  await expect(parseFloat(getComputedStyle(context).fontSize)).toBeGreaterThanOrEqual(14);
  await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  await expect(name.scrollHeight).toBeLessThanOrEqual(name.clientHeight + 2);
}

export const ConfirmedCurrentPlace: Story = {
  play: async ({ canvasElement }) => readablePlace(canvasElement),
};
async function readableOpeningSoon(canvasElement: HTMLElement, name: string, fact: string) {
  await readablePlace(canvasElement);
  const canvas = within(canvasElement);
  const card = canvasElement.querySelector<HTMLElement>("[data-today-opening-soon-preview]")!;
  await expect(canvas.getAllByRole("heading", { name: "Opening soon" })).toHaveLength(1);
  await expect(canvas.getByText(fact, { exact: true })).toBeVisible();
  await expect(within(card).queryByText("Open now", { exact: true })).toBeNull();
  const view = canvas.getByRole("link", { name: `View place: ${name}` });
  await expect(view).toHaveAttribute("data-decision-position", "opening-soon");
  for (const control of [view, canvas.getByRole("link", { name: `Map: ${name}` })]) {
    const box = control.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(48);
    const range = document.createRange(); range.selectNodeContents(control);
    for (const line of range.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(box.left - 1);
      await expect(line.right).toBeLessThanOrEqual(box.right + 1);
      await expect(line.top).toBeGreaterThanOrEqual(box.top - 2);
      await expect(line.bottom).toBeLessThanOrEqual(box.bottom + 2);
    }
  }
}

export const OpeningSoon: Story = {
  play: async ({ canvasElement }) => readableOpeningSoon(canvasElement, "Sample coffee place", "Opens at 9am."),
  args: {
    rows: [{ ...row, picks: [], openingSoon: { slug: "story-opening-soon", name: "Sample coffee place", rating: null, confidence: "confirmed", fact: "Opens at 9am.", where: "Frederick" } }],
  },
};

export const PhotographLedPlace: Story = {
  play: async ({ canvasElement }) => readablePlace(canvasElement),
  args: {
    variant: "full",
    rows: [{
      category: "outdoors", label: "Parks", href: "/places?category=outdoors",
      picks: [{
        slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
        photo: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
        rating: null, confidence: "unconfirmed", fact: "Hours are not confirmed.", where: "Frederick",
      }],
    }],
  },
};


export const NarrowTownOption: Story = {
  render: (args) => <div style={{ width: "min(288px, 100%)" }}><DaypartNeeds {...args} /></div>,
  args: {
    rows: [{ ...row, picks: [{ slug: "story-town-option", name: "Sample community coffee house near the river", rating: null, confidence: "unconfirmed", fact: "Hours are not confirmed.", where: "Brunswick", distance: "6 min walk" }] }],
  },
  play: async ({ canvasElement }) => {
    await readablePlace(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Brunswick · 6 min walk")).toBeVisible();
    await expect(canvas.getByText("Hours are not confirmed.", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Places to try" })).toBeVisible();
  },
};


export const OpeningSoonEnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    rows: [{ ...row, picks: [], openingSoon: {
      slug: "story-opening-soon-long", name: "Sample community coffee house near the river",
      rating: null, confidence: "likely", fact: "Likely opens at 9am · check hours.", where: "Brunswick", distance: "6 min walk",
    } }],
  },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: async ({ canvasElement }) => {
    await readableOpeningSoon(canvasElement, "Sample community coffee house near the river", "Likely opens at 9am · check hours.");
    const card = canvasElement.querySelector<HTMLElement>("[data-today-opening-soon-preview]")!;
    await expect(within(card).getByText("Brunswick · 6 min walk", { exact: true })).toBeVisible();
    for (const selector of ["[data-today-pick-name]", "[data-today-pick-fact]", "[data-today-pick-location]"]) {
      const field = card.querySelector<HTMLElement>(selector)!;
      const range = document.createRange(); range.selectNodeContents(field);
      const bounds = field.getBoundingClientRect(), cardBounds = card.getBoundingClientRect();
      for (const line of range.getClientRects()) {
        await expect(line.left).toBeGreaterThanOrEqual(cardBounds.left - 1);
        await expect(line.right).toBeLessThanOrEqual(cardBounds.right + 1);
        await expect(line.top).toBeGreaterThanOrEqual(bounds.top - 2);
        await expect(line.bottom).toBeLessThanOrEqual(bounds.bottom + 2);
      }
    }
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    await expect(parseFloat(getComputedStyle(card.querySelector("[data-today-pick-name]")!).fontSize)).toBeGreaterThanOrEqual(44);
    await expect(parseFloat(getComputedStyle(card.querySelector("[data-today-pick-fact]")!).fontSize)).toBeGreaterThanOrEqual(30);
  },
};
