import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "./PlaceCard";

/** Owned photography served from public/, so the story never calls Google. */
const OWNED = "/images/seasons/fall/018.jpg";

const base = {
  municipality: "frederick",
  city: "Frederick",
  geom: { lng: -77.9, lat: 39.9 },
  tags: [],
  open_status: { state: "unknown" },
} as const;

/** A real slug with a color in place-hues.json, and no loaded photo. */
const barbecue = {
  ...base,
  slug: "black-hog-bbq-bar",
  name: "Black Hog BBQ Bar",
  category: "restaurant",
  primary_type: "barbecue_restaurant",
  address: "118 S Market St, Frederick, MD 21701",
  google_rating: 4.6,
  google_rating_count: 1728,
  price_band: 2,
  field_notes: true,
  distance_m: 68,
  open_status: { state: "open", closesAt: "22:00", closingSoon: false },
} as unknown as PlaceCardData;

const brewery = {
  ...base,
  slug: "attaboy-beer-frederick",
  name: "Attaboy Beer",
  category: "brewery",
  primary_type: "brewery",
  address: "400 Sagner Ave, Frederick, MD 21701",
  google_photo_url: OWNED,
  google_rating: 4.8,
  google_rating_count: 612,
  deal_hook: "$1 OFF",
  distance_m: 1450,
} as unknown as PlaceCardData;

const shop = {
  ...base,
  slug: "story-print-shop",
  name: "Market Street Print Shop",
  category: "shopping",
  primary_type: "store",
  address: "22 N Market St",
  local_favorite: true,
  google_rating: 4.9,
  google_rating_count: 85,
  distance_m: 300,
} as unknown as PlaceCardData;

const park = {
  ...base,
  slug: "baker-park-frederick",
  name: "Baker Park",
  category: "park",
  primary_type: "park",
  address: "121 N Bentz St, Frederick, MD 21701",
  tags: ["dog-friendly"],
  local_favorite: true,
} as unknown as PlaceCardData;

const meta = {
  title: "Places/Picture row",
  component: PlaceCard,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The one browse row. A 48px tile leads (the loaded photo, or the category mark on the place's own flat color), then the name, one fact line with the Google type and the street, and a signal line with status, the rating with its review count, price and at most one mark. Distance prints once, at the right. Rows are flat and separated by a 1px rule; the row opens the place sheet and Save is its own 44px target.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[min(36rem,calc(100vw-32px))]">
        <Story />
      </div>
    ),
  ],
  args: { place: barbecue },
} satisfies Meta<typeof PlaceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhotolessRow: Story = {};

export const LoadedPhotoWithDeal: Story = { args: { place: brewery } };

export const BrowseList: Story = {
  render: () => (
    <ul>
      {[barbecue, brewery, shop, park].map((place) => (
        <li key={place.slug}>
          <PlaceCard place={place} />
        </li>
      ))}
    </ul>
  ),
};

export const BrowseListAt320: Story = {
  ...BrowseList,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};

export const BrowseListAt430: Story = {
  ...BrowseList,
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
};

/**
 * Rows under a ResultsPinMap print their pin number before the tile. A row
 * with no pin keeps the empty number column (index null) so tiles align.
 */
export const NumberedRows: Story = {
  render: () => (
    <ul>
      <li>
        <PlaceCard place={barbecue} index={1} />
      </li>
      <li>
        <PlaceCard place={brewery} index={2} />
      </li>
      <li>
        <PlaceCard place={shop} index={null} />
      </li>
      <li>
        <PlaceCard place={park} index={3} />
      </li>
    </ul>
  ),
};

export const NumberedRowsAt320: Story = {
  ...NumberedRows,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};
