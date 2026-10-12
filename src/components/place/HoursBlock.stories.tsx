import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { Hours } from "@/data/places";
import { easternDayKey } from "@/lib/tz";
import HoursBlock from "./HoursBlock";

const now = new Date();
const today = easternDayKey(now);
const hours: Hours = {
  mon: [{ open: "10:00", close: "21:00" }], tue: [{ open: "10:00", close: "21:00" }],
  wed: [{ open: "10:00", close: "21:00" }], thu: [{ open: "10:00", close: "21:00" }],
  fri: [{ open: "10:00", close: "17:00" }], sat: [{ open: "10:00", close: "17:00" }], sun: [{ open: "13:00", close: "17:00" }],
  _official: { slug: "demonstration-library", source_url: "https://www.fcpl.org/branches-hours/c-burr-artz-public-library", closures_url: "https://www.fcpl.org/holiday-closings", observed_at: new Date(+now - 60_000).toISOString(), expires_at: new Date(+now + 6 * 86_400_000).toISOString(), coverage_from: today, coverage_through: easternDayKey(new Date(+now + 7 * 86_400_000)), exceptions: [{ date: today, closed: true, reason: "Demonstration closure" }] },
};
const meta = {
  title: "Places/Official hours", component: HoursBlock, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(24rem,calc(100vw-32px))]"><p className="mb-3 text-sm">Demonstration schedule. This is a component example, not current library status.</p><Story /></div>],
  args: { hours, verified: true, provenance: "Demonstration of hours from an official source." },
} satisfies Meta<typeof HoursBlock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DatedClosure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Hours today · Closed"));
    await expect(canvas.getByRole("link", { name: "Official branch hours" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "FCPL holiday closures" })).toBeVisible();
    await expect(canvas.getByText(/normal weekly hours/)).toBeVisible();
  },
};
