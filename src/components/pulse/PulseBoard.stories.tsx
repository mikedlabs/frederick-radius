import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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


function sharedStatusStory(level: "Urgent" | "Advisory" | "Clear" | "Unknown", count: number, ok: boolean): Story {
  return {
    globals: { viewport: { value: "radiusMobile", isRotated: false } },
    render: (args) => <PulseBoard {...args} hero={{ ...args.hero, countyStatus: {
      level, count, ok, active: count > 0,
      tone: level === "Urgent" ? "alert" : level === "Advisory" ? "caution" : "quiet",
      lastUpdated: new Date().toISOString(),
    } }} />,
    play: async ({ canvasElement }) => {
      const label = level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unable to verify" : level;
      await expect(within(canvasElement).getByText(label, { exact: true })).toBeVisible();
    },
  };
}
export const SharedAdvisoryWithPartialCoverage = sharedStatusStory("Advisory", 3, false);
export const SharedClearInCheckedFeeds = sharedStatusStory("Clear", 0, true);
export const SharedUnverifiedWithIncompleteChecks = sharedStatusStory("Unknown", 0, false);

export const EarlierRoadChecks: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: (args) => <PulseBoard {...args} hero={{ ...args.hero, allClear: false,
    leadKey: "traffic", leadIsEarlier: true, line: "A snow emergency declaration was reported.",
    sub: "Open the source details before relying on its guidance.",
    countyStatus: { active: false, count: 0, tone: "quiet", ok: false, level: "Unknown", lastUpdated: new Date().toISOString(),
      checks: [
        { source: "MDOT snow emergency", state: "stale", asOf: "2026-10-08T13:00:00.000Z", asOfBasis: "retrieval" },
        { source: "NWS", state: "current", asOf: "2026-10-09T11:30:00.000Z", asOfBasis: "provider" },
        { source: "AirNow", state: "unavailable", asOf: null, asOfBasis: null },
      ], roadCheck: { verified: false, currentCount: 0, checkedAt: "2026-10-08T13:00:00.000Z", earlierCount: 2, unverifiedSources: ["MDOT snow emergency"] },
    },
  }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Unable to verify", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Earlier road checks listed 2 updates. Current road conditions are unverified.")).toBeVisible();
    const disclosure = canvas.getByText("Source checks", { exact: true });
    await expect(disclosure).toBeVisible();
    await userEvent.click(disclosure);
    const sourceRow = canvas.getByText("MDOT snow emergency", { selector: "dt", exact: true }).parentElement!;
    const sourceTime = within(sourceRow).getByText("Oct 8, 2026, 9:00 AM EDT", { selector: "time", exact: true });
    await expect(sourceTime).toBeVisible();
    await expect(sourceTime).toHaveAttribute("datetime", "2026-10-08T13:00:00.000Z");
    await expect(sourceTime.closest("dd")).toHaveTextContent("Earlier source data · Last source check Oct 8, 2026, 9:00 AM EDT");
    await expect(canvas.getByText(/Source time unavailable/)).toBeVisible();
  },
};

export const CurrentRoadLeadWithPartialChecks: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: (args) => <PulseBoard {...args} hero={{ ...args.hero, allClear: false,
    leadKey: "traffic", leadIsEarlier: false,
    line: "MDOT reports a closure on a county route.",
    sub: "Read the official route guidance before leaving.",
    countyStatus: { active: true, count: 1, tone: "caution", ok: false, level: "Advisory", lastUpdated: new Date().toISOString(),
      roadCheck: { verified: false, currentCount: 1, checkedAt: null, earlierCount: 1, unverifiedSources: ["MDOT snow emergency"] },
    },
  }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "MDOT reports a closure on a county route." })).toBeVisible();
    await expect(canvas.getByText("Advisory", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Earlier road checks listed 1 update. Some road sources remain unverified.")).toBeVisible();
    await expect(canvas.queryByText(/Earlier MDOT report:/)).toBeNull();
  },
};
