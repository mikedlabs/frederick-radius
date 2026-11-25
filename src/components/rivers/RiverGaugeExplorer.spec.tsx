// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaterSite } from "@/lib/integrations/usgsWater";
import { gaugePlot } from "@/lib/rivers/gaugeHistory";
import RiverGaugeExplorer from "./RiverGaugeExplorer";

const end = "2026-11-24T17:00:00.000Z";
const observations = [5, 4.75, 2, 0.25].map((hours, index) => ({ value: 2 + index, at: new Date(Date.parse(end) - hours * 3_600_000).toISOString() }));
const sites: WaterSite[] = [
  { id: "01643000", name: "MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD", river: "Monocacy River", municipality: "frederick",
    lat: 39.4, lng: -77.36, gageHistory: observations, streamflowHistory: observations, observedAt: observations.at(-1)?.at },
  { id: "01643580", name: "MONOCACY RIVER NEAR DICKERSON, MD", river: "Monocacy River", municipality: "frederick",
    lat: 39.3, lng: -77.44, streamflowHistory: observations },
];
async function mount(readingSites: WaterSite[] = sites) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<RiverGaugeExplorer sites={readingSites} end={end} />));
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)!;
  return { container, root, button };
}
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("the USGS hydrograph", () => {
  it("plots the actual window and separates long gaps, including an isolated observation", () => {
    const plot = gaugePlot(observations, "PT6H", end)!;
    expect(plot.segments.map((s) => s.length)).toEqual([2, 1, 1]);
    expect(plot.points[0].x).toBeCloseTo(1000 / 6);
    expect(plot.high).toBe(5);
    expect(gaugePlot([{ value: 0, at: observations[0].at }], "PT6H", end)?.points[0].y).toBe(50);
    expect(gaugePlot([{ value: 4, at: "2020-01-01" }], "PT6H", end)).toBeNull();
  });
  it("preserves the last reading's timestamp and units, and exposes NWS thresholds only on supported gauges", async () => {
    const { container, root } = await mount();
    expect(container.querySelector("time")?.dateTime).toBe(observations.at(-1)?.at);
    expect(container.querySelector("input")?.getAttribute("aria-valuetext")).toContain("feet");
    expect(container.querySelector('a[href*="water.noaa.gov"]')?.textContent).toContain("Jug Bridge");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "01643580"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector("input")?.getAttribute("aria-valuetext")).toContain("cubic feet per second");
    expect(container.querySelector('a[href*="water.noaa.gov"]')).toBeNull();
    expect(container.querySelector('a[href*="USGS-01643580"]')?.textContent).toContain("Dickerson");
    await act(async () => root.unmount());
  });
  it("can request a named station independently after the county-wide reading fails", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ end, height: observations, flow: [] }));
    vi.stubGlobal("fetch", fetch);
    const { container, root, button } = await mount([]);
    expect(container.querySelector("svg[role=img]")).toBeNull();
    expect(container.querySelector("time")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => button("Check this gauge’s history").click());
    expect(fetch.mock.calls[0][0]).toContain("gauge=01643000&period=PT6H");
    expect(container.querySelector("svg[role=img]")).not.toBeNull();
    expect(container.querySelector("time")?.dateTime).toBe(observations.at(-1)?.at);
    await act(async () => root.unmount());
  });
  it("discards a late range response, distinguishes unavailable history and retries a failed request", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ end, height: [], flow: [] }));
    vi.stubGlobal("fetch", fetch);
    const { container, root, button } = await mount();
    await act(async () => button("7 days").click());
    expect(fetch.mock.calls[0][0]).toContain("gauge=01643000&period=P7D");
    await act(async () => button("24 hours").click());
    expect(container.textContent).toContain("could not be loaded");
    await act(async () => finish(Response.json({ end, height: observations, flow: [] })));
    expect(container.querySelector("svg[role=img]")).toBeNull();
    await act(async () => button("Try again").click());
    expect(container.textContent).toContain("no gauge height observations");
    await act(async () => button("6 hours").click());
    expect(container.querySelector("svg[role=img]")).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });
});
