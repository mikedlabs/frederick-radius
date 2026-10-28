import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import { FromYourSavedView } from "./FromYourSaved";

const fixture = (slug: string, name: string, category: string, municipality = "frederick"): PlaceCardData => ({
  slug, name, category, municipality, city: municipality, tags: [], open_status: { state: "unknown" },
  short_blurb: "", state: "MD", postal_code: "21701", is_verified: false, feature_score: 0, source: "manual",
  updated_at: "2026-10-28", source_id: "workshop-saved-fixture", source_url: null, license: "Demonstration fixture",
  confidence: "curated", first_seen_at: "2026-10-28T12:00:00Z", last_verified_at: "2026-10-28T12:00:00Z",
  address: "Frederick County, MD", geom: { lng: -77.41, lat: 39.41 },
});
const scenic = fixture("joseph-dill-baker-memorial-carillon-bell-tower", "Baker Park Carillon", "outdoors");
const merchant = fixture("ibiza-cafe", "Ibiza Cafe", "coffee");
const meta = {
  title: "Today/Saved choices", component: FromYourSavedView,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "Isolated saved-membership and hours fixtures, not live availability. Exact accepted scenic photos or decorative category artwork; no merchant photo approval or provider hydration is implied." } } },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { places: [scenic, merchant], returnTo: "/today?in=frederick#today-saved" },
} satisfies Meta<typeof FromYourSavedView>;
export default meta;
type Story = StoryObj<typeof meta>;
const usable: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("heading", { name: "Your saved places" })).toBeVisible();
  await expect(canvas.getAllByText("Hours not confirmed")).toHaveLength(2);
  await expect(canvasElement.querySelectorAll("a a, a button")).toHaveLength(0);
  const cards = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-today-saved-place]"));
  await expect(cards).toHaveLength(2);
  for (const card of cards) {
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
    for (const action of Array.from(card.querySelectorAll<HTMLAnchorElement>("a"))) {
      const box = action.getBoundingClientRect();
      await expect(box.width).toBeGreaterThanOrEqual(44); await expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(canvasElement.querySelector('[data-today-saved-place="ibiza-cafe"] img')).toBeNull();
  await expect(canvasElement.querySelector('[data-today-saved-place="ibiza-cafe"] [data-place-category-art]')).not.toBeNull();
};
export const MixedPhotoAndArtwork: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: usable };
export const NarrowMobile: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: usable };
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  beforeEach: () => { const previous = document.documentElement.style.fontSize; document.documentElement.style.fontSize = "200%"; return () => { document.documentElement.style.fontSize = previous; }; },
  play: async context => {
    await usable(context);
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    const cards = Array.from(context.canvasElement.querySelectorAll<HTMLElement>("[data-today-saved-place]"));
    await expect(cards[1].getBoundingClientRect().top).toBeGreaterThanOrEqual(cards[0].getBoundingClientRect().bottom);
  },
};
export const Dark390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => { const previous = document.documentElement.dataset.appearance; document.documentElement.dataset.appearance = "dark"; return () => { if (previous === undefined) delete document.documentElement.dataset.appearance; else document.documentElement.dataset.appearance = previous; }; },
  play: usable,
};
export const AllUnknownHours: Story = { args: { places: [merchant, fixture("unreviewed-restaurant", "A saved neighborhood restaurant", "restaurant", "brunswick")] } };
export const LoadingDetails: Story = { args: { places: [], state: "loading" } };
export const DetailsFailure: Story = { args: { places: [], state: "error", onRetry: () => {} }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText("Your saved list is kept, but the place details could not load.")).toBeVisible();
  const retry = canvas.getByRole("button", { name: "Try again" }).getBoundingClientRect();
  await expect(retry.height).toBeGreaterThanOrEqual(44); await expect(retry.width).toBeGreaterThanOrEqual(44);
} };
export const EmptyMembership: Story = { args: { places: [] }, play: async ({ canvasElement }) => {
  await expect(canvasElement.querySelector("[data-today-saved]")).toBeNull();
} };
