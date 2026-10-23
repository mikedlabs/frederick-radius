import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import TransitDepartureBoard, { type TransitDeparture } from "./TransitDepartureBoard";

// Real route identity; declared arrivals, destination and bus positions. These
// stories prove presentation and physical controls, never current service.
const arrival: TransitDeparture = {
  key: "declared-fixture-trip", route: { id: "6154", short: "10", name: "10 Connector", color: "#D3E232" },
  prediction: { stopId: "162950", headsign: "Downtown Frederick", arrivalEpoch: 1792761000 }, minutes: 8, fresh: true,
  catchability: { kind: "likely", label: "Likely catchable" },
  focus: { vehicleId: "declared-bus", routeId: "6154", bus: { lng: -77.4094, lat: 39.4258 }, stop: { lng: -77.40899, lat: 39.42717 }, stopId: "162950", stopName: "10th Street at Motter Avenue" },
  busRef: { vehicleId: "declared-bus", tripId: "declared-fixture-trip", targetStop: { id: "162950", name: "10th Street at Motter Avenue", lat: 39.42717, lng: -77.40899 } },
};
const meta = {
  title: "Transit/Departure board", component: TransitDepartureBoard,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(480px, calc(100vw - 32px))" }}><Story /></div>],
  args: { arrivals: [arrival, { ...arrival, key: "declared-following", minutes: 17, prediction: { ...arrival.prediction, headsign: "Transfer Center" } }], status: "live", savedBusWatchIds: [], onTrack: () => undefined, onToggleSaved: () => undefined },
} satisfies Meta<typeof TransitDepartureBoard>;
export default meta;
type Story = StoryObj<typeof meta>;
async function physical(target: HTMLElement) {
  target.scrollIntoView({ block: "center", behavior: "instant" });
  const b = target.getBoundingClientRect();
  await expect(b.height).toBeGreaterThanOrEqual(44); await expect(b.width).toBeGreaterThanOrEqual(44);
  for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
    const hit = target.ownerDocument.elementFromPoint(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
    await expect(Boolean(hit && target.contains(hit))).toBe(true);
  }
}
async function check({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0]) {
  const canvas = within(canvasElement);
  await expect(canvasElement.querySelectorAll("[data-transit-primary-departure]")).toHaveLength(1);
  await expect(canvas.getByText("8 min")).toBeVisible();
  await expect(canvas.getByText("To Downtown Frederick")).toBeVisible();
  const primary = canvasElement.querySelector<HTMLElement>("[data-transit-primary-departure]")!;
  await expect(parseFloat(getComputedStyle(primary.querySelector("[data-transit-arrival-time]")!).fontSize)).toBeGreaterThanOrEqual(44);
  const options = canvas.getByText("Bus options");
  await physical(options.closest("summary")!);
  await expect(canvasElement.querySelector("details button")).not.toBeVisible();
  await userEvent.click(options);
  await expect(canvas.getByRole("button", { name: "Track 10 Connector to Transfer Center on the live map" })).toBeVisible();
  for (const button of canvas.getAllByRole("button")) await physical(button);
  for (const copy of canvasElement.querySelectorAll("p, [data-transit-arrival-time]")) {
    const r = copy.ownerDocument.createRange(); r.selectNodeContents(copy);
    for (const line of r.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(0);
      await expect(line.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
    }
  }
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
}
export const Mobile320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: check };
export const Mobile390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: check };
export const Mobile320EnlargedText: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async (context) => {
    const oldSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "32px";
    try { await check(context); }
    finally { document.documentElement.style.fontSize = oldSize; }
  },
};
export const Delayed: Story = { args: { status: "stale", arrivals: [{ ...arrival, fresh: false, focus: null, busRef: null, catchability: null }] }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText("Estimate delayed")).toBeVisible();
  await expect(canvas.queryByText("8 min")).toBeNull();
  await expect(canvas.queryAllByRole("button")).toHaveLength(0);
  await physical(canvas.getByRole("link", { name: "Check the official schedule" }));
} };
