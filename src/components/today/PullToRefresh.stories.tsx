import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";
import PullToRefresh from "./PullToRefresh";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Story-only sample query; native reduced motion always remains respected. */
function createMotionSample(initial: boolean) {
  let requested = initial;
  let nativeReduced = false;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const query = {
    get matches() { return requested || nativeReduced; },
    media: MOTION_QUERY,
    onchange: null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => { if (type === "change" && listener) listeners.add(listener); },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => { if (type === "change" && listener) listeners.delete(listener); },
    addListener: (listener: EventListener) => listeners.add(listener),
    removeListener: (listener: EventListener) => listeners.delete(listener),
    dispatchEvent: (event: Event) => {
      for (const listener of listeners) {
        if (typeof listener === "function") listener.call(query, event);
        else listener.handleEvent(event);
      }
      query.onchange?.call(query, event as MediaQueryListEvent);
      return !event.defaultPrevented;
    },
  } as unknown as MediaQueryList;
  const update = (kind: "requested" | "native", value: boolean) => {
    const previous = query.matches;
    if (kind === "requested") requested = value;
    else nativeReduced = value;
    if (previous !== query.matches) query.dispatchEvent(new MediaQueryListEvent("change", { matches: query.matches, media: MOTION_QUERY }));
  };
  return { query, update, dispose: () => { listeners.clear(); query.onchange = null; } };
}

function StoryMotionSample({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const [sample] = useState(() => createMotionSample(reduced));
  useLayoutEffect(() => {
    const original = window.matchMedia;
    const native = original.call(window, MOTION_QUERY);
    const onNativeChange = () => sample.update("native", native.matches);
    onNativeChange();
    native.addEventListener("change", onNativeChange);
    const fixture: typeof window.matchMedia = (query) => query === MOTION_QUERY ? sample.query : original.call(window, query);
    window.matchMedia = fixture;
    return () => {
      native.removeEventListener("change", onNativeChange);
      if (window.matchMedia === fixture) window.matchMedia = original;
      sample.dispose();
    };
  }, [sample]);
  useLayoutEffect(() => { sample.update("requested", reduced); }, [sample, reduced]);
  return <>{children}</>;
}

function RefreshWorkshop() {
  return <><PullToRefresh /><main className="space-y-4 p-4 pt-20"><h1 className="text-2xl font-semibold">Today refresh workshop</h1><p data-sample-pull-area>This sample gesture requests a route refresh. It cannot verify publisher freshness.</p></main></>;
}
function sampleGesture(target: HTMLElement, type: string, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientY: y }] }); target.dispatchEvent(event);
}
const meta = { title: "Radius UI/Today refresh feedback", component: RefreshWorkshop, tags: ["autodocs"], decorators: [(Story, context) => <StoryMotionSample reduced={context.globals.motion === "reduce"}><Story /></StoryMotionSample>], parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/today" } } } } satisfies Meta<typeof RefreshWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;
const requestOnly = async ({ canvasElement, globals }: { canvasElement: HTMLElement; globals?: Record<string, unknown> }) => {
  getRouter().refresh.mockClear();
  const target = canvasElement.querySelector("[data-sample-pull-area]") as HTMLElement;
  const reduced = window.matchMedia(MOTION_QUERY).matches;
  if (globals?.motion === "reduce") await expect(reduced).toBe(true);
  sampleGesture(target, "touchstart", 0); sampleGesture(target, "touchmove", 150);
  await waitFor(() => expect(canvasElement.querySelector("[data-pull-refresh-indicator]")).toHaveAttribute("aria-hidden", reduced ? "true" : "false"));
  sampleGesture(target, "touchend", 150);
  await expect(getRouter().refresh).toHaveBeenCalledTimes(1);
  await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Refresh requested. Source checks may still be pending.");
};
export const RequestAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: requestOnly };
export const RequestAt375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: requestOnly };
export const RequestAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: requestOnly };
export const ReducedMotionAt430: Story = { globals: { motion: "reduce", viewport: { value: "radiusMobileLarge", isRotated: false } }, play: requestOnly };
export const DesktopIdle: Story = { globals: { viewport: { value: "radiusDesktop", isRotated: false } }, play: async ({ canvasElement }) => { getRouter().refresh.mockClear(); await expect(within(canvasElement).getByRole("status")).toBeEmptyDOMElement(); await expect(getRouter().refresh).not.toHaveBeenCalled(); } };
