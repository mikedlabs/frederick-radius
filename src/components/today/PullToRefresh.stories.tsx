import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, within } from "storybook/test";
import PullToRefresh from "./PullToRefresh";

function RefreshWorkshop() {
  return <><PullToRefresh /><main className="space-y-4 p-4 pt-20"><h1 className="text-2xl font-semibold">Today refresh workshop</h1><p data-sample-pull-area>This sample gesture requests a route refresh. It cannot verify publisher freshness.</p></main></>;
}
function sampleGesture(target: HTMLElement, type: string, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientY: y }] }); target.dispatchEvent(event);
}
const meta = { title: "Radius UI/Today refresh feedback", component: RefreshWorkshop, tags: ["autodocs"], parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/today" } } } } satisfies Meta<typeof RefreshWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;
const requestOnly = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  getRouter().refresh.mockClear();
  const target = canvasElement.querySelector("[data-sample-pull-area]") as HTMLElement;
  sampleGesture(target, "touchstart", 0); sampleGesture(target, "touchmove", 150); sampleGesture(target, "touchend", 150);
  await expect(getRouter().refresh).toHaveBeenCalledTimes(1);
  await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Refresh requested. Source checks may still be pending.");
};
export const RequestAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: requestOnly };
export const RequestAt375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: requestOnly };
export const RequestAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: requestOnly };
export const ReducedMotionAt430: Story = { globals: { motion: "reduce", viewport: { value: "radiusMobileLarge", isRotated: false } }, play: requestOnly };
export const DesktopIdle: Story = { globals: { viewport: { value: "radiusDesktop", isRotated: false } }, play: async ({ canvasElement }) => { getRouter().refresh.mockClear(); await expect(within(canvasElement).getByRole("status")).toBeEmptyDOMElement(); await expect(getRouter().refresh).not.toHaveBeenCalled(); } };
