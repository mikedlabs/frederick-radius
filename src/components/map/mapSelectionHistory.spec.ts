import { describe, expect, it } from "vitest";
import {
  isMapSelectionHistoryState,
  markMapSelectionHistoryState,
  parseMapSelectionHistorySnapshot,
  readMapSelectionHistorySnapshot,
} from "./mapSelectionHistory";

describe("map selection history", () => {
  it("marks a selection entry without mutating or losing router state", () => {
    const routerState = { __NA: true, tree: ["map"] };
    const marked = markMapSelectionHistoryState(routerState);

    expect(marked).not.toBe(routerState);
    expect(marked).toMatchObject(routerState);
    expect(isMapSelectionHistoryState(marked)).toBe(true);
    expect(isMapSelectionHistoryState(routerState)).toBe(false);
  });

  it("safely marks an empty or non-object browser state", () => {
    expect(isMapSelectionHistoryState(null)).toBe(false);
    expect(isMapSelectionHistoryState("router-state")).toBe(false);
    expect(isMapSelectionHistoryState(markMapSelectionHistoryState(null))).toBe(
      true,
    );
  });

  it("carries a replayable selection without losing router state", () => {
    const selection = {
      kind: "parking",
      value: {
        slug: "carroll-creek-garage",
        name: "Carroll Creek Garage",
        lng: -77.41,
        lat: 39.414,
      },
    };
    const marked = markMapSelectionHistoryState(
      { __NA: true, tree: ["map"] },
      selection,
    );

    expect(readMapSelectionHistorySnapshot(marked)).toEqual(selection);
    expect(marked).toMatchObject({ __NA: true, tree: ["map"] });
  });

  it.each([
    ["place", { slug: "cafe-nola", geom: { lng: -77.41, lat: 39.414 } }],
    ["raw", { _kind: "osm", osm_id: "node:1", lng: -77.41, lat: 39.414 }],
    ["event", { slug: "alive-at-five", lng: -77.41, lat: 39.414 }],
    [
      "event-group",
      {
        id: "venue:1",
        lng: -77.41,
        lat: 39.414,
        events: [{ slug: "alive-at-five" }],
      },
    ],
    ["town", { slug: "brunswick", name: "Brunswick", lng: -77.63, lat: 39.31 }],
    ["transit", { id: "stop:1", name: "Transit Center", lng: -77.41, lat: 39.42 }],
    ["marc", "Frederick"],
    ["aerial", { src: "/fall.jpg", lng: -77.41, lat: 39.414 }],
    ["cemetery", { id: "cem:1", name: "Mount Olivet", lng: -77.42, lat: 39.40 }],
    ["parking", { slug: "garage", name: "Garage", lng: -77.41, lat: 39.414 }],
    ["food-truck", { slug: "truck", name: "Truck", lng: -77.41, lat: 39.414 }],
    ["discovery", { id: "find:1", title: "A local connection", center: [-77.41, 39.414] }],
    ["spot", { lng: -77.41, lat: 39.414 }],
  ])("validates the %s selection shape", (kind, value) => {
    const snapshot = { kind, value };
    expect(
      readMapSelectionHistorySnapshot(
        markMapSelectionHistoryState(null, snapshot),
      ),
    ).toEqual(snapshot);
  });

  it("does not replay stale or malformed selection data", () => {
    const selected = markMapSelectionHistoryState(null, {
      kind: "transit",
      value: { id: "stop-1" },
    });
    const providerOwned = markMapSelectionHistoryState(selected);

    expect(readMapSelectionHistorySnapshot(providerOwned)).toBeNull();
    expect(
      readMapSelectionHistorySnapshot(
        markMapSelectionHistoryState(null, {
          kind: "transit",
          value: { id: "stop-1" },
        }),
      ),
    ).toBeNull();
    expect(
      readMapSelectionHistorySnapshot({
        __frederickRadiusMapSelectionV1: true,
        __frederickRadiusMapSelectionSnapshotV1: {
          kind: "town",
          value: null,
        },
      }),
    ).toBeNull();
  });

  it("validates a session-carried snapshot without trusting a history marker", () => {
    const snapshot = {
      kind: "spot",
      value: {
        lng: -77.4101,
        lat: 39.4159,
        label: "12 East Church Street",
        temporary: true,
      },
    };

    expect(parseMapSelectionHistorySnapshot(snapshot)).toEqual(snapshot);
    expect(
      parseMapSelectionHistorySnapshot({
        kind: "spot",
        value: { lng: "-77.4101", lat: 39.4159 },
      }),
    ).toBeNull();
  });
});
