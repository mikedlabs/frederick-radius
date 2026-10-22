import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { MapPin, ArrowRight } from "lucide-react";
import Link from "next/link";
import { freeSearchPlaceVisual } from "@/lib/search/place-visual";
import SearchPlaceVisual, { SearchPlaceLead } from "./SearchPlaceVisual";

const destinations = {
  schifferstadt: { slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", where: "Museums · Frederick City" },
  lock30: { slug: "co-canal-lock-30-brunswick", name: "C&O Canal Lock 30", where: "Parks · Brunswick" },
  barracks: { slug: "hessian-barracks-frederick-maryland", name: "Hessian Barracks Frederick Maryland", where: "Civic · Frederick City" },
  museum: { slug: "national-museum-civil-war-medicine-frederick", name: "National Museum of Civil War Medicine", where: "Museums · Frederick City" },
};
function LeadWorkshop({ destination = "schifferstadt", width = 358 }: { destination?: keyof typeof destinations; width?: number }) {
  const place = destinations[destination];
  const source = freeSearchPlaceVisual({ slug: place.slug });
  return <main style={{ width, maxWidth: "calc(100vw - 32px)" }}>
    <h1 className="mb-3 text-xl font-semibold">Find a place</h1>
    <ul className="mt-3"><li className="overflow-hidden rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)" }}>
      <SearchPlaceVisual source={source} lead>
        <SearchPlaceLead fallback={<MapPin aria-hidden />} actions={<>
          <Link href={`/places/${place.slug}`} prefetch={false}>View place <ArrowRight aria-hidden /></Link>
          <Link href={`/map?place=${place.slug}&in=county`} prefetch={false}><MapPin aria-hidden />Map</Link>
        </>}>
          <p className="text-xs">Best match · Place</p>
          <h2>{place.name}</h2>
          <p className="mt-2 text-sm">{place.where}</p>
          <p className="mt-2 text-sm">Hours not posted</p>
        </SearchPlaceLead>
      </SearchPlaceVisual>
    </li></ul>
  </main>;
}
const meta = {
  title: "Radius UI/Photographic place lead", component: LeadWorkshop,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "The actual shared Find/Search leading-photo renderer, exact existing licensed local originals and complete source records. Sample search layout only; no new place or hours verification." } } },
} satisfies Meta<typeof LeadWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;

async function decodedImage(canvasElement: HTMLElement) {
  const image = canvasElement.querySelector<HTMLImageElement>("[data-search-place-photo-frame='lead'] img");
  if (!image) throw new Error("The selected exact image must mount.");
  image.scrollIntoView({ block: "center" });
  await waitFor(async () => {
    await image.decode();
    expect(image.naturalWidth).toBeGreaterThan(1);
    expect(image.naturalHeight).toBeGreaterThan(1);
  }, { timeout: 5000 });
  return image;
}
const usableLead: NonNullable<Story["play"]> = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const place = destinations[args.destination ?? "schifferstadt"];
  const source = freeSearchPlaceVisual({ slug: place.slug })!;
  if (source.kind !== "curated") throw new Error("The story requires a real licensed local source.");
  const image = await decodedImage(canvasElement);
  const url = new URL(image.currentSrc, window.location.href);
  await expect(url.pathname === source.src || url.searchParams.get("url") === source.src).toBe(true);
  const lead = canvasElement.querySelector<HTMLElement>("[data-search-place-lead]")!;
  const frame = image.parentElement!.getBoundingClientRect();
  const leadBounds = lead.getBoundingClientRect();
  const header = image.parentElement!.nextElementSibling!.getBoundingClientRect();
  if (leadBounds.width >= 600) {
    await expect(frame.height).toBe(240);
    await expect(header.left).toBeGreaterThanOrEqual(frame.right);
    await expect(header.top).toBe(frame.top);
    await expect(frame.width).toBeGreaterThanOrEqual(300);
    await expect(header.width).toBeGreaterThanOrEqual(300);
  } else {
    // A narrow result stays stacked even in a wide workshop viewport.
    await expect(frame.height).toBeGreaterThanOrEqual(150);
    await expect(frame.height).toBeLessThanOrEqual(180);
    await expect(header.top).toBeGreaterThanOrEqual(frame.bottom);
    await expect(frame.width).toBe(leadBounds.width);
  }
  if (args.width === 900) await expect(leadBounds.width).toBeGreaterThan(880);
  await expect(canvas.getByRole("heading", { name: place.name })).toBeVisible();
  await expect(canvas.getByText("Hours not posted")).toBeVisible();
  // Decoding and React’s source-bound load commit are separate boundaries.
  const attribution = await canvas.findByRole("link", { name: "Wikimedia Commons" });
  await expect(canvas.getByText(source.photo.modifications!)).toBeVisible();
  await expect(attribution).toHaveAttribute("href", source.photo.source_url);
  const deed = canvas.getByRole("link", { name: source.photo.license });
  await expect(deed).toHaveAttribute("href", source.photo.licenseUrl);
  await expect(canvasElement.querySelector("a a")).toBeNull();
  // Attribution and both actions form full-width rows below the two columns.
  const credit = attribution.closest<HTMLElement>(".place-card-photo-credit")!;
  const actions = canvas.getByRole("link", { name: "View place" }).parentElement!;
  await expect(credit.getBoundingClientRect().width).toBe(lead.getBoundingClientRect().width);
  await expect(actions.getBoundingClientRect().width).toBe(lead.getBoundingClientRect().width);
  for (const control of [canvas.getByRole("link", { name: "View place" }), canvas.getByRole("link", { name: /^Map$/ }), attribution, deed]) {
    control.scrollIntoView({ block: "center" });
    const bounds = control.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  const main = canvasElement.querySelector("main")!;
  await expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
  const heading = canvas.getByRole("heading", { name: place.name });
  const range = document.createRange(); range.selectNodeContents(heading);
  const text = range.getBoundingClientRect();
  const body = heading.closest("li")!.getBoundingClientRect();
  await expect(text.left).toBeGreaterThanOrEqual(body.left);
  await expect(text.right).toBeLessThanOrEqual(body.right);
};
export const ExactPlace390: Story = { play: usableLead };
export const WidePlace900: Story = {
  args: { width: 900 },
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  play: usableLead,
};
export const ExactPlace320: Story = { args: { width: 288, destination: "lock30" }, play: usableLead };
export const MuseumEntrance320: Story = {
  args: { width: 288, destination: "museum" },
  play: async context => {
    await usableLead(context);
    await expect(getComputedStyle(context.canvasElement.querySelector("img")!).objectPosition).toBe("50% 100%");
  },
};
export const EnlargedText320: Story = {
  args: { width: 288, destination: "barracks" },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: usableLead,
};
export const FailedPhotoKeepsPlaceAndActions: Story = {
  play: async (context) => {
    await usableLead(context);
    const { canvasElement } = context;
    canvasElement.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("[data-search-place-photo-frame='lead']")).toBeNull());
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: destinations.schifferstadt.name })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "View place" })).toHaveAttribute("href", `/places/${destinations.schifferstadt.slug}`);
    await expect(canvas.getByRole("link", { name: /^Map$/ })).toBeVisible();
  },
};
