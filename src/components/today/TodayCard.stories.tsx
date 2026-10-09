import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TodayWeatherView, { WeatherUnavailable } from "./TodayWeatherView";

const meta = {
  title: "Today/Weather reading",
  component: TodayWeatherView,
  parameters: { layout: "centered" },
  decorators: [(Story) => (
    <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]">
      <Story />
    </div>
  )],
  args: {
    headline: "It is clear and comfortable.",
    condition: "Mostly sunny",
    temperatureF: 72,
    highF: 76,
    sun: { label: "Sunset", time: "6:42 PM" },
    variant: "Sun",
    forecastAvailable: true,
    issuedAt: "2026-10-08T11:35:00.000Z",
    safetyNote: null,
    daylight: <span> · 5h 40m of daylight left</span>,
  },
} satisfies Meta<typeof TodayWeatherView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HealthyForecast: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mostly sunny")).toBeVisible();
    await expect(canvas.getByText("72 degrees Fahrenheit forecast")).toBeVisible();
    await expect(canvas.getByText("NWS forecast · Frederick")).toBeVisible();
    await expect(canvas.getByText("Oct 8, 2026, 7:35 AM EDT")).toHaveAttribute("datetime", "2026-10-08T11:35:00.000Z");
    await expect(canvas.getByText("High 76°")).toBeVisible();
    await expect(canvas.getByText("5h 40m of daylight left", { exact: false })).toBeVisible();
  },
};

export const PartialSafetyFeed: Story = {
  args: { headline: "Mostly sunny", safetyNote: "The weather-alert feed is unavailable." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Mostly sunny" })).toBeVisible();
    await expect(canvas.getByText("The weather-alert feed is unavailable.")).toBeVisible();
    await expect(canvas.queryByText("It is clear and comfortable.")).not.toBeInTheDocument();
  },
};

export const MissingIssueTime: Story = {
  args: { issuedAt: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Issue time unavailable")).toBeVisible();
    await expect(canvasElement.querySelector("time")).toBeNull();
  },
};

export const OlderIssuedForecast: Story = {
  args: { issuedAt: "2026-10-07T11:35:00.000Z" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Oct 7, 2026, 7:35 AM EDT")).toBeVisible();
  },
};

export const ForecastUnavailable: Story = {
  render: () => <WeatherUnavailable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Weather unavailable" })).toBeVisible();
    await expect(canvas.getByText("County status")).toBeVisible();
    await expect(canvas.queryByText("72 degrees Fahrenheit forecast")).not.toBeInTheDocument();
  },
};

export const ActiveWarningWithoutForecast: Story = {
  args: {
    headline: "Flash Flood Warning is active.", condition: "", temperatureF: null,
    highF: null, sun: null, variant: null, forecastAvailable: false, issuedAt: null,
    daylight: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Flash Flood Warning is active." })).toBeVisible();
    await expect(canvas.getByText("The NWS forecast is briefly unavailable.")).toBeVisible();
    await expect(canvas.queryByText("72 degrees Fahrenheit forecast")).not.toBeInTheDocument();
  },
};

export const UnhealthyAir: Story = {
  args: { headline: "The air is unhealthy right now." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "The air is unhealthy right now." })).toBeVisible();
    await expect(canvas.getByText("Mostly sunny")).toBeVisible();
  },
};

export const NarrowLongCondition: Story = {
  args: {
    headline: "Chance showers and thunderstorms",
    condition: "Chance showers and thunderstorms",
    temperatureF: 68, variant: "CloudLightning",
    safetyNote: "Weather-alert and air-quality checks are unavailable.",
  },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Chance showers and thunderstorms" })).toBeVisible();
    await expect(canvas.getByText("Weather-alert and air-quality checks are unavailable.")).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
