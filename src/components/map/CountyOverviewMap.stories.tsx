import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import COUNTY_OUTLINE from "@/data/county-boundary.json";
import { MUNICIPALITIES } from "@/data/municipalities";
import CountyOverviewMap, { type CountyOverviewPoint } from "./CountyOverviewMap";
import { overviewPath, projectOverview } from "./countyOverview";

const OUTLINE = overviewPath(COUNTY_OUTLINE);

// Workshop points at fixed county positions. They are sample reports for
// reviewing tones and numbering, not current incidents.
const STATUS_POINTS: CountyOverviewPoint[] = [
  { id: "sample-crash", ...projectOverview(-77.4105, 39.4143), label: null, tone: "urgent", badge: "1" },
  { id: "sample-closure", ...projectOverview(-77.64, 39.31), label: null, tone: "caution", badge: "2" },
  { id: "sample-train", ...projectOverview(-77.38, 39.42), label: null, tone: "transit", badge: "3" },
];

const TOWN_POINTS: CountyOverviewPoint[] = [...MUNICIPALITIES]
  .sort((a, b) => b.population - a.population)
  .map((town) => ({
    id: town.slug,
    ...projectOverview(town.centroid.lng, town.centroid.lat),
    label: town.name,
    href: `/m/${town.slug}`,
  }));

/**
 * The basemap is a MapLibre canvas over self-hosted tiles. The workshop holds
 * the map in its Save-Data state, the outline and points on Cream, so every
 * run shows the same picture and the drawn layer can be reviewed on its own.
 */
function holdDrawnLayer() {
  const original = Object.getOwnPropertyDescriptor(navigator, "connection");
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: { saveData: true },
  });
  return () => {
    if (original) Object.defineProperty(navigator, "connection", original);
    else Reflect.deleteProperty(navigator, "connection");
  };
}

const meta = {
  title: "Radius Chrome/County overview map",
  component: CountyOverviewMap,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Frederick County in one still picture. Towns and parks use the square map. The County status map uses the wide strip, with each report's point colored by its grade: Urgent in danger red, a caution in Amber with an Ink ring, transit in Creek.",
      },
    },
  },
  beforeEach: holdDrawnLayer,
  args: {
    label: "Map of Frederick County with 3 mapped sample reports",
    outline: OUTLINE,
    points: STATUS_POINTS,
    aspect: "wide",
    caption: "Tap a numbered point to find its report.",
    onPointSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[430px] space-y-3">
        <p className="text-meta" style={{ color: "var(--app-ink-3)" }}>
          This is a component preview with sample reports. It does not show current
          county conditions.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CountyOverviewMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatusTonesAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Map of Frederick County with 3 mapped sample reports" }),
    ).toBeVisible();
    const strip = canvasElement.querySelector<HTMLElement>('[data-overview-aspect="wide"]');
    await expect(strip?.getBoundingClientRect().height).toBe(220);
    for (const tone of ["urgent", "caution", "transit"]) {
      await expect(canvasElement.querySelector(`[data-overview-tone="${tone}"]`)).not.toBeNull();
    }
    // The visible disc is the tap target; the click reaches its point button.
    const closure = canvasElement.querySelector<HTMLElement>(
      '[data-overview-point="sample-closure"] [data-overview-tone]',
    );
    await userEvent.click(closure!);
    await expect(args.onPointSelect).toHaveBeenCalledWith("sample-closure");
  },
};

export const StatusTonesAt320: Story = {
  ...StatusTonesAt390,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};

export const NothingMapped: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: {
    label: "Map of Frederick County with no mapped reports",
    points: [],
    caption: "No incidents are mapped in the county right now.",
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll("[data-overview-point]")).toHaveLength(0);
    await expect(within(canvasElement).getByText("No incidents are mapped in the county right now.")).toBeVisible();
  },
};

/** The towns map, unchanged by point tones: one Brick dot per town. */
export const TownsSquare: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: {
    label: "Map of Frederick County showing its 13 towns",
    points: TOWN_POINTS,
    aspect: "square",
    tone: "town",
    caption: "Tap a town to see its places and events.",
    onPointSelect: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-overview-aspect]")).toBeNull();
    await expect(canvasElement.querySelector("[data-overview-tone]")).toBeNull();
    await expect(canvasElement.querySelectorAll("a[data-overview-point]")).toHaveLength(13);
  },
};
