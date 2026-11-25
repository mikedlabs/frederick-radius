// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { GeoState } from "@/hooks/useGeolocation";
import type { LngLat } from "@/lib/geo";
import RadiusBuilder from "./RadiusBuilder";

const location = vi.hoisted(() => ({
  state: { status: "idle" } as GeoState,
  request: vi.fn(),
  requestIfGranted: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => location, readCachedPosition: () => null }));
vi.mock("@/hooks/useClientPlaces", () => ({ useClientPlaces: () => ({ places: [], ready: true }) }));
vi.mock("@/components/place/PlaceSheetProvider", () => ({ usePlaceSheet: () => ({ openSheet: vi.fn() }) }));
vi.mock("./MapControlSheet", () => ({
  SNAP_HALF: 0.5, SNAP_COLLAPSED: "148px",
  default: ({ children, summary }: { children: ReactNode; summary: ReactNode }) => <>{summary}{children}</>,
}));
vi.mock("./RadiusMap", () => ({
  default: ({ onCenterChange }: { onCenterChange: (point: LngLat) => void }) =>
    <button data-test-pin onClick={() => onCenterChange({ lng: -77.41, lat: 39.42 })}>Choose a map point</button>,
}));

afterEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("starts from the selected town and retains a manual pin when a device lookup fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  window.history.replaceState({}, "", "/map?mode=radius&in=thurmont&minutes=2");
  window.localStorage.setItem("fr:home-muni:v1", "frederick");
  location.state = { status: "idle" };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () => act(async () => root.render(<RadiusBuilder />));
  try {
    await render();
    const origin = host.querySelector<HTMLSelectElement>("#center-select")!;
    expect(origin.selectedOptions[0].text).toBe("Thurmont");
    expect(location.requestIfGranted).not.toHaveBeenCalled();
    expect(host.querySelector("#minutes-slider")?.getAttribute("aria-valuetext")).toBe("2 minutes");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-test-pin]")!.click());
    expect(origin.selectedOptions[0].text).toBe("Pinned point");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Use my location"]')!.click());
    expect(location.request).toHaveBeenCalledOnce();
    location.state = { status: "error", message: "Position unavailable" };
    await render();
    expect(origin.selectedOptions[0].text).toBe("Pinned point");
    expect(host.querySelector("#reach-summary-origin")?.textContent).toContain("Pinned point");
    expect(host.textContent).toContain("Choose a starting point, or try using your location again.");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
