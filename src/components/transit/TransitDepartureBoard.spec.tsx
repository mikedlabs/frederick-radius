// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transitBusWatchId } from "@/components/transit/transitRiderModel";
import TransitDepartureBoard, { type TransitDeparture } from "./TransitDepartureBoard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const row: TransitDeparture = {
  key: "declared-fixture-trip", prediction: { stopId: "162950", arrivalEpoch: 1792761000, headsign: "Downtown Frederick" },
  route: { id: "6154", short: "10", name: "10 Connector", color: "#D3E232" }, minutes: 8, fresh: true,
  catchability: { kind: "likely", label: "Likely catchable" },
  focus: { vehicleId: "declared-bus", routeId: "6154", bus: { lng: -77.4094, lat: 39.4258 }, stop: { lng: -77.40899, lat: 39.42717 }, stopId: "162950", stopName: "10th Street at Motter Avenue" },
  busRef: { vehicleId: "declared-bus", tripId: "declared-fixture-trip", targetStop: { id: "162950", name: "10th Street at Motter Avenue", lat: 39.42717, lng: -77.40899 } },
};
let host: HTMLDivElement, root: Root;
const track = vi.fn(), save = vi.fn();
const button = (pattern: RegExp) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => pattern.test(node.getAttribute("aria-label") ?? node.textContent ?? ""));
async function render(rows: TransitDeparture[], status: "live" | "stale" | "unavailable" | "loading" = "live", saved: string[] = []) {
  await act(async () => root.render(<TransitDepartureBoard arrivals={rows} status={status} savedBusWatchIds={saved} onTrack={track} onToggleSaved={save} />));
}
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); track.mockClear(); save.mockClear(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("declared departure board presentation", () => {
  it.each([
    { tripScheduleRelationship: "CANCELED" }, { tripScheduleRelationship: "DELETED" },
    { scheduleRelationship: "SKIPPED" }, { scheduleRelationship: "NO_DATA" },
  ] as const)("does not feature unusable prediction %j or mistake it for feed failure", async (relationship) => {
    const unusable = { ...row, key: "unusable", minutes: 1, prediction: { ...row.prediction, ...relationship } };
    const valid = { ...row, key: "valid", minutes: 8 };
    const supplied = [unusable, valid];
    await render(supplied);
    expect(host.querySelectorAll("[data-transit-arrival-time]")).toHaveLength(1);
    expect(host.querySelector("[data-transit-primary-departure] [data-transit-arrival-time]")?.textContent).toBe("8 min");
    expect(supplied).toEqual([unusable, valid]);
    await render([unusable]);
    expect(host.querySelector("[data-transit-primary-departure]")).toBeNull();
    expect(host.textContent).toContain("No live arrival is reporting for this stop right now.");
    expect(host.textContent).not.toContain("Live arrivals are unavailable");
    await render([unusable], "unavailable");
    expect(host.textContent).toContain("Live arrivals are unavailable for this stop right now.");
    expect(host.textContent).not.toContain("No live arrival is reporting");
  });

  it("features one exact primary ETA, readable agency color and existing bus callbacks", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render([row], "live", [transitBusWatchId(row.busRef!)]);
    expect(host.querySelectorAll("[data-transit-primary-departure]")).toHaveLength(1);
    expect(host.querySelector("[data-transit-arrival-time]")?.textContent).toBe("8 min");
    expect(host.textContent).toContain("To Downtown Frederick");
    expect(host.querySelector('[aria-label="Route 10"]')?.getAttribute("style")).toContain("color: rgb(0, 0, 0)");
    expect(button(/^Remove bus/)?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { button(/^Track /)!.click(); button(/^Remove bus/)!.click(); });
    expect(track).toHaveBeenCalledExactlyOnceWith(row.focus);
    expect(save).toHaveBeenCalledExactlyOnceWith(row.busRef);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps subsequent bus actions behind their native disclosure without changing arrival order", async () => {
    const following = { ...row, key: "second", minutes: 13, prediction: { ...row.prediction, headsign: "Transfer Center" } };
    await render([row, following]);
    expect([...host.querySelectorAll("[data-transit-arrival-time]")].map(node => node.textContent)).toEqual(["8 min", "13 min"]);
    const disclosure = host.querySelector("details")!;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toBe("Bus options");
    await act(async () => { disclosure.open = true; });
    await act(async () => (disclosure.querySelector("button") as HTMLButtonElement).click());
    expect(track).toHaveBeenCalledExactlyOnceWith(row.focus);
  });

  it("can track an exact current vehicle without inventing a savable trip identity", async () => {
    await render([{ ...row, busRef: null }]);
    expect(button(/^Track /)).toBeDefined(); expect(button(/^Save bus /)).toBeUndefined();
    await act(async () => button(/^Track /)!.click());
    expect(track).toHaveBeenCalledExactlyOnceWith(row.focus); expect(save).not.toHaveBeenCalled();
  });

  it("does not repeat the route name or guess a destination when headsign is absent", async () => {
    await render([{ ...row, prediction: { ...row.prediction, headsign: undefined } }]);
    expect(host.textContent?.match(/10 Connector/g)).toHaveLength(1);
    expect(host.querySelector("p")).toBeNull();
  });

  it("renders delayed observations as absolute time with no live, catchability or tracking claim", async () => {
    // Defensive presentation guard also prevents stale supplied action props
    // from overriding the rider owner's freshness decision.
    await render([{ ...row, fresh: false }], "stale");
    expect(host.textContent).toContain("Estimate delayed");
    expect(host.textContent).not.toMatch(/8 min|Likely catchable|Live estimate/);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector("a")?.href).toContain("/207/Transit-Routes-Schedule-Information");
  });

  it.each([
    ["loading", "Radius is checking for inbound buses.", false],
    ["unavailable", "Live arrivals are unavailable for this stop right now.", true],
    ["stale", "The last feed update has no usable arrival times.", true],
    ["live", "No live arrival is reporting for this stop right now.", true],
  ] as const)("keeps %s distinct and offers the correct schedule fallback", async (status, copy, schedule) => {
    await render([], status); expect(host.textContent).toContain(copy);
    expect(Boolean(host.querySelector("a"))).toBe(schedule);
    expect(host.textContent).not.toMatch(/0 buses|No inbound buses/);
  });
});
