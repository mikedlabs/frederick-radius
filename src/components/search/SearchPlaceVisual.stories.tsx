import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import type { PlaceCardPhotoSource } from "@/lib/place-card-photo";
import SearchPlaceVisual, { SearchPlaceVisualImage, SearchPlaceVisualCredit } from "./SearchPlaceVisual";

const owned = getOwnedPlacePhoto("carroll-creek-linear-park-frederick")!;
// The same owned pixels isolate transport from attribution UI. This is a
// declared component fixture, not an assertion about the photo's authorship.
const creditedFixture: PlaceCardPhotoSource = {
  kind: "curated", src: owned.src, alt: "Declared component fixture",
  photo: { file: "Component fixture", alt: "Declared component fixture", author: "Component test contributor",
    license: "CC BY 2.0", source_url: "https://example.com/component-photo", verified: true },
};

function MediaResult({ source = owned, canSwitch = false }: { source?: PlaceCardPhotoSource | null; canSwitch?: boolean }) {
  const [current, setCurrent] = useState(source);
  return <main className="w-[min(343px,calc(100vw-32px))] p-2">
    <h1 className="text-xl font-semibold">Search media workshop</h1>
    <p className="my-2 text-sm">Source credits below are component fixtures. The pixels use the owner’s Creek photograph.</p>
    {canSwitch && <button type="button" className="min-h-11 underline" onClick={() => setCurrent(owned)}>Use owned source</button>}
    <ul><li><SearchPlaceVisual source={current}>
      <Link href="/places/carroll-creek-linear-park-frederick" prefetch={false} className="flex min-h-20 items-center gap-3 p-2">
        <SearchPlaceVisualImage fallback={<MapPin aria-hidden />} />
        <span>Carroll Creek Linear Park</span>
      </Link>
      <SearchPlaceVisualCredit />
    </SearchPlaceVisual></li></ul>
  </main>;
}
async function usableImage(canvasElement: HTMLElement) {
  const image = canvasElement.querySelector<HTMLImageElement>("img");
  if (!image) throw new Error("The media story requires an image.");
  image.scrollIntoView({ block: "center" });
  await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(1), { timeout: 5_000 });
  await image.decode();
}

const meta = {
  title: "Radius UI/Search place visual", component: MediaResult,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MediaResult>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedExactPlace: Story = {
  play: async ({ canvasElement }) => {
    await usableImage(canvasElement);
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(within(canvasElement).getByRole("link", { name: "Carroll Creek Linear Park" })).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
  },
};

export const SourceOutsideResultLink: Story = {
  args: { source: creditedFixture },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await usableImage(canvasElement);
    const source = await canvas.findByRole("link", { name: "Wikimedia Commons" });
    await expect(source).toHaveAttribute("href", "https://example.com/component-photo");
    await expect(canvas.getByText("Photo by Component test contributor.")).toBeVisible();
    await expect(canvasElement.querySelector("a a")).toBeNull();
    for (const link of [source, canvas.getByRole("link", { name: "CC BY 2.0" })]) {
      await expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const FailedImageKeepsRealResult: Story = {
  args: { source: creditedFixture },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await usableImage(canvasElement);
    await canvas.findByRole("link", { name: "Wikimedia Commons" });
    canvasElement.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull(), { timeout: 5_000 });
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(canvas.getByRole("link", { name: "Carroll Creek Linear Park" })).toBeVisible();
  },
};

export const TransparentSignalKeepsRealResult: Story = {
  // A real first-load 1×1 transport failure. Next Image deliberately ignores
  // artificial duplicate load events after a successful decode.
  args: { source: { ...creditedFixture, src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull(), { timeout: 5_000 });
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(canvas.getByRole("link", { name: "Carroll Creek Linear Park" })).toBeVisible();
  },
};

export const SourceChangeDropsOldCredit: Story = {
  args: { source: creditedFixture, canSwitch: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await usableImage(canvasElement);
    await canvas.findByRole("link", { name: "Wikimedia Commons" });
    await userEvent.click(canvas.getByRole("button", { name: "Use owned source" }));
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await usableImage(canvasElement);
  },
};

export const MissingImageKeepsRealResult: Story = { args: { source: null } };
export const NarrowCredits: Story = {
  ...SourceOutsideResultLink,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async (context) => {
    await SourceOutsideResultLink.play!(context);
    await expect(context.canvasElement.scrollWidth).toBeLessThanOrEqual(context.canvasElement.clientWidth);
  },
};
