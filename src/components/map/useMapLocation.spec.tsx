// @vitest-environment jsdom
// Mounted camera-ownership proof for the map's location hook, not a WebGL test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheGeolocationPosition } from "@/hooks/useGeolocation";
import { setScope } from "@/lib/scope";
import { nearbyArrivalFitPending, useMapLocation } from "./useMapLocation";

vi.mock("@/hooks/useGeolocation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGeolocation")>();
  return {
    ...actual,
    // A returning grantee: the silent refresh starts, and its fix lands later
    // through the shared cache event, exactly as requestIfGranted does.
    useGeolocation: () => ({
      state: { status: "idle" },
      requestHighAccuracy: vi.fn(),
      requestIfGranted: vi.fn(async () => true),
    }),
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Downtown Frederick, inside the county. */
const downtownFix = { lng: -77.4105, lat: 39.4143, accuracy: 25 };

describe("nearbyArrivalFitPending", () => {
  const pending = (fitApplied: boolean, storedScope: Parameters<typeof nearbyArrivalFitPending>[0]["storedScope"], search = "", autoFitNearbyScope = true) =>
    nearbyArrivalFitPending({ autoFitNearbyScope, fitApplied, search, storedScope });
  it("owns the camera only until the one-time Near me arrival fit lands", () => {
    expect(pending(false, "nearme")).toBe(true);
    // Once the fit has landed, a later submitted search frames its results.
    expect(pending(true, "nearme")).toBe(false);
  });
  it("releases the camera when Near me falls back to the county or a town", () => {
    expect(pending(false, "county")).toBe(false);
    expect(pending(false, "town:brunswick")).toBe(false);
  });
  it("reads an explicit `in=nearme` arrival from the URL when that scope is not stored", () => {
    // A shared Near me link does not persist its scope, so the stored county
    // choice must not release the camera before the Near me fit lands.
    expect(pending(false, "county", "?in=nearme&q=coffee")).toBe(true);
    expect(pending(false, null, "?in=nearme")).toBe(true);
    // The fallback deletes `in=` and stores the county, which releases it.
    expect(pending(false, "county", "?q=coffee")).toBe(false);
    expect(pending(false, "nearme", "?in=town:brunswick")).toBe(false);
  });
  it("never claims the camera for an entry that was not a Near me arrival", () => {
    expect(pending(false, "nearme", "?in=nearme", false)).toBe(false);
  });
});

describe("useMapLocation late fix", () => {
  let root: Root;
  let container: HTMLDivElement;
  let entityOwnsCamera: boolean;
  const fitNearbyCamera = vi.fn();
  const markCameraIntent = vi.fn();

  function Probe() {
    const { userLoc } = useMapLocation({
      isBrowseMap: true,
      rankingSeed: null,
      // A link naming a place or event never latches the Near me arrival fit.
      autoFitNearbyScope: false,
      arrivalEntityOwnsCamera: () => entityOwnsCamera,
      setGeoMsg: () => {},
      markCameraIntent,
      fitNearbyCamera,
      fitNearbyWithIntent: () => {},
      fitCountyCamera: () => {},
      onBeforeNearMe: () => {},
    });
    return <output data-user-loc={userLoc ? `${userLoc.lng},${userLoc.lat}` : ""} />;
  }

  const landFix = async () => {
    await act(async () => {
      cacheGeolocationPosition({ ...downtownFix, timestamp: Date.now() });
    });
  };

  beforeEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    // A saved Near me scope from an earlier visit (localStorage persists).
    setScope("nearme");
    window.history.replaceState(null, "", "/map?place=brewers-alley-frederick");
    entityOwnsCamera = true;
    fitNearbyCamera.mockReset();
    markCameraIntent.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  it("re-ranks from a late fix after a ?place= arrival without pulling the camera off the place", async () => {
    await landFix();
    expect(container.querySelector("output")?.dataset.userLoc).toBe(`${downtownFix.lng},${downtownFix.lat}`);
    expect(fitNearbyCamera).not.toHaveBeenCalled();
    expect(markCameraIntent).not.toHaveBeenCalled();
  });

  it("fits Near me again once the arrival place no longer holds the camera", async () => {
    // The visitor closed the place card or moved the camera.
    entityOwnsCamera = false;
    await landFix();
    expect(fitNearbyCamera).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ lng: downtownFix.lng, lat: downtownFix.lat }),
    );
  });

  it("honors a Near me choice made in the header after arrival", async () => {
    await act(async () => setScope("nearme"));
    await landFix();
    expect(fitNearbyCamera).toHaveBeenCalledOnce();
  });
});
