import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import ResultsPinMap, { mappedPinNumbers, pinRowFor, type ResultsPinRow } from "./ResultsPinMap";

/** Downtown Frederick catalog points, in a ranked order. */
const DOWNTOWN: ResultsPinRow[] = [
  { slug: "black-hog-bbq-bar", name: "Black Hog BBQ Bar", lng: -77.4111035, lat: 39.4111452 },
  { slug: "brewers-alley-frederick", name: "Brewer's Alley", lng: -77.4104615, lat: 39.4160924 },
  // A row the catalog cannot place keeps no pin and no number.
  { slug: "no-point", name: "A listing with no map point" },
  { slug: "attaboy-beer-frederick", name: "Attaboy Beer", lng: -77.4027933, lat: 39.4119988 },
  { slug: "baker-park-frederick", name: "Baker Park", lng: -77.4162661, lat: 39.4159987 },
];

const meta = {
  title: "Maps/Results pin map",
  component: ResultsPinMap,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The numbered pin map that leads a ranked place list, shared with Ask. Only rows with a catalog point get a pin, numbered by their position among pinned rows, and each of those rows prints the same number before its tile. Pins are always Brick and never encode open state. With fewer than two pins the map renders nothing.",
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
  args: { rows: DOWNTOWN, name: "places whose recently checked hours say they are open" },
} satisfies Meta<typeof ResultsPinMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FourPins: Story = {};

export const FourPinsAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};

/** One pin is a place page's job, so the list gets no map and no numbers. */
export const OnePinDrawsNothing: Story = {
  args: { rows: DOWNTOWN.slice(0, 1) },
};

/**
 * A catalog place for the rows below. Catalog places always carry a point,
 * and PlaceCard's row reads it for its nearest-landmark line, so the fixture
 * requires one.
 */
type CatalogPoint = { slug: string; name: string; lng: number; lat: number };

const place = ({ slug, name, lng, lat }: CatalogPoint, overrides: Partial<PlaceCardData>) =>
  ({
    slug,
    name,
    municipality: "frederick",
    city: "Frederick",
    tags: [],
    open_status: { state: "unknown" },
    geom: { lng, lat },
    ...overrides,
  }) as unknown as PlaceCardData;

const PICKS: PlaceCardData[] = [
  place(
    { slug: "black-hog-bbq-bar", name: "Black Hog BBQ Bar", lng: -77.4111035, lat: 39.4111452 },
    {
      category: "restaurant",
      primary_type: "barbecue_restaurant",
      address: "118 S Market St, Frederick, MD 21701",
      google_rating: 4.6,
      google_rating_count: 1728,
    },
  ),
  place(
    { slug: "cacique-frederick", name: "Cacique Frederick", lng: -77.4106278, lat: 39.4146801 },
    {
      category: "restaurant",
      primary_type: "restaurant",
      address: "26 N Market St, Frederick, MD 21701",
    },
  ),
  place(
    { slug: "brewers-alley-frederick", name: "Brewer's Alley", lng: -77.4104615, lat: 39.4160924 },
    {
      category: "brewery",
      primary_type: "brewery",
      address: "124 N Market St, Frederick, MD 21701",
      google_rating: 4.4,
      google_rating_count: 3998,
    },
  ),
];

/**
 * The category "Start here" pattern: the map, then the numbered rows. The
 * middle pick's pin row carries no point, so it gets no pin and keeps an
 * empty number column, and the third pick becomes pin 2. The place itself
 * still has its catalog point, as every catalog place does.
 */
export const WithNumberedRows: Story = {
  args: {
    rows: [
      pinRowFor(PICKS[0]),
      { slug: PICKS[1].slug, name: PICKS[1].name },
      pinRowFor(PICKS[2]),
    ],
    name: "the places to start with",
  },
  render: (args) => {
    const numbers = mappedPinNumbers(args.rows);
    return (
      <div className="space-y-2.5">
        <ResultsPinMap {...args} />
        <ul>
          {PICKS.map((pick) => (
            <li key={pick.slug}>
              <PlaceCard
                place={pick}
                index={numbers.size > 0 ? (numbers.get(pick.slug) ?? null) : undefined}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  },
};
