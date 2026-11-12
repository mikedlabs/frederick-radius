// @vitest-environment jsdom
// Mounted camera-intent proof for a submitted search, not a WebGL test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrivalSearchFrameKey,
  intentFrameKey,
  searchFrameRequest,
  SEARCH_FRAME_TTL_MS,
  useSearchResultFraming,
  type SearchFrameRequest,
} from "./useSearchResultFraming";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const coffee = [
  { lng: -77.4105, lat: 39.4143 },
  { lng: -77.405, lat: 39.418 },
];

describe("arrivalSearchFrameKey", () => {
  it("frames a category or text search that arrives in the URL", () => {
    expect(arrivalSearchFrameKey("?intent=eat&sub=coffee")).toBe(intentFrameKey("eat", "coffee"));
    expect(arrivalSearchFrameKey("?q=pizza")).toBe("q:pizza");
  });
  it("leaves an arrival camera or a named entity in charge", () => {
    expect(arrivalSearchFrameKey("?intent=eat&c=-77.41,39.41,13")).toBeNull();
    expect(arrivalSearchFrameKey("?q=pizza&place=brewers-alley-frederick")).toBeNull();
    expect(arrivalSearchFrameKey("")).toBeNull();
  });
});

describe("useSearchResultFraming", () => {
  let root: Root;
  let container: HTMLDivElement;
  let pendingRef: { current: SearchFrameRequest | null };
  let gestured: boolean;
  const fitBounds = vi.fn();
  const easeTo = vi.fn();
  const markCameraIntent = vi.fn();

  function Owner({ settledKey, points = coffee, otherOwner = false }: {
    settledKey: string | null;
    points?: { lng: number; lat: number }[];
    otherOwner?: boolean;
  }) {
    useSearchResultFraming({
      pendingRef,
      settledKey,
      points,
      ready: true,
      getMap: () => ({ getZoom: () => 10, easeTo, fitBounds }),
      hasUserGestureSincePending: () => gestured,
      hasOtherCameraOwner: () => otherOwner,
      markCameraIntent,
    });
    return null;
  }
  const render = async (props: Parameters<typeof Owner>[0]) => {
    await act(async () => root.render(<Owner {...props} />));
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    pendingRef = { current: searchFrameRequest(intentFrameKey("eat", "coffee")) };
    gestured = false;
    fitBounds.mockReset(); easeTo.mockReset(); markCameraIntent.mockReset();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("waits for the submitted search to settle, then frames its results once", async () => {
    await render({ settledKey: intentFrameKey("eat", null) });
    expect(fitBounds).not.toHaveBeenCalled();
    await render({ settledKey: intentFrameKey("eat", "coffee") });
    expect(fitBounds).toHaveBeenCalledExactlyOnceWith(
      [[-77.4105, 39.4143], [-77.405, 39.418]],
      expect.objectContaining({ maxZoom: 16, essential: true }),
    );
    expect(markCameraIntent).toHaveBeenCalledOnce();
    expect(pendingRef.current).toBeNull();
    await render({ settledKey: intentFrameKey("eat", "coffee"), points: [...coffee] });
    expect(fitBounds).toHaveBeenCalledOnce();
  });

  it("never moves the camera after the visitor pans or zooms", async () => {
    gestured = true;
    await render({ settledKey: intentFrameKey("eat", "coffee") });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(pendingRef.current).toBeNull();
  });

  it("yields to another camera owner", async () => {
    await render({ settledKey: intentFrameKey("eat", "coffee"), otherOwner: true });
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("drops a request that never settles, so a later chip toggle cannot move the camera", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
    pendingRef.current = searchFrameRequest(intentFrameKey("eat", "coffee"));
    await render({ settledKey: null });
    vi.setSystemTime(new Date(Date.parse("2030-01-01T12:00:00Z") + SEARCH_FRAME_TTL_MS + 1));
    await render({ settledKey: intentFrameKey("eat", "coffee") });
    expect(fitBounds).not.toHaveBeenCalled();
  });
});
