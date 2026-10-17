import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import TodayMasthead from "./TodayMasthead";
import TodayWeatherView, { WeatherUnavailable } from "./TodayWeatherView";

const read = {
  density: "masthead" as const,
  headline: "Mostly cloudy", condition: "Mostly cloudy", temperatureF: 70,
  highF: 75, sun: { label: "Sunset", time: "6:36 PM" }, variant: "Cloud" as const,
  forecastAvailable: true, issuedAt: "2026-10-12T14:53:00.000Z",
  safetyNote: "The air-quality reading is unavailable.",
  daylight: <span> · 4h 4m of daylight left</span>,
};
const meta = {
  title: "Today/Masthead",
  component: TodayMasthead,
  parameters: { layout: "centered", nextjs: { appDirectory: true } },
  decorators: [(Story) => <div data-app-primary-tab="/today" style={{ width: "min(343px, calc(100vw - 32px))" }}><Story /></div>],
  args: { title: "This afternoon in Frederick County", shortTitle: "This afternoon", dateline: "Friday, October 16", weather: <TodayWeatherView {...read} /> },
} satisfies Meta<typeof TodayMasthead>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PartialSafetyRead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { level: 1, name: "This afternoon in Frederick County" });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveTextContent(/^This afternoon$/);
    await expect(canvas.getByText(/Frederick County.*Friday, October 16/)).toBeVisible();
    await expect(canvas.getByText("The air-quality reading is unavailable.")).toBeVisible();
    const details = canvas.getByText("Forecast details", { exact: true });
    const forecast = canvas.getByRole("link", { name: /Full forecast.*Frederick/ });
    await expect(canvas.getByText("Oct 12, 2026, 10:53 AM EDT")).not.toBeVisible();
    // Native summary keyboard traversal is verified by Playwright in
    // today-weather-priority.spec.ts. Storybook's simulated Tab omits summary.
    await expect(details.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(details.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(details);
    await expect(canvas.getByText("Oct 12, 2026, 10:53 AM EDT")).toBeVisible();
    await expect(canvas.getByText("Oct 12, 2026, 10:53 AM EDT")).toHaveAttribute("datetime", "2026-10-12T14:53:00.000Z");
    await expect(forecast).toHaveAttribute("href", "/pulse?open=weather");
    await expect(forecast.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(forecast.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(details);
    await expect(canvas.getByText("Oct 12, 2026, 10:53 AM EDT")).not.toBeVisible();
    await expect(canvas.getByText("The air-quality reading is unavailable.")).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const ForecastUnavailable: Story = {
  args: { weather: <WeatherUnavailable density="masthead" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(canvas.getByText("The NWS forecast is briefly unavailable.")).toBeVisible();
    await expect(canvas.queryByText("70 degrees Fahrenheit forecast")).not.toBeInTheDocument();
  },
};

export const NarrowLongWarning: Story = {
  args: { weather: <TodayWeatherView {...read} headline="Flash Flood Warning is active." condition="Chance showers and thunderstorms" safetyNote="Weather-alert and air-quality checks are unavailable." /> },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Flash Flood Warning is active." })).toBeVisible();
    await expect(canvas.getByText("Weather-alert and air-quality checks are unavailable.")).toBeVisible();
    await expect(canvas.getByText("High 75°")).not.toBeVisible();
    await userEvent.click(canvas.getByText("Forecast details", { exact: true }));
    await expect(canvas.getByText("High 75°")).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const MissingIssuance: Story = {
  args: { weather: <TodayWeatherView {...read} issuedAt={null} safetyNote={null} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("70 degrees Fahrenheit forecast")).toBeVisible();
    await userEvent.click(canvas.getByText("Forecast details", { exact: true }));
    await expect(canvas.getByText("Issue time unavailable")).toBeVisible();
    await expect(canvasElement.querySelector("time")).toBeNull();
  },
};

export const ActiveWarningWithoutForecast: Story = {
  args: { weather: <TodayWeatherView {...read} headline="Flash Flood Warning is active." condition="" forecastAvailable={false} temperatureF={null} highF={null} sun={null} variant={null} issuedAt={null} safetyNote={null} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Flash Flood Warning is active." })).toBeVisible();
    await expect(canvas.getByText("The NWS forecast is briefly unavailable.")).toBeVisible();
    await expect(canvas.queryByText("Forecast details")).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Full forecast.*Frederick/ })).toHaveAttribute("href", "/pulse?open=weather");
  },
};
