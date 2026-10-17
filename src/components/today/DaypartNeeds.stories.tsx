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
  const card = canvasElement.querySelector<HTMLElement>("[data-today-place-preview], [data-today-opening-soon]")!;
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
export const OpeningSoon: Story = {
  play: async ({ canvasElement }) => readablePlace(canvasElement),
  args: {
    rows: [{ ...row, picks: [], openingSoon: { slug: "story-opening-soon", name: "Sample coffee place", rating: null, confidence: "confirmed", fact: "Opens soon · 9am", where: "Frederick" } }],
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
        rating: null, confidence: "unconfirmed", fact: "Hours not confirmed", where: "Frederick",
      }],
    }],
  },
};


export const NarrowTownOption: Story = {
  render: (args) => <div style={{ width: "min(288px, 100%)" }}><DaypartNeeds {...args} /></div>,
  args: {
    rows: [{ ...row, picks: [{ slug: "story-town-option", name: "Sample community coffee house near the river", rating: null, confidence: "unconfirmed", fact: "Hours not confirmed", where: "Brunswick", distance: "6 min walk" }] }],
  },
  play: async ({ canvasElement }) => {
    await readablePlace(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Brunswick · 6 min walk")).toBeVisible();
    await expect(canvas.getByText("Hours not confirmed", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Places to try" })).toBeVisible();
  },
};
