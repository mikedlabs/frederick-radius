import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import MapList from "./MapList";

let metadataRequests: string[] = [];

const meta = {
  title: "Map/List face",
  component: MapList,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/map" className="relative h-[620px] w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: {
    events: [],
    places: [{ slug: "story-place", name: "Sample Frederick place", category: "coffee", subcategories: [], geom: { lat: 39.414, lng: -77.41 }, open_status: { state: "open", closesAt: "17:00", closingSoon: false }, source: "manual", is_verified: true, municipality: "frederick", short_blurb: "Sample response for component review." }],
    userLoc: null,
    onPick: fn(),
    onPickEvent: fn(),
  },
  beforeEach: () => {
    metadataRequests = [];
    const previousFetch = window.fetch;
    const fixtureFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, window.location.origin).pathname === "/api/places/by-slugs") {
        metadataRequests.push(url);
        return Promise.resolve(Response.json({ places: [{ slug: "story-place", google_photo_url: null }] }));
      }
      if (url.startsWith("/api/place-photo")) return Promise.resolve(new Response(null, { status: 503 }));
      return previousFetch(input, init);
    };
    window.fetch = fixtureFetch;
    return () => { if (window.fetch === fixtureFetch) window.fetch = previousFetch; };
  },
} satisfies Meta<typeof MapList>;

export default meta;
type Story = StoryObj<typeof meta>;
export const NeutralRowsWithOpenStatus: Story = {};
export const EmptyList: Story = { args: { places: [] } };
export const RecoveryGuttersAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { failureMode: true },
  decorators: [(Story) => (
    <div className="map-error-fallback">
      <div className="map-error-fallback-head">
        <h2 className="text-[16px] font-semibold">Map view unavailable</h2>
      </div>
      <Story />
    </div>
  )],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { name: "Map view unavailable" });
    const row = canvas.getByRole("button", { name: /Sample Frederick place/ });
    const count = canvas.getByText("1 place available");
    await expect(Math.abs(heading.getBoundingClientRect().left - row.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
    await expect(Math.abs(count.getBoundingClientRect().left - row.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
  },
};

export const PendingRecoverySearch: Story = {
  args: { places: [], failureMode: true, searchState: "pending" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Searching Radius");
    await expect(canvas.queryByText("0 places available")).not.toBeInTheDocument();
    await expect(canvas.queryByText("No fallback results are available")).not.toBeInTheDocument();
  },
};
export const FailedRecoverySearch: Story = {
  args: { places: [], failureMode: true, searchState: "unavailable", onRetrySearch: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Search is temporarily unavailable");
    await expect(canvas.queryByText("0 places available")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetrySearch).toHaveBeenCalledOnce();
  },
};

export const ReviewedLocalPhotosAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { failureMode: true, places: [
    { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", category: "park", subcategories: [], geom: { lat: 39.413, lng: -77.41 }, open_status: { state: "unknown" }, source: "manual", is_verified: true, municipality: "frederick", short_blurb: "" },
    { slug: "new-market-historic-district-new-market", name: "New Market Historic District", category: "antiques", subcategories: [], geom: { lat: 39.383, lng: -77.268 }, open_status: { state: "unknown" }, source: "manual", is_verified: true, municipality: "new-market", short_blurb: "" },
  ] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const photos = [...canvasElement.querySelectorAll<HTMLImageElement>("img")];
    await expect(photos).toHaveLength(2);
    await Promise.all(photos.map((image) => image.decode()));
    for (const image of photos) {
      await expect(image.naturalWidth).toBeGreaterThan(1);
      await expect(image.naturalHeight).toBeGreaterThan(1);
    }
    const source = await canvas.findByRole("link", { name: "Wikimedia Commons" });
    await expect(source).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:New_Market_HD_MD1.jpg");
    const license = canvas.getByRole("link", { name: "CC BY-SA 4.0" });
    await expect(license).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(canvas.getByText("Photo by Acroterion.")).toBeVisible();
    await expect(source.closest("button")).toBeNull();
    await expect(canvasElement.querySelector("button a")).toBeNull();
    const open = canvas.getByRole("button", { name: /New Market Historic District/ });
    open.scrollIntoView({ block: "center" });
    for (const target of [open, source, license]) {
      target.scrollIntoView({ block: "center" });
      const box = target.getBoundingClientRect();
      await expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(box.height).toBeGreaterThanOrEqual(44);
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      for (const [dx, dy] of [[0, 0], [-21, -21], [21, -21], [-21, 21], [21, 21]]) {
        await expect(target.contains(document.elementFromPoint(x + dx, y + dy))).toBe(true);
      }
    }
    await expect(metadataRequests).toHaveLength(0);
    await userEvent.click(open);
    await expect(args.onPick).toHaveBeenCalledWith(args.places[1]);
  },
};
export const FailedLocalPhotoKeepsRow: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { places: [{ slug: "new-market-historic-district-new-market", name: "New Market Historic District", category: "antiques", subcategories: [], geom: { lat: 39.383, lng: -77.268 }, open_status: { state: "unknown" }, source: "manual", is_verified: true, municipality: "new-market", short_blurb: "" }] },
  play: async ({ canvasElement, args }) => {
    // Explicit failure state, with no fake venue photograph or provider traffic.
    canvasElement.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull());
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    const open = within(canvasElement).getByRole("button", { name: /New Market Historic District/ });
    await expect(open).toHaveTextContent("Hours not confirmed");
    await userEvent.click(open);
    await expect(args.onPick).toHaveBeenCalledWith(args.places[0]);
    await expect(metadataRequests).toHaveLength(0);
  },
};

