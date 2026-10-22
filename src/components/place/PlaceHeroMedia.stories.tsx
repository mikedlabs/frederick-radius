import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import PlaceHeroMedia from "./PlaceHeroMedia";

const meta = {
  title: "Places/Reviewed hero framing",
  component: PlaceHeroMedia,
  parameters: { layout: "centered", a11y: { test: "error" } },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  args: { plan: placeCardPhotoPlan({ slug: "national-museum-civil-war-medicine-frederick" }, 600),
    name: "National Museum of Civil War Medicine", aspectRatio: "16/10", width: 1280, height: 1371,
    size: "hero", priority: false, golden: false, children: null },
  render: args => <article style={{ width: "min(358px, calc(100vw - 32px))" }}>
    <h1 className="mb-3 text-xl font-semibold">{args.name}</h1>
    <PlaceHeroMedia {...args} />
    <p className="mt-3">This is an establishing photograph of the named place.</p>
  </article>,
} satisfies Meta<typeof PlaceHeroMedia>;
export default meta;
type Story = StoryObj<typeof meta>;

async function loadedImage(canvasElement: HTMLElement) {
  const image = canvasElement.querySelector<HTMLImageElement>("[data-place-hero] img")!;
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(image.naturalHeight).toBeGreaterThan(1);
    await expect(within(canvasElement).getByRole("button", { name: /^View .+ photo$/ })).toHaveAttribute("aria-busy", "false");
  }, { timeout: 5000 });
  return image;
}

export const MuseumEntranceAt16By10: Story = {
  play: async ({ canvasElement }) => {
    const image = await loadedImage(canvasElement);
    await expect(getComputedStyle(image).objectPosition).toBe("50% 100%");
    await expect(within(canvasElement).getByText("Photo by NatMuseCivMed.")).toBeVisible();
    await expect(within(canvasElement).getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(canvasElement.querySelector("button a")).toBeNull();
  },
};
export const MuseumEntranceAt16By9: Story = { ...MuseumEntranceAt16By10, args: { aspectRatio: "16/9" } };
export const OwnedCityHall: Story = {
  args: { plan: placeCardPhotoPlan({ slug: "city-hall-8" }, 600), name: "City Hall", width: 1920, height: 1440 },
  play: async ({ canvasElement }) => {
    const image = await loadedImage(canvasElement);
    const url = new URL(image.currentSrc, window.location.href);
    await expect(url.pathname === "/images/seasons/winter/013.jpg" || url.searchParams.get("url") === "/images/seasons/winter/013.jpg").toBe(true);
    await expect(getComputedStyle(image).objectPosition).toBe("50% 50%");
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  },
};
