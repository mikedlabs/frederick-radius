import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { MunicipalCivic } from "@/lib/loaders/municipalCivic";
import { RADIUS_STORY_NOW } from "../../../.storybook/preview";
import CivicCard from "./CivicCard";

const townHall = { label: "Town Hall", phone: "301-898-3800", address: "605 S. Main Street, Woodsboro, MD 21798", hours: "Monday-Friday 8AM-4PM" };
const rec: MunicipalCivic = {
  slug: "woodsboro", name: "Woodsboro",
  townHall,
  source: { url: "https://woodsboro.org/", fetchedAt: "2026-08-20T15:00:00.000Z" },
};
const meta = {
  title: "Municipality/Office hours",
  component: CivicCard,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(36rem,calc(100vw-32px))]"><Story /></div>],
  args: { rec, now: RADIUS_STORY_NOW },
} satisfies Meta<typeof CivicCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RecentlyCheckedHours: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Monday-Friday 8AM-4PM")).toBeVisible();
    await expect(canvas.getByText("Source checked Aug 20, 2026")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "301-898-3800" })).toHaveAttribute("href", "tel:3018983800");
  },
};
export const PreviouslyPostedHours: Story = {
  args: { rec: { ...rec, source: { ...rec.source, fetchedAt: "2026-08-01T15:00:00.000Z" } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/The town previously posted/)).toHaveTextContent("last checked Aug 1, 2026. Confirm with the town before visiting.");
  },
};
export const MeetingTimesAreNotOfficeHours: Story = {
  args: { rec: { ...rec, townHall: { ...townHall, hours: "Council meetings are held on the second Tuesday at 7:00 pm." }, extras: [{ label: "Council & planning meetings", website: "https://woodsboro.org/" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Office hours are unconfirmed. Confirm with the town before visiting.")).toBeVisible();
    await expect(canvas.queryByText(/second Tuesday/)).not.toBeInTheDocument();
    await expect(canvas.getByText("Council & planning meetings")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://woodsboro.org/");
  },
};
export const CheckDateUnavailable: Story = {
  args: { rec: { ...rec, source: { ...rec.source, fetchedAt: "" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("Monday-Friday 8AM-4PM")).not.toBeInTheDocument();
    await expect(canvas.getByText("Source check date is unavailable")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "301-898-3800" })).toHaveAttribute("href", "tel:3018983800");
  },
};
