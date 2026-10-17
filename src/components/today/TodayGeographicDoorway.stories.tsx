import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TodayGeographicDoorwayPending, TodayGeographicDoorwayView } from "./TodayGeographicDoorway";

const meta = {
  title: "Today/Geographic doorway",
  component: TodayGeographicDoorwayView,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(343px, calc(100vw - 32px))" }}><Story /></div>],
  args: { scope: "county" },
} satisfies Meta<typeof TodayGeographicDoorwayView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExactOwnedPlace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "View Carroll Creek Linear Park in Frederick" });
    await expect(link).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
    await expect(canvas.getByRole("img", { name: "Carroll Creek in Frederick." })).toBeVisible();
    await waitFor(async () => { await expect(link).toHaveAttribute("data-photo-state", "loaded"); }, { timeout: 5_000 });
    const photo = canvasElement.querySelector("figure")!.getBoundingClientRect();
    await expect(photo.width).toBeGreaterThan(photo.height);
    await expect(photo.height).toBeGreaterThanOrEqual(160);
    await expect(photo.height).toBeLessThanOrEqual(190);
    const caption = canvasElement.querySelector("[data-today-geographic-caption]")!.getBoundingClientRect();
    await expect(caption.bottom).toBeLessThanOrEqual(photo.bottom + 1);
    await expect(link).toHaveTextContent(/Carroll Creek.*Frederick.*View place/);
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(link.querySelectorAll("a, button")).toHaveLength(0);
  },
};

export const DifferentTown: Story = {
  args: { scope: "town:brunswick" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
  },
};

export const NearbyDecisionLeads: Story = {
  args: { scope: "nearme" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
  },
};

export const ScopePending: Story = {
  render: () => <TodayGeographicDoorwayPending />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-today-geographic-pending]")).toHaveAttribute("aria-hidden", "true");
  },
};

export const FailedImageKeepsPlaceAction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvas.getByRole("img", { name: "Carroll Creek in Frederick." });
    image.dispatchEvent(new Event("error"));
    const link = canvas.getByRole("link", { name: "View Carroll Creek Linear Park in Frederick" });
    await waitFor(async () => { await expect(canvas.queryByRole("img")).not.toBeInTheDocument(); });
    await expect(canvas.getByRole("heading", { name: "Carroll Creek" })).toBeVisible();
    await expect(link).toHaveAttribute("data-photo-state", "failed");
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
