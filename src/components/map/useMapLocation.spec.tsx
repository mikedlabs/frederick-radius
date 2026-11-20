// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoPosition, GeoState } from "@/hooks/useGeolocation";
import { getScope, setScope } from "@/lib/scope";
import { useMapLocation } from "./useMapLocation";

const mockGeo = vi.hoisted(() => ({
  state: { status: "idle" } as GeoState,
  cached: null as GeoPosition | null,
  requestHighAccuracy: vi.fn(),
  requestIfGranted: vi.fn(),
}));
vi.mock("@/hooks/useGeolocation", () => ({
  GEOLOCATION_CHANGE_EVENT: "fr:geolocation-change",
  readCachedGeoPosition: () => mockGeo.cached,
  readCachedPosition: () => mockGeo.cached,
  useGeolocation: () => mockGeo,
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const position = { lng: -77.4105, lat: 39.4143, accuracy: 15, timestamp: 100 };
const callbacks = {
  setGeoMsg: vi.fn(),
  markCameraIntent: vi.fn(),
  fitNearbyCamera: vi.fn(),
  recenterCamera: vi.fn(),
  fitNearbyWithIntent: vi.fn(),
  fitCountyCamera: vi.fn(),
  onBeforeNearMe: vi.fn(),
  onBeforeRecenter: vi.fn(),
};

function DirectNearbyMap() {
  const location = useMapLocation({
    isBrowseMap: true,
    rankingSeed: null,
    autoFitNearbyScope: true,
    arrivalEntityOwnsCamera: () => false,
    ...callbacks,
  });
  return <button type="button" onClick={location.recenterOnLocation}>Find me</button>;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mockGeo.state = { status: "idle" };
  mockGeo.cached = null;
  setScope("nearme");
  window.history.replaceState(null, "", "/map?in=nearme");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setScope(null);
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<DirectNearbyMap />));
}

async function clickFindMe() {
  await act(async () => host.querySelector("button")?.click());
}

describe("map location camera intent", () => {
  it("centers an explicit fix without running the direct Near me fit", async () => {
    const permission = Promise.withResolvers<boolean>();
    mockGeo.requestIfGranted.mockReturnValue(permission.promise);
    await render();
    await clickFindMe();
    expect(callbacks.onBeforeRecenter).toHaveBeenCalledOnce();
    expect(mockGeo.requestHighAccuracy).toHaveBeenCalledOnce();

    await act(async () => permission.resolve(false));
    expect(getScope()).toBe("nearme");
    expect(callbacks.fitCountyCamera).not.toHaveBeenCalled();

    await act(async () => {
      mockGeo.cached = position;
      window.dispatchEvent(new Event("fr:geolocation-change"));
      mockGeo.state = { status: "granted", position };
      root.render(<DirectNearbyMap />);
    });
    expect(callbacks.recenterCamera).toHaveBeenCalledExactlyOnceWith({ lng: position.lng, lat: position.lat });
    expect(callbacks.fitNearbyCamera).not.toHaveBeenCalled();

    await act(async () => window.dispatchEvent(new Event("fr:geolocation-change")));
    expect(callbacks.fitNearbyCamera).not.toHaveBeenCalled();

    await act(async () => {
      setScope("nearme");
      window.dispatchEvent(new Event("fr:geolocation-change"));
    });
    expect(callbacks.fitNearbyCamera).toHaveBeenCalledExactlyOnceWith(position);
  });

  it("falls back to the county if the pending direct Near me fix is denied", async () => {
    mockGeo.requestIfGranted.mockResolvedValue(true);
    mockGeo.state = { status: "loading" };
    await render();
    await clickFindMe();
    expect(mockGeo.requestHighAccuracy).not.toHaveBeenCalled();

    mockGeo.state = { status: "denied" };
    await render();
    expect(getScope()).toBe("county");
    expect(new URLSearchParams(window.location.search).has("in")).toBe(false);
    expect(callbacks.fitCountyCamera).toHaveBeenCalledOnce();
    expect(callbacks.recenterCamera).not.toHaveBeenCalled();
  });

  it("keeps the scope and camera when Find me returns an out-of-county fix", async () => {
    mockGeo.requestIfGranted.mockResolvedValue(true);
    mockGeo.state = { status: "loading" };
    await render();
    await clickFindMe();
    expect(callbacks.onBeforeRecenter).toHaveBeenCalledOnce();

    mockGeo.state = { status: "granted", position: { ...position, lng: -76.6122, lat: 39.2904 } };
    await render();
    expect(getScope()).toBe("nearme");
    expect(new URLSearchParams(window.location.search).get("in")).toBe("nearme");
    expect(callbacks.setGeoMsg).toHaveBeenLastCalledWith("You are outside Frederick County. Keeping your current map view.");
    expect(callbacks.fitCountyCamera).not.toHaveBeenCalled();
    expect(callbacks.fitNearbyCamera).not.toHaveBeenCalled();
    expect(callbacks.recenterCamera).not.toHaveBeenCalled();
  });
});
