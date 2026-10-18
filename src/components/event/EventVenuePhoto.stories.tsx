import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import EventVenuePhoto from "./EventVenuePhoto";
import { eventCardVisual } from "./eventVisuals";

const brewers = eventCardVisual({ source: "manual", venue_place_slug: "brewers-alley-frederick" })!;
const fairgrounds = eventCardVisual({ source: "manual", venue_place_slug: "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick" })!;
const meta = {
  title: "Events/Failure-safe venue photography", component: EventVenuePhoto,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  globals: { viewport: { value: "radiusMobile", isRotated: false }, motion: "reduce" },
  decorators: [(Story) => <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 720, background: "var(--app-bg)", color: "var(--app-ink)" }}>
    <h1 className="mb-3 text-xl font-semibold">Offline venue photo fixture</h1>
    <p className="mb-3 text-sm">These event facts are fictional. The photograph shows the venue.</p>
    <Story />
  </main>],
  beforeEach: () => {
    const old = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "100%";
    return () => { document.documentElement.style.fontSize = old; };
  },
  args: { visual: brewers },
} satisfies Meta<typeof EventVenuePhoto>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

async function decoded(context: Context) {
  if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
    const { page } = await import("vitest/browser"); await page.viewport(390, 844);
  }
  const image = context.canvasElement.querySelector<HTMLImageElement>("img")!;
  expect(image).not.toBeNull();
  image.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => { await image.decode(); expect(image.naturalWidth).toBeGreaterThan(1); expect(image.naturalHeight).toBeGreaterThan(1); });
  expect(image.isConnected).toBe(true);
  expect(getComputedStyle(image).objectFit).toBe("cover");
  expect(context.canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  return image;
}
export const LicensedVenue: Story = { play: async context => {
  await decoded(context);
  const credit = within(context.canvasElement);
  await expect(credit.getByText(brewers.caption)).toBeVisible();
  expect(credit.getByRole("link", { name: "CC BY-SA 2.0" })).toHaveAttribute("href", brewers.licensedCredit!.license.url);
  for (const link of context.canvasElement.querySelectorAll("a")) {
    expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  }
} };
export const OwnedVenue: Story = { args: { visual: fairgrounds }, play: async context => {
  const image = await decoded(context);
  expect(getComputedStyle(image).objectPosition).toBe("100% 50%");
  expect(context.canvasElement.textContent).toContain("during The Great Frederick Fair");
} };
export const DeclaredNativeError: Story = { play: async context => {
  const image = await decoded(context);
  image.dispatchEvent(new Event("error"));
  await waitFor(() => expect(context.canvasElement.querySelector("[data-event-venue-media]")).toBeNull());
  expect(context.canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
  expect(within(context.canvasElement).getByRole("heading", { name: "Offline venue photo fixture" })).toBeVisible();
} };
