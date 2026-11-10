import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "./PlaceCard";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { contrastRatio } from "@/lib/color/brandHue";

const place: PlaceCardData = {
  slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
  category: "outdoors", tags: [], city: "Frederick", municipality: "frederick",
  open_status: { state: "unknown" },
  short_blurb: "", state: "MD", postal_code: "21701", is_verified: false,
  feature_score: 0, source: "manual", updated_at: "2026-09-01",
  source_id: "component-workshop:carroll-creek", source_url: null,
  license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  address: "Carroll Creek, Frederick, MD", geom: { lng: -77.4105, lat: 39.4143 },
};
const meta = {
  title: "Places/Photograph-led card", component: PlaceCard, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(24rem,calc(100vw-32px))]"><Story /></div>],
  args: { place, variant: "answer", showSource: false },
} satisfies Meta<typeof PlaceCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PhotographLedAnswer: Story = {};
export const PhotographLedTile: Story = { args: { variant: "tile" } };

export const TileCategoryReadability: Story = {
  args: { variant: "tile" },
  parameters: {
    a11y: { test: "error" },
    docs: { description: { story: "Checks computed category-label contrast in the runner’s explicit app appearance. The standard component runner uses light mode; the browser matrix separately exercises the saved dark appearance." } },
  },
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText("Parks & trails");
    await expect(label).toBeVisible();
    const owner = canvasElement.ownerDocument;
    const view = owner.defaultView!;
    const nativeScheme = owner.documentElement.dataset.appearance === "dark" ? "dark" : "light";
    await expect(view.getComputedStyle(owner.documentElement).getPropertyValue("--app-native-scheme").trim()).toBe(nativeScheme);

    // Resolve actual browser colors, including the translucent light surface,
    // before applying the existing WCAG math. No palette value is hardcoded.
    const sample = owner.createElement("canvas");
    sample.width = sample.height = 1;
    const context = sample.getContext("2d");
    if (!context) throw new Error("Computed contrast requires a canvas context.");
    const ancestors: Element[] = [];
    for (let element: Element | null = label; element; element = element.parentElement) ancestors.unshift(element);
    for (const element of ancestors) {
      const style = view.getComputedStyle(element);
      await expect(style.backgroundImage).toBe("none");
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = context.getImageData(0, 0, 1, 1).data;
    await expect(background[3]).toBe(255);
    context.fillStyle = view.getComputedStyle(label).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = context.getImageData(0, 0, 1, 1).data;
    const ratio = contrastRatio(
      { r: foreground[0], g: foreground[1], b: foreground[2] },
      { r: background[0], g: background[1], b: background[2] },
    );
    await expect(ratio).toBeGreaterThanOrEqual(4.5);
  },
};

/** An open, dog-friendly place 480 m away. placeReasons offers "Open now",
 * "0.3 mi away" and "Dog-friendly"; the card already prints the distance. */
const openNearby: PlaceCardData = {
  ...place, slug: "place-without-photography", name: "Example Taproom", category: "brewery",
  address: "100 Example St, Frederick, MD", tags: ["dog-friendly"], distance_m: 480,
  open_status: { state: "open", closesAt: "21:00", closingSoon: false }, google_photo_url: undefined,
};

