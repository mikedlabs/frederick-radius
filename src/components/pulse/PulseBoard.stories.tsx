import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import COUNTY_OUTLINE from "@/data/county-boundary.json";
import { overviewPath, projectOverview } from "@/components/map/countyOverview";
import { RADIUS_STORY_NOW } from "../../../.storybook/preview";
import PulseBoard, { type PulseHero, type PulseTile } from "./PulseBoard";

// Fixed, clearly labeled sample readings. These are workshop data, not feeds.
const weather: PulseTile = {
  key: "weather",
  label: "Weather",
  iconName: "CloudSun",
  sourceLabel: "NWS · weather.gov",
  countLabel: "Partly cloudy",
  accent: "var(--app-cool)",
  active: false,
  attention: false,
  reading: true,
  kind: "feature",
  feature: {
    temp: 72,
    condition: "Partly cloudy",
    hl: "High 76° · Low 58°",
  },
  body: (
    <p>
      This is sample weather information for component review. Check the official
      forecast before making a plan.
    </p>
  ),
};

const river: PulseTile = {
  key: "rivers",
  label: "Monocacy River",
  iconName: "Waves",
  sourceLabel: "USGS Water Services",
  countLabel: "At Jug Bridge",
  accent: "var(--app-cool)",
  active: false,
  attention: false,
  reading: true,
  kind: "gauge",
  gauge: { value: 2.4, unit: "ft", decimals: 1 },
  body: (
    <p>
      This is a sample river gauge height. It does not establish whether swimming
      or boating is safe.
    </p>
  ),
};

const power: PulseTile = {
  key: "power",
  label: "Power outages",
  iconName: "Zap",
  sourceLabel: "Potomac Edison",
  countLabel: "No major outage reported",
  accent: "var(--app-cool)",
  active: false,
  attention: false,
  kind: "status",
  body: <p>This is a sample source check for component review.</p>,
};

const hero: PulseHero = {
  allClear: true,
  tone: "positive",
  line: "No major disruption is reported.",
  sub: "The weather and river readings are available. Open a condition for its source and details.",
  renderedAt: RADIUS_STORY_NOW.getTime(),
};

const meta = {
  title: "Radius UI/PulseBoard",
  component: PulseBoard,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component:
          "The county briefing groups active situations and measured conditions. Fixed sample data is labeled; freshness deliberately ages normally and must not be mistaken for a live claim.",
      },
    },
  },
  args: { hero, chips: [], tiles: [weather, river, power] },
  decorators: [
    (Story) => (
      <main className="mx-auto max-w-6xl space-y-6 p-4">
        <p className="text-meta" style={{ color: "var(--app-ink-3)" }}>
          This is a component preview with fixed sample readings. It does not show
          current county conditions.
        </p>
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof PulseBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentReadings: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};

export const UrgentSituation: Story = {
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  args: {
    hero: {
      ...hero,
      allClear: false,
      tone: "danger",
      leadKey: "alerts",
      line: "A flood warning is in effect for the Monocacy River.",
      sub: "Avoid flooded roads. Open the official warning for affected areas and instructions.",
      leadMeta: "Sample warning · Through 8pm",
      actionLabel: "Read the warning",
      status: { word: "Urgent", tone: "alert", count: 1 },
    },
    tiles: [
      {
        key: "alerts",
        label: "Official alerts",
        iconName: "AlertTriangle",
        sourceLabel: "NWS · weather.gov",
        countLabel: "Flood warning",
        accent: "var(--app-danger)",
        active: true,
        attention: true,
        kind: "status",
        body: <p>This warning is a component sample, not a current alert.</p>,
      },
      weather,
      river,
      power,
    ],
  },
};

/** A high-severity CHART crash reads "Advisory" in amber, the same grade the
 * header dot shows for it through selectCountyStatus. */
export const RoadAdvisory: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: {
    hero: {
      ...hero,
      allClear: false,
      tone: "warning",
      leadKey: "traffic",
      line: "US 15 North has a reported crash.",
      sub: "A crash is blocking lanes. Check the location before choosing your route.",
      leadMeta: "US 15 north at MD 26 · Sample incident",
      actionLabel: "Check the road impact",
      status: { word: "Advisory", tone: "caution", count: 1 },
    },
    tiles: [
      {
        key: "traffic",
        label: "Traffic",
        iconName: "Construction",
        sourceLabel: "MDOT CHART + Maryland WZDx",
        countLabel: "1 incident",
        accent: "var(--app-warning)",
        active: true,
        attention: true,
        kind: "status",
        body: <p>This crash is a component sample, not a current incident.</p>,
      },
      weather,
      river,
      power,
    ],
  },
};

