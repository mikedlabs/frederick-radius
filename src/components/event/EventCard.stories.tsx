import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventCardVisual } from "./eventVisuals";
import EventCard, { EventRow } from "./EventCard";

const sample = {
  slug: "story-concert", title: "Community concert at Memorial Park", description: "",
  starts_at: "2026-09-10T18:00:00-04:00", ends_at: "2026-09-10T20:00:00-04:00",
  timezone: "America/New_York", address: "Memorial Park, Thurmont, MD", venue_name: "Memorial Park", municipality: "thurmont",
  municipality_name: "Thurmont", category: "music", category_name: "Music",
  audience: [], is_free: true, source: "manual", is_verified: false,
  source_id: "story", source_url: null, license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  geom: { lng: -77.4, lat: 39.62 }, geo_confidence: "area",
} as EventWithMeta;

const ticketed = {
  ...sample,
  slug: "story-hot-sardines",
  title: "The Hot Sardines",
  starts_at: "2026-09-10T20:00:00-04:00",
  ends_at: "2026-09-10T20:00:00-04:00",
  venue_name: "Weinberg Center for the Arts",
  address: "20 W Patrick St, Frederick, MD",
  municipality: "frederick",
  municipality_name: "Frederick",
  is_free: false,
  ticket_url: "https://www.weinbergcenter.org/",
  geo_confidence: "venue_match",
} as EventWithMeta;

/**
 * A stand-in flyer from the repo's own brand posters. Production rows take a
 * flyer only from an approved publisher host (eventFlyerVisual); the story
 * passes one directly so it renders without the network.
 */
const fixtureFlyer: EventCardVisual = {
  src: "/brand/posters/ask-radius.png",
  caption: "Event image · Story fixture",
  key: "event:/brand/posters/ask-radius.png",
};

const meta = {
  title: "Events/Decision card", component: EventCard, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(42rem,calc(100vw-24px))]"><Story /></div>],
  args: { event: sample, variant: "feature", nowISO: "2026-09-10T12:00:00-04:00" },
} satisfies Meta<typeof EventCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoPhotography: Story = {};

/** The one event row with no flyer: plate, title, meta line, Free mark. */
export const RowFree: Story = { args: { variant: "glance" } };

/** A ticketed show with no listed end: no "end time not listed" in the row. */
export const RowTickets: Story = { args: { event: ticketed, variant: "compact" } };

/** Confirmed live: an Amber dot and "Now" take the time's place. */
export const RowLive: Story = {
  args: { variant: "glance", live: true, nowISO: "2026-09-10T19:00:00-04:00" },
};

/** A publisher flyer sits uncropped in a 56px frame on the right. */
export const RowFlyer: Story = {
  render: (args) => (
    <EventRow event={{ ...ticketed, title: "Game Night at Frederick Social" }} flyer={fixtureFlyer} now={args.nowISO ? new Date(args.nowISO) : null} />
  ),
};

/** Several rows read as one ruled list on paper. */
export const RowList: Story = {
  render: (args) => (
    <ol className="[&>li:last-child_article]:border-b-0">
      <li><EventCard event={sample} variant="compact" nowISO={args.nowISO} /></li>
      <li><EventRow event={{ ...ticketed, slug: "story-flyer", title: "Game Night at Frederick Social" }} flyer={fixtureFlyer} /></li>
      <li><EventCard event={ticketed} variant="compact" nowISO={args.nowISO} /></li>
    </ol>
  ),
};

export const CountyComparison: Story = { args: { variant: "compact" } };
/** A collapsed weekly series: one row carries the cadence read from its dates. */
export const CompactSeriesCadence: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    event: { ...sample, title: "Trivia Night", is_recurring: true, recurrence_text: "Every Wednesday" },
    variant: "compact",
  },
};
export const MissingEndAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { event: { ...sample, ends_at: sample.starts_at }, variant: "glance" },
};
export const Online: Story = { args: { event: { ...sample, attendance_mode: "online" }, variant: "glance" } };
export const LongVenueAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    event: { ...sample, venue_name: "Steinhardt Brewing Company Taproom and Beer Garden", geo_confidence: "venue_match" },
    variant: "glance",
  },
};
/** Today's earlier-today list names the day in its header, so no plate. */
export const RowWithoutDate: Story = { args: { variant: "utility", hideDate: true } };