export const StableVisualFrameAcrossPhotoFailure: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { preserveOrder: true, places: [
    { slug: "mccurdy-field", name: "McCurdy Field", category: "park", subcategories: [], geom: { lat: 39.408, lng: -77.422 }, open_status: { state: "unknown" }, source: "manual", is_verified: true, municipality: "frederick", short_blurb: "" },
    { slug: "story-place", name: "Sample Frederick place", category: "coffee", subcategories: [], geom: { lat: 39.414, lng: -77.41 }, open_status: { state: "unknown" }, source: "manual", is_verified: true, municipality: "frederick", short_blurb: "" },
  ] },
  play: async ({ canvasElement, args }) => {
    // An owned photograph has no credit block to remove: any movement here
    // would come from shrinking the visual slot, rather than credit removal.
    await document.fonts.ready;
    const canvas = within(canvasElement);
    const first = canvas.getByRole("button", { name: /McCurdy Field/ });
    const second = canvas.getByRole("button", { name: /Sample Frederick place/ });
    const frame = first.querySelector<HTMLElement>(".map-list-place-visual")!;
    const emptyFrame = second.querySelector<HTMLElement>(".map-list-place-visual")!;
    const image = frame.querySelector("img")!;
    await image.decode();
    await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "ready"));
    const before = {
      frame: frame.getBoundingClientRect(), row: first.getBoundingClientRect(),
      nextRow: second.getBoundingClientRect(),
      text: first.querySelector(".map-list-main")!.getBoundingClientRect(),
    };
    await expect(before.frame.width).toBe(72);
    await expect(before.frame.height).toBe(72);
    await expect(emptyFrame.getBoundingClientRect().width).toBe(72);
    await expect(emptyFrame.getBoundingClientRect().height).toBe(72);
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "fallback"));
    await expect(frame.querySelector("img")).toBeNull();
    const after = {
      frame: frame.getBoundingClientRect(), row: first.getBoundingClientRect(),
      nextRow: second.getBoundingClientRect(),
      text: first.querySelector(".map-list-main")!.getBoundingClientRect(),
    };
    for (const key of ["frame", "row", "nextRow", "text"] as const) {
      for (const dimension of ["x", "y", "width", "height"] as const) {
        await expect(Math.abs(after[key][dimension] - before[key][dimension])).toBeLessThanOrEqual(0.5);
      }
    }
    await expect(first).toHaveTextContent("Hours not confirmed");
    await userEvent.click(first);
    await expect(args.onPick).toHaveBeenCalledWith(args.places[0]);
  },
};