/** The Oct 2026 status map: the masthead names the worst item, and the map
 * under the card puts a numbered point where the source located it. The
 * basemap is held in its Save-Data state so the drawn layer reviews alone. */
export const RoadAdvisoryWithMap: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "connection");
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    return () => {
      if (original) Object.defineProperty(navigator, "connection", original);
      else Reflect.deleteProperty(navigator, "connection");
    };
  },
  args: {
    hero: {
      ...hero,
      allClear: false,
      tone: "warning",
      leadKey: "traffic",
      line: "Advisory: MD 75 work-zone closure.",
      leadMeta: "Maryland WZDx · Sample time",
      sub: "All lanes are closed in this sample. Check the road details before choosing a route.",
      actionLabel: "Check the road details",
      status: { word: "Advisory", tone: "caution", count: 2 },
    },
    statusMap: {
      outline: overviewPath(COUNTY_OUTLINE),
      word: "Advisory",
      roadFeedsComplete: true,
      items: [
        {
          id: "sample-closure",
          title: "MD 75 work-zone closure",
          severity: "advisory",
          tileKey: "traffic",
          meta: "Maryland WZDx · Sample time",
          point: projectOverview(-77.3, 39.48),
        },
        {
          id: "sample-heat",
          title: "Heat Advisory",
          severity: "advisory",
          meta: "National Weather Service · Sample time",
        },
      ],
    },
    tiles: [
      {
        key: "traffic",
        label: "Traffic",
        iconName: "Construction",
        sourceLabel: "MDOT CHART + Maryland WZDx",
        countLabel: "1 closure",
        accent: "var(--app-warning)",
        active: true,
        attention: true,
        kind: "status",
        body: <p>This closure is a component sample, not a current report.</p>,
      },
      weather,
      river,
      power,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "Advisory: MD 75 work-zone closure." })).toBeVisible();
    const section = canvasElement.querySelector<HTMLElement>("[data-pulse-status-map]");
    await expect(section).not.toBeNull();
    await expect(within(section!).getByRole("heading", { name: "Countywide" })).toBeVisible();
    await expect(within(section!).getByText("Tap the point to find its report.")).toBeVisible();
  },
};

export const PartialSources: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    hero: {
      ...hero,
      allClear: false,
      degraded: true,
      tone: "warning",
      line: "Some county checks are unavailable.",
      sub: "The weather source did not return a complete reading. Source details remain available below.",
    },
    tiles: [
      {
        ...weather,
        reading: false,
        feature: undefined,
        kind: "status",
        degraded: true,
        availability: "unavailable",
        countLabel: "Weather feed unavailable",
      },
      river,
      power,
    ],
  },
};

export const ActiveAndCurrent: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  args: {
    hero: {
      ...hero,
      allClear: false,
      operational: true,
      tone: "cool",
      line: "Roadwork may affect a county trip.",
      sub: "Read the affected route before leaving. Current weather and river readings appear below.",
    },
    tiles: [
      {
        key: "roadwork",
        label: "Roadwork",
        iconName: "Construction",
        sourceLabel: "Maryland WZDx",
        countLabel: "1 project",
        peek: "A lane closure is reported on a county route.",
        accent: "var(--app-cool)",
        active: true,
        attention: false,
        kind: "status",
        body: <p>This is a sample project for component review.</p>,
      },
      weather,
      river,
      {
        ...river,
        key: "air",
        label: "Air quality",
        iconName: "Wind",
        sourceLabel: "AirNow · EPA",
        countLabel: "Good",
        gauge: { value: 28, unit: "AQI" },
        body: (
          <p>
            This is a sample air quality index reading for component review. Check
            AirNow for the latest local reading.
          </p>
        ),
      },
      power,
    ],
  },
};

export const ReducedMotion: Story = {
  globals: {
    viewport: { value: "radiusMobileLarge", isRotated: false },
    motion: "reduce",
  },
};