export const EachFactOnce: Story = {
  args: { place: openNearby },
  parameters: {
    a11y: { test: "error" },
    docs: { description: { story: "The distance is printed in the card’s text line and never repeated as an “away” chip. On the narrow grid cell and the tile, a long lead fact truncates and the distance stays readable, on its own line when both do not fit. A row says dog-friendly with the chip or the paw, not both. The grid cell has no colored bottom rule." } },
  },
  render: (args) => <div style={{ display: "grid", gap: 12 }}>
    {(["answer", "grid", "row"] as const).map((variant) => <div key={variant} data-variant={variant}><PlaceCard {...args} variant={variant} /></div>)}
    <div data-variant="row-dog-chip"><PlaceCard {...args} variant="row" place={{ ...openNearby, open_status: { state: "unknown" } }} /></div>
    {/* 140px is the two-up town grid cell on a 320px phone. */}
    <div data-variant="grid-narrow" style={{ width: 140 }}><PlaceCard {...args} variant="grid" /></div>
    <div data-variant="tile-long-fact"><PlaceCard {...args} variant="tile" place={{ ...openNearby, known_for: ["The taproom pours barrel-aged sours and a long guest list."] }} /></div>
  </div>,
  play: async ({ canvasElement }) => {
    const card = (variant: string) => canvasElement.querySelector<HTMLElement>(`[data-variant="${variant}"] article`)!;
    const chips = (variant: string) => [...card(variant).querySelectorAll('[aria-label="Reasons this is shown"] > span')].map((chip) => chip.textContent);
    for (const variant of ["answer", "grid", "row", "row-dog-chip", "grid-narrow", "tile-long-fact"]) {
      await expect(card(variant).textContent?.match(/0\.3 mi/g)).toHaveLength(1);
      await expect(card(variant).textContent).not.toContain("away");
    }
    // textContent ignores clipping, so measure the painted glyphs: the distance
    // must sit inside the paragraph that clips its line, and inside the card.
    const glyphs = (node: Element) => {
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const line = (variant: string) => {
      const distance = card(variant).querySelector<HTMLElement>("[data-place-distance]")!;
      const fact = distance.parentElement!.previousElementSibling as HTMLElement;
      return { paragraph: distance.closest("p")!.getBoundingClientRect(), distance: glyphs(distance), fact, lead: glyphs(fact),
        separator: distance.previousElementSibling!.getBoundingClientRect() };
    };
    for (const variant of ["grid", "grid-narrow", "tile-long-fact"]) {
      const { paragraph, distance, lead } = line(variant);
      const bounds = card(variant).getBoundingClientRect();
      await expect(distance.width).toBeGreaterThan(0);
      await expect(distance.left).toBeGreaterThanOrEqual(Math.max(paragraph.left, bounds.left) - 0.5);
      await expect(distance.right).toBeLessThanOrEqual(Math.min(paragraph.right, bounds.right) + 0.5);
      // The row is pulled left to hide a leading separator; the lead text is not.
      await expect(Math.abs(lead.left - paragraph.left)).toBeLessThanOrEqual(0.5);
    }
    // Room for both: one line, with the separator painted between the two facts.
    const wide = line("grid");
    await expect(wide.distance.top).toBeLessThan(wide.lead.bottom - 1);
    await expect(wide.separator.left).toBeGreaterThanOrEqual(wide.lead.right - 0.5);
    // No room: the category keeps its line and the distance takes the next
    // one, with the separator clipped away instead of leading that line.
    const narrow = line("grid-narrow");
    await expect(narrow.fact.scrollWidth).toBeLessThanOrEqual(narrow.fact.clientWidth);
    await expect(narrow.distance.top).toBeGreaterThanOrEqual(narrow.lead.bottom - 1);
    await expect(narrow.separator.right).toBeLessThanOrEqual(narrow.paragraph.left + 0.5);
    // A long known-for line is the part that truncates on a tile.
    const tile = line("tile-long-fact");
    await expect(tile.fact.scrollWidth).toBeGreaterThan(tile.fact.clientWidth);
    // The answer card states open hours in its status line, so its only chip is new information.
    await expect(chips("answer")).toEqual(["Dog-friendly"]);
    await expect(within(card("answer")).getByText(/^Open/)).toBeVisible();
    // Row and grid keep the open chip (their only open signal) and leave the distance seat empty.
    await expect(chips("grid")).toEqual(["Open now"]);
    await expect(chips("row")).toEqual(["Open now"]);
    await expect(card("row").querySelector('svg[aria-label="Dog-friendly"]')).not.toBeNull();
    await expect(chips("row-dog-chip")).toEqual(["Dog-friendly"]);
    await expect(card("row-dog-chip").querySelector('svg[aria-label="Dog-friendly"]')).toBeNull();
    // No colored rule closes the grid cell: its last element is the content block.
    const face = card("grid").querySelector<HTMLElement>("[data-press-face]")!;
    await expect(face.lastElementChild?.getAttribute("aria-hidden")).toBeNull();
    for (const variant of ["answer", "grid", "row", "row-dog-chip", "grid-narrow", "tile-long-fact"]) {
      await expect(card(variant).scrollWidth).toBeLessThanOrEqual(card(variant).clientWidth);
    }
  },
};

export const PhotographLedGrid: Story = { args: { variant: "grid" } };
export const MapRow: Story = { args: { variant: "row", neutral: true } };
export const WithoutPhotography: Story = { args: { place: { ...place, slug: "place-without-photography", google_photo_url: undefined } } };
export const CuratedLandmark: Story = { args: { place: {
  ...place, slug: "francis-scott-key-grave-and-monument", name: "Francis Scott Key Grave and Monument",
  address: "Mount Olivet Cemetery, Frederick, MD", google_photo_url: undefined,
} } };
export const PreferredCuratedGrid: Story = { args: { variant: "grid", place: {
  ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace", city: "Thurmont",
  address: "Catoctin Furnace, Thurmont, MD", municipality: "thurmont", google_photo_url: undefined,
} } };
export const PublicDomainCredit: Story = { args: { variant: "tile", place: {
  ...place, slug: "historic-roddy-road-covered-bridge-thurmont", name: "Roddy Road Covered Bridge", city: "Thurmont",
  address: "Roddy Road, Thurmont, MD", municipality: "thurmont", google_photo_url: undefined,
} } };
export const FailedPhotograph: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvasElement.querySelector("[data-place-card-photo] img");
    if (!image) throw new Error("The real place-photo face is missing.");
    image.dispatchEvent(new Event("error"));
    const metadata = getLandmarkPhoto(place.slug)!;
    await waitFor(() => expect(canvasElement.querySelector("[data-place-card-photo] img")?.getAttribute("alt")).toBe(metadata.alt));
    const curatedImage = canvasElement.querySelector("[data-place-card-photo] img");
    if (!curatedImage) throw new Error("The exact curated fallback is missing.");
    curatedImage.dispatchEvent(new Event("error"));
    await expect(canvas.getByRole("button", { name: /View Carroll Creek Linear Park/ })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Carroll Creek Linear Park" })).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull());
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  },
};


