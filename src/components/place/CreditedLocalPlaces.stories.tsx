import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "./PlaceCard";
import { curatedPhotoSourceLabel } from "@/lib/curated-photo-source";

// Factual names/locations match the catalog; source/timestamps below identify
// a component fixture, never a new verification of hours or conditions.
const destinations = [
  { slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", category: "museum", city: "Frederick", municipality: "frederick", address: "1110 Rosemont Ave, Frederick, MD 21701", geom: { lng: -77.4269867, lat: 39.4235725 } },
  { slug: "hessian-barracks-frederick-maryland", name: "Hessian Barracks Frederick Maryland", category: "civic", city: "Frederick", municipality: "frederick", address: "101 Clarke Pl", geom: { lng: -77.4097122, lat: 39.4090337 } },
  { slug: "co-canal-lock-30-brunswick", name: "C&O Canal Lock 30", category: "park", city: "Brunswick", municipality: "brunswick", address: "Chesapeake and Ohio Canal Towpath, Brunswick, MD 21716", geom: { lng: -77.6301124, lat: 39.3113768 } },
  {"slug": "ballenger-creek-park-frederick", "name": "Ballenger Creek Park", "category": "park", "city": "Frederick", "municipality": "frederick", "address": "5420 Ballenger Creek Pike, Frederick, MD 21703", "geom": {"lng": -77.4488307, "lat": 39.3816616}},
  {"slug": "fountain-rock-nature-center-walkersville", "name": "Fountain Rock Nature Center", "category": "park", "city": "Walkersville", "municipality": "walkersville", "address": "8511 Nature Ctr Pl, Walkersville, MD 21793", "geom": {"lng": -77.3687127, "lat": 39.4757926}},
];
const places: PlaceCardData[] = destinations.map((place) => ({
  ...place, tags: [], short_blurb: "", state: "MD", postal_code: "", is_verified: false,
  open_status: { state: "unknown" }, feature_score: 0, source: "manual",
  source_id: `component-workshop:${place.slug}`, source_url: null,
  license: "Component fixture", confidence: "curated", updated_at: "2026-09-01",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
}));
const meta = {
  title: "Places/Existing licensed local photographs", component: PlaceCard,
  parameters: { layout: "centered", a11y: { test: "error" },
    docs: { description: { component: "Actual existing History photographs and recorded licenses, displayed through the production discovery card. No provider fixture or substitute imagery." } } },
  decorators: [(Story) => <div style={{ width: "min(358px, calc(100vw - 32px))" }}><Story /></div>],
  args: { place: places[0], variant: "discovery", showSource: false },
} satisfies Meta<typeof PlaceCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const checkedLocalPhoto: NonNullable<Story["play"]> = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const metadata = CREDITED_LOCAL_PLACE_PHOTOS[args.place.slug as keyof typeof CREDITED_LOCAL_PLACE_PHOTOS].image;
  const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo-source='curated'] img");
  if (!image) throw new Error("The production card must mount its local licensed photograph.");
  image.scrollIntoView({ block: "center" });
  await waitFor(async () => {
    await image.decode();
    expect(image.naturalWidth).toBeGreaterThan(1);
    expect(image.naturalHeight).toBeGreaterThan(1);
  }, { timeout: 5000 });
  const src = new URL(image.currentSrc, window.location.href);
  await expect(src.pathname === metadata.src || src.searchParams.get("url") === metadata.src).toBe(true);
  await expect(image.alt).toBe(metadata.alt);
  await expect(canvas.getByRole("heading", { name: args.place.name })).toBeVisible();
  const sourceLabel = curatedPhotoSourceLabel(metadata.source_url);
  const source = await canvas.findByRole("link", { name: sourceLabel });
  await expect(source).toHaveAttribute("href", metadata.source_url);
  const license = canvas.getByRole("link", { name: metadata.license.label });
  await expect(license).toHaveAttribute("href", metadata.license.url);
  await expect(canvas.getByText(`${sourceLabel === "Frederick County" ? "Photo provided by" : "Photo by"} ${metadata.creator}.`)).toBeVisible();
  await expect(canvas.getByText(metadata.modifications)).toBeVisible();
  const article = canvasElement.querySelector("article")!;
  await expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
  for (const control of [source, license, canvas.getByRole("button", { name: /^Save / }), canvas.getByRole("link", { name: /^Directions to / })]) {
    await expect(control.closest('button[aria-label^="View "]')).toBeNull();
    const box = control.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
  }
};

export const Schifferstadt: Story = { play: checkedLocalPhoto };
export const HessianBarracks: Story = { args: { place: places[1] }, play: checkedLocalPhoto };
export const CanalLock30: Story = { args: { place: places[2] }, play: checkedLocalPhoto };

export const CountyParkEntrance: Story = { args: { place: places[3] }, play: checkedLocalPhoto };
export const CountyNatureCenter: Story = { args: { place: places[4] }, play: checkedLocalPhoto };
