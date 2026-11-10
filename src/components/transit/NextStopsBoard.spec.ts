// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TRANSIT from "@/data/transit.json";
import NextStopsBoard, { orderBoardRows } from "./NextStopsBoard";
import type { LiveVehicle, LiveVehiclesSnap } from "./useLiveVehicles";

const live = vi.hoisted(() => ({ snap: undefined as unknown }));
vi.mock("./useLiveVehicles", () => ({ useLiveVehicles: () => live.snap }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A fixed provider snapshot time. Every arrival below is written relative to
// it, in seconds, the way the feed reports etaEpoch.
const FETCHED_AT = Date.UTC(2026, 10, 10, 17, 0, 0);
const routes = [...(TRANSIT.routes as { id: string; short: string }[])].sort((a, b) =>
  a.short.localeCompare(b.short, undefined, { numeric: true }),
);
const [firstRoute, secondRoute] = routes;

function bus(vehicleId: string, routeId: string | undefined, etaSeconds?: number | null): LiveVehicle {
  return {
    vehicleId,
    routeId,
    lat: 39.41,
    lng: -77.41,
    nextStop:
      etaSeconds === null
        ? undefined
        : {
            id: `stop-${vehicleId}`,
            name: `Stop ${vehicleId}`,
            lat: 39.41,
            lng: -77.41,
            etaEpoch: etaSeconds === undefined ? undefined : FETCHED_AT / 1000 + etaSeconds,
          },
  };
}
const ids = (vehicles: LiveVehicle[]) => orderBoardRows(vehicles, FETCHED_AT).map((row) => row.v.vehicleId);

describe("orderBoardRows", () => {
  it("leads with the soonest arrival, then breaks ties by route and vehicle", () => {
    expect(
      ids([
        bus("late", firstRoute.id, 600),
        bus("tie-2", firstRoute.id, 120),
        bus("tie-second-route", secondRoute.id, 120),
        bus("tie-1", firstRoute.id, 120),
        bus("soon", secondRoute.id, 45),
      ]),
    ).toEqual(["soon", "tie-1", "tie-2", "tie-second-route", "late"]);
  });

  it("keeps a just-passed arrival at the top instead of dropping it to the bottom", () => {
    expect(
      ids([bus("ten-minutes", firstRoute.id, 600), bus("en-route", firstRoute.id, null), bus("arriving", secondRoute.id, -40)]),
    ).toEqual(["arriving", "ten-minutes", "en-route"]);
  });

  it("ranks an arrival that is too old, too far out or missing after every usable one", () => {
    expect(
      ids([
        bus("stale", firstRoute.id, -61),
        bus("too-far", firstRoute.id, 91 * 60),
        bus("no-estimate", firstRoute.id),
        bus("edge-past", secondRoute.id, -60),
        bus("edge-far", secondRoute.id, 90 * 60),
      ]),
    ).toEqual(["edge-past", "edge-far", "no-estimate", "stale", "too-far"]);
  });

  it("leaves out a vehicle with neither a known route nor a next stop", () => {
    expect(ids([bus("ghost", "not-a-route", null), bus("unknown-route", "not-a-route", 60), bus("known", firstRoute.id, null)]))
      .toEqual(["unknown-route", "known"]);
  });

  it("does not read the clock, so two ticks with unchanged vehicles return the same order", () => {
    const vehicles = [bus("b", firstRoute.id, 70), bus("a", secondRoute.id, 50), bus("c", firstRoute.id, 100)];
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(FETCHED_AT);
      const first = ids(vehicles);
      vi.setSystemTime(FETCHED_AT + 45_000);
      expect(ids(vehicles)).toEqual(first);
      expect(first).toEqual(["a", "b", "c"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NextStopsBoard", () => {
  let root: Root;
  let host: HTMLDivElement;
  const snapshot = (vehicles: LiveVehicle[], fetchedAt = FETCHED_AT): LiveVehiclesSnap => ({
    vehicles,
    loaded: true,
    available: true,
    status: "ok",
    predictionsAvailable: true,
    fetchedAt,
    stale: false,
  });
  const render = () => act(async () => root.render(createElement(NextStopsBoard)));
  const tick = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
  const rows = () =>
    [...host.querySelectorAll("li")].map((row) => ({
      stop: row.querySelector("span.font-semibold")?.textContent,
      eta: row.lastElementChild?.textContent,
    }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(FETCHED_AT);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("counts down every second without moving a row until the feed changes", async () => {
    // Sorting on the rounded countdown put the second-route bus last at first
    // (both read "1 min", so route order decided) and first 25 seconds later
    // (it rounds to "due" before the other). That swap is the reshuffle.
    live.snap = snapshot([bus("70s", firstRoute.id, 70), bus("50s", secondRoute.id, 50), bus("5m", firstRoute.id, 300)]);
    await render();
    // The first paint already carries real countdowns, counted from the
    // snapshot's own time, instead of "soon" on every row until the first tick.
    expect(rows().map((row) => row.eta)).toEqual(["1 min", "1 min", "5 min"]);
    await tick(1000);
    expect(rows()).toEqual([
      { stop: "Stop 50s", eta: "1 min" },
      { stop: "Stop 70s", eta: "1 min" },
      { stop: "Stop 5m", eta: "5 min" },
    ]);

    for (let second = 2; second <= 45; second++) {
      await tick(1000);
      expect(rows().map((row) => row.stop)).toEqual(["Stop 50s", "Stop 70s", "Stop 5m"]);
    }
    expect(rows().map((row) => row.eta)).toEqual(["due", "due", "4 min"]);

    // A new snapshot is the only thing that re-ranks the board.
    live.snap = snapshot(
      [bus("70s", firstRoute.id, 400), bus("50s", secondRoute.id, 500), bus("5m", firstRoute.id, 300)],
      FETCHED_AT + 45_000,
    );
    await render();
    expect(rows().map((row) => row.stop)).toEqual(["Stop 5m", "Stop 70s", "Stop 50s"]);
  });

  it("keeps a bus that just reached its stop in place after the countdown runs out", async () => {
    live.snap = snapshot([bus("arriving", secondRoute.id, 5), bus("next", firstRoute.id, 200)]);
    await render();
    await tick(1000);
    expect(rows()[0]).toEqual({ stop: "Stop arriving", eta: "due" });

    // 46 seconds past its estimate: still leading, and still reading "due"
    // instead of a vaguer "soon" above the row that follows it.
    await tick(50_000);
    expect(rows()).toEqual([
      { stop: "Stop arriving", eta: "due" },
      { stop: "Stop next", eta: "2 min" },
    ]);

    // Past the one-minute window the estimate is no longer shown as a time.
    // The row holds its place until the next snapshot re-ranks the board.
    await tick(20_000);
    expect(rows().map((row) => row.stop)).toEqual(["Stop arriving", "Stop next"]);
    expect(rows()[0].eta).toBe("soon");
  });

  it("stops showing an estimate more than 90 minutes out, the same horizon the ranking uses", async () => {
    live.snap = snapshot([bus("far", firstRoute.id, 91 * 60), bus("edge", secondRoute.id, 90 * 60)]);
    await render();
    expect(rows()).toEqual([
      { stop: "Stop edge", eta: "90 min" },
      { stop: "Stop far", eta: "soon" },
    ]);
  });
});
