import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import ParkingCostComparison from "./ParkingCostComparison";

const meta = {
  title: "Parking/Compare a downtown visit",
  component: ParkingCostComparison,
  args: { today: "2026-11-25" },
  parameters: { a11y: { test: "error" }, layout: "padded" },
} satisfies Meta<typeof ParkingCostComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThanksgivingWeek: Story = {
  play: async ({ canvasElement }) => {
    const app = within(canvasElement);
    await userEvent.click(app.getByRole("button", { name: "3 hours" }));
    await expect(app.getByText("$7")).toBeVisible();
    await expect(app.getByText("$4")).toBeVisible();
    await expect(app.getByText("$3")).toBeVisible();
    await userEvent.selectOptions(app.getByLabelText("Date"), "2026-11-26");
    await expect(app.getAllByText("Free")).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('[data-state="free"]')).toHaveLength(3);
  },
};

export const ChristmasAndNewYear: Story = {
  args: { today: "2026-12-23" },
  play: async ({ canvasElement }) => {
    const app = within(canvasElement);
    const day = app.getByLabelText("Date");
    for (const holiday of ["2026-12-25", "2027-01-01"]) {
      await userEvent.selectOptions(day, holiday);
      await expect(app.getAllByText("Free")).toHaveLength(2);
      await expect(app.getByRole("link", { name: "Check City rate for All five City garages" })).toHaveAttribute("href", "https://www.cityoffrederickmd.gov/1342/Garage-Parking");
      await expect(canvasElement.querySelectorAll('[data-state="unknown"]')).toHaveLength(1);
    }
    await userEvent.selectOptions(day, "2027-01-02");
    await expect(app.getByText("$4.50")).toBeVisible();
  },
};