/** Actual image decoding and 44px source links are checked in the browser. */
export const NarrowPhotoRow: Story = {
  args: { variant: "row", neutral: true },
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Carroll Creek Linear Park" })).toBeVisible();
    const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo-source='owned'] img")!;
    image.scrollIntoView({ block: "nearest" });
    await waitFor(async () => {
      await image.decode();
      expect(image.isConnected).toBe(true);
      expect(image.naturalWidth).toBeGreaterThan(1);
      expect(image.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    const article = canvasElement.querySelector("article")!;
    await expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(canvas.getByRole("button", { name: /Save Carroll Creek/ })).toBeVisible();
  },
};

export const NarrowCuratedRow: Story = {
  args: { variant: "row", neutral: true, place: { ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace", municipality: "thurmont", city: "Thurmont" } },
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    // Deliver the real component's success event without depending on a remote
    // Commons response in component CI. Failure behavior has a separate story.
    const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo] img")!;
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 600 }, naturalHeight: { configurable: true, value: 400 } });
    image.dispatchEvent(new Event("load"));
    await waitFor(() => expect(within(canvasElement).getByRole("link", { name: "Wikimedia Commons" })).toBeVisible());
    const article = canvasElement.querySelector("article")!;
    await expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
    for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>(".place-card-photo-credit a")) {
      await expect(link.closest("button")).toBeNull();
      const bounds = link.getBoundingClientRect();
      await expect(bounds.width).toBeGreaterThanOrEqual(44);
      await expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const FailedPhotoRow: Story = {
  args: { variant: "row" },
  play: FailedPhotograph.play,
};


async function discoveryActions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const open = canvas.getByRole("button", { name: /^View / });
  const save = canvas.getByRole("button", { name: /^Save / });
  const directions = canvas.getByRole("link", { name: /^Directions to / });
  for (const control of [open, save, directions]) {
    await expect(control).toBeVisible();
    await expect(control.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  }
  await expect(save.closest('button[aria-label^="View "]')).toBeNull();
  await expect(directions.closest("button")).toBeNull();
  const article = canvasElement.querySelector("article")!;
  await expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
}

export const DiscoveryOwnedPhotograph: Story = {
  args: { variant: "discovery" },
  play: async ({ canvasElement }) => {
    await discoveryActions(canvasElement);
    const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo-source='owned'] img")!;
    image.scrollIntoView({ block: "center" });
    await waitFor(async () => {
      await image.decode();
      expect(image.naturalWidth).toBeGreaterThan(1);
      expect(image.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    const face = canvasElement.querySelector<HTMLElement>("[data-place-card-photo]")!;
    await expect(face.getBoundingClientRect().height).toBeGreaterThan(130);
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(within(canvasElement).getAllByText("Hours not confirmed")).toHaveLength(1);
  },
};

export const DiscoveryCuratedLandmark: Story = {
  args: { variant: "discovery", place: {
    ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace", city: "Thurmont",
    municipality: "thurmont", address: "Catoctin Furnace, Thurmont, MD", google_photo_url: undefined,
  } },
  parameters: { docs: { description: { story: "Uses Catoctin Furnace’s exact reviewed Commons source. It retains source credits only if that real image loads; remote availability is verified separately in release browsing." } } },
  play: async ({ canvasElement }) => {
    await discoveryActions(canvasElement);
    const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo] img");
    if (image) await expect(image.alt).toBe(getLandmarkPhoto("catoctin-furnace-thurmont")!.alt);
    for (const link of canvasElement.querySelectorAll(".place-card-photo-credit a")) {
      await expect(link.closest("button")).toBeNull();
    }
  },
};

export const DiscoveryWithoutPhotography: Story = {
  args: { variant: "discovery", place: { ...place, slug: "place-without-photography", google_photo_url: undefined } },
  play: async ({ canvasElement }) => {
    await discoveryActions(canvasElement);
    await expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull();
    await expect(canvasElement.querySelector("article")!.getBoundingClientRect().height).toBeLessThan(300);
    await expect(within(canvasElement).getAllByText("Hours not confirmed")).toHaveLength(1);
  },
};

export const DiscoveryFailedPhotography: Story = {
  args: { variant: "discovery" },
  play: async (context) => {
    await FailedPhotograph.play!(context);
    await discoveryActions(context.canvasElement);
    await expect(context.canvasElement.querySelector("article")!.getBoundingClientRect().height).toBeLessThan(300);
  },
};

export const DiscoveryNarrowPhone: Story = {
  args: { variant: "discovery" },
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await discoveryActions(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: place.name })).toBeVisible();
    const face = canvasElement.querySelector<HTMLElement>("[data-place-card-photo]")!;
    await expect(face.getBoundingClientRect().width).toBeLessThanOrEqual(288);
    await expect(face.getBoundingClientRect().height).toBeGreaterThan(130);
  },
};
