import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import MapInViewPlacesDisclosure from "./MapInViewPlacesDisclosure";
import type { MapPinPlace } from "./types";

function market(
  slug: string,
  name: string,
  lng: number,
  open_status: MapPinPlace["open_status"],
  name_detail?: string,
): MapPinPlace {
  return {
    slug,
    name,
    category: "market",
    subcategories: [],
    geom: { lng, lat: 39.42 },
    open_status,
    source: "manual",
    is_verified: true,
    municipality: "frederick",
    short_blurb: "Component review fixture, not a public listing.",
    ...(name_detail ? { name_detail } : {}),
  };
}

// Same-named stores in one town print their street line where the town
// would be. These are the longest lines the published map carries today.
const places = [
  market("story-food-lion-yellow-springs", "Food Lion", -77.45, { state: "open", closesAt: "23:00", closingSoon: false }, "2060 Yellow Springs Rd"),
  market("story-food-lion-crestwood", "Food Lion", -77.4, { state: "open", closesAt: "23:00", closingSoon: false }, "6920 Crestwood Blvd"),
  market("story-weis-spring-ridge", "Weis Markets", -77.35, { state: "closing-soon", closesAt: "21:00" }, "6093 Spring Ridge Pkwy"),
  market("story-weis-thomas-johnson", "Weis Markets", -77.41, { state: "closed" }, "199 Thomas Johnson Dr"),
  market("story-market-town", "Sample corner market", -77.42, { state: "open", closesAt: "20:00", closingSoon: false }),
];

const meta = {
  title: "Map/Places in this view",
  component: MapInViewPlacesDisclosure,
  // Sized like the open map dock pane: 10px from each viewport edge, a 1px
  // border and 14px of padding.
  decorators: [(Story) => (
    <div data-app-primary-tab="/map" className="mx-[10px] box-border w-[calc(100vw-20px)] border border-transparent px-[14px] py-3">
      <Story />
    </div>
  )],
  args: { places, sortOrigin: { lat: 39.4143, lng: -77.4105 }, onPick: fn() },
} satisfies Meta<typeof MapInViewPlacesDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A 320px phone with street-qualified rows and distances showing. */
export const StreetLinesAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Places in this view"));
    const section = canvasElement.querySelector<HTMLElement>("[data-map-in-view-places]")!;
    const edge = section.getBoundingClientRect().right;
    const rows = [...section.querySelectorAll<HTMLElement>("[data-map-in-view-place]")];
    await expect(rows).toHaveLength(places.length);
    for (const row of rows) {
      // The row, and the distance at its end, stay inside the panel.
      await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(edge);
      const distance = row.querySelector<HTMLElement>(".font-mono");
      await expect(distance).not.toBeNull();
      await expect(distance!.getBoundingClientRect().right).toBeLessThanOrEqual(edge);
      // The meta line wraps instead of hiding the street or the open state.
      const metaLine = row.querySelector<HTMLElement>("[data-map-in-view-place-meta]")!;
      await expect(metaLine.scrollHeight).toBeLessThanOrEqual(metaLine.clientHeight + 1);
    }
    await expect(canvas.getByText(/6093 Spring Ridge Pkwy · Closing soon/)).toBeVisible();
    await expect(canvas.getByText(/Frederick City · Open now/)).toBeVisible();
  },
};
