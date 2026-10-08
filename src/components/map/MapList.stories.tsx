import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
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
