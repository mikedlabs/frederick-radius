import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import MapListPeek from "./MapListPeek";
import type { MapTaskList } from "./mapListTask";

const list: MapTaskList = {
  key: "component-fixture", title: "Coffee shops and bakeries · Whole county", scope: "county", unit: "place",
  note: "Hours for these places are not confirmed, so check before you go.", pending: false, unavailable: false,
  rows: Array.from({ length: 8 }, (_, index) => ({ kind: "place", place: {
    slug: `component-fixture-${index}`, name: `Sample coffee place ${index + 1}`, category: "coffee", subcategories: [],
    geom: { lng: -77.41, lat: 39.414 }, municipality: "frederick", source: "manual", is_verified: false,
    short_blurb: "Component review fixture, not a public listing.", open_status: { state: "unknown" },
  } })),
  empty: { title: "Nothing here matches this view.", copy: "Choose another view or reset the map." }, askQuery: null,
};

const meta = {
  title: "Map/Ranked choices",
  component: MapListPeek,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/map" className="w-[min(38rem,calc(100vw-24px))]"><Story /></div>],
  args: { list, userLoc: null, expanded: true, onExpandedChange: fn(), onPickPlace: fn(), onPickEvent: fn() },
  render: function Render(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return <MapListPeek {...args} expanded={expanded} onExpandedChange={setExpanded} />;
  },
} satisfies Meta<typeof MapListPeek>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RankedUnknownHours: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Hours not confirmed")).toHaveLength(5);
    await expect(canvas.queryByText(/from you/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Show 3 more places/ })).toBeVisible();
  },
};
export const SelectedRow: Story = { args: { selectedPlaceSlug: "component-fixture-0" } };
export const FailedSearchRetainsChoices: Story = { args: { list: { ...list, unavailable: true }, onRetrySearch: fn() } };
export const LocationNotShared: Story = { args: { list: { ...list, rows: [], locationRequired: true, note: "Radius has not determined where you are.", empty: { title: "Your location is needed for this search.", copy: "Share your location from the header, or name a town. Your search is kept here." } } } };
export const MixedCanonicalLinks: Story = { args: { list: { ...list, unit: "result", rows: [
  { kind: "event-link", result: { type: "event", id: "event:component-fixture", title: "Sample event listing", subtitle: "Component fixture venue · Oct 12", href: "/events/component-fixture", event: { starts_at: "2026-10-12T22:00:00Z", ends_at: "2026-10-13T00:00:00Z", venue_name: "Component fixture venue", municipality: "frederick", source_label: "Component fixture source" } } },
  list.rows[0],
] } } };
