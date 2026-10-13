import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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


/** Component layout fixtures use public town coordinates, not live venue or
 * hours claims. Directions remains the real native link, never a router mock. */
const narrowList: MapTaskList = {
  ...list,
  key: "narrow-directions-fixture",
  title: "Coffee · Brunswick",
  scope: "town:brunswick",
  rows: list.rows.map((row, index) => row.kind === "place" ? {
    ...row,
    place: {
      ...row.place,
      name: index === 0 ? "Sample coffee place near Brunswick station" : row.place.name,
      municipality: "brunswick",
      geom: { lat: 39.3135, lng: -77.6261 },
    },
  } : row),
};

export const DirectDirectionsAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { list: narrowList },
  parameters: {
    a11y: { test: "error" },
    docs: { description: { story: "Component fixtures at 320px. The native Directions link and open-details button have separate physical targets. No venue photo, current hours, or external map is loaded by this story." } },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const name = "Sample coffee place near Brunswick station";
    const details = canvas.getByRole("button", { name: new RegExp(name) });
    const directions = canvas.getByRole("link", { name: `Directions to ${name}` });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveTextContent("Directions");
    await expect(details).toHaveTextContent("Brunswick");
    await expect(details).toHaveTextContent("Hours not confirmed");
    await expect(canvas.queryByText(/from you/)).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("button a, a button")).toBeNull();
    const href = new URL(directions.getAttribute("href")!);
    await expect([
      "https://www.google.com/maps/dir/?api=1&destination=39.3135,-77.6261",
      "https://maps.apple.com/?daddr=39.3135,-77.6261",
    ]).toContain(href.href);
    await canvasElement.ownerDocument.fonts.ready;
    const title = details.querySelector<HTMLElement>("[data-map-list-place-name]")!;
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await expect(title.textContent).toBe(name);
    const label = directions.querySelector<HTMLElement>("span")!;
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    const detailsBox = details.getBoundingClientRect();
    const directionsBox = directions.getBoundingClientRect();
    await expect(detailsBox.width).toBeGreaterThanOrEqual(44);
    await expect(detailsBox.height).toBeGreaterThanOrEqual(44);
    await expect(directionsBox.width).toBeGreaterThanOrEqual(44);
    await expect(directionsBox.height).toBeGreaterThanOrEqual(44);
    await expect(detailsBox.right).toBeLessThanOrEqual(directionsBox.left);
    await expect(directionsBox.right).toBeLessThanOrEqual(canvasElement.ownerDocument.defaultView!.innerWidth);
    const owner = canvasElement.ownerDocument;
    for (const target of [details, directions]) {
      const box = target.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
        const hit = owner.elementFromPoint(x + dx, y + dy);
        await expect(hit !== null && target.contains(hit)).toBe(true);
      }
    }
    await userEvent.click(details);
    const first = narrowList.rows[0];
    if (first.kind !== "place") throw new Error("The first fixture must be a place.");
    await expect(args.onPickPlace).toHaveBeenCalledTimes(1);
    await expect(args.onPickPlace).toHaveBeenCalledWith(first.place);
    details.focus();
    await userEvent.tab();
    await expect(directions).toHaveFocus();
  },
};

export const DirectDirectionsInMapFallback: Story = {
  ...DirectDirectionsAt320,
  args: { list: { ...narrowList, unavailable: true }, collapsible: false, onRetrySearch: fn() },
  parameters: {
    ...DirectDirectionsAt320.parameters,
    docs: { description: { story: "The same 320px shortlist in the map-unavailable presentation, retaining its partial-search and unknown-hours qualifications. These are component fixtures, not live status evidence." } },
  },
};
