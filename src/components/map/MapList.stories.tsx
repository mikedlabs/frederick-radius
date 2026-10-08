import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import MapList from "./MapList";

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
    const previousFetch = window.fetch;
    const fixtureFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, window.location.origin).pathname === "/api/places/by-slugs") {
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
        <h2 className="text-[16px] font-semibold">Map view is not enabled right now</h2>
      </div>
      <Story />
    </div>
  )],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { name: "Map view is not enabled right now" });
    const row = canvas.getByRole("button", { name: /Sample Frederick place/ });
    const count = canvas.getByText("1 place available");
    await expect(Math.abs(heading.getBoundingClientRect().left - row.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
    await expect(Math.abs(count.getBoundingClientRect().left - row.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
  },
};
