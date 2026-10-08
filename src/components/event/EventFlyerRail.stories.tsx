import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventFlyerRail, { type FlyerRailItem } from "./EventFlyerRail";

/**
 * Story fixtures use the repo's own brand posters as stand-in flyers so the
 * rail renders without the network. In production every item comes from
 * flyerRailItems(), which admits only approved publisher flyers.
 */
function item(
  slug: string,
  title: string,
  startsAt: string,
  venue: string,
  src: string,
): FlyerRailItem {
  const start = Date.parse(startsAt);
  const event = {
    slug,
    title,
    description: "",
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York",
    venue_name: venue,
    address: "Frederick, MD",
    geom: { lng: -77.41, lat: 39.414 },
    municipality: "frederick",
    municipality_name: "Frederick",
    category: "music",
    category_name: "Music",
    audience: [],
    is_free: false,
    source: "dfp",
    source_id: slug,
    source_url: null,
    license: "Demonstration fixture",
    confidence: "curated",
    first_seen_at: "2026-10-01T12:00:00.000Z",
    is_verified: true,
    geo_confidence: "venue_match",
    last_verified_at: "2026-10-07T12:00:00.000Z",
  } as EventWithMeta;
  return {
    event,
    visual: {
      src,
      caption: "Event image · Story fixture",
      key: `event:${src}`,
    },
  };
}

/** In start order, as flyerRailItems() returns them. */
const FLYERS: FlyerRailItem[] = [
  item("story-game-night", "Game Night", "2026-10-08T16:00:00-04:00", "Frederick Social", "/brand/social/facebook-season-fall.png"),
  item("story-las-anez", "Las Áñez", "2026-10-08T19:30:00-04:00", "Weinberg Center for the Arts", "/brand/posters/ask-radius.png"),
  item("story-hot-sardines", "The Hot Sardines", "2026-10-09T20:00:00-04:00", "Weinberg Center for the Arts", "/brand/posters/product-today.png"),
  item("story-sedaris", "David Sedaris", "2026-10-10T20:00:00-04:00", "Weinberg Center for the Arts", "/brand/social/facebook-group-launch.png"),
  item("story-met-comedy", "Alexander the Pretty Good at MET Comedy Night", "2026-10-10T20:30:00-04:00", "Maryland Ensemble Theatre", "/images/color-frederick-cover.webp"),
];

const meta = {
  title: "Events/Flyer rail",
  component: EventFlyerRail,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { items: FLYERS.slice(0, 3), nowISO: "2026-10-07T21:21:00-04:00" },
} satisfies Meta<typeof EventFlyerRail>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three flyers: the smallest rail that renders. */
export const ThreeFlyers: Story = {};

/** Five flyers at 390px: cards scroll under the 16px gutter bleed. */
export const FiveFlyersAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { items: FLYERS },
};

/** Five flyers at 320px. */
export const FiveFlyersAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { items: FLYERS },
};

/** Two flyers are not a rail: nothing renders. */
export const TwoFlyersRenderNothing: Story = {
  args: { items: FLYERS.slice(0, 2) },
};
