// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapPinPlace } from "./types";

vi.mock("@/hooks/useFollows", () => ({
  useIsFollowed: () => false,
  useToggleFollow: () => vi.fn(),
}));
vi.mock("@/lib/track", () => ({ logActivity: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
vi.mock("./MapResultSurface", () => ({
  default: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

import MapPeek from "./MapPeek";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const place = {
  slug: "dutchs-daughter",
  name: "Dutch's Daughter",
  category: "restaurant",
  municipality: "frederick",
  geom: { lat: 39.43, lng: -77.42 },
  open_status: { state: "unknown" },
} as MapPinPlace;

const details = {
  slug: "dutchs-daughter",
  address: "581 Himes Ave",
  google_photo_url: "/api/place-photo?name=places%2Fdutch%2Fphotos%2Fone&w=800",
  google_maps_uri: "https://maps.google.com/?cid=1",
  google_photo_attribution: {
    photo_name: "places/dutch/photos/one",
    authors: [{ display_name: "A H", uri: "https://maps.google.com/maps/contrib/1" }],
  },
};

async function settle(img: HTMLImageElement, outcome: "photo" | "signal") {
  await act(async () => {
    const size = outcome === "photo" ? 156 : 1;
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size },
      naturalHeight: { configurable: true, value: size },
    });
    img.dispatchEvent(new Event("load"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("MapPeek photo", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ place: details }) })),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <MapPeek
          place={place}
          distanceOrigin={null}
          distanceOriginLabel="from map center"
          onClose={() => {}}
          onDetails={() => {}}
        />,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const visual = () => container.querySelector(".map-peek-visual")!;
  const credit = () => container.querySelector(".map-peek-photo-credit");

  it("withholds the credit until the photo decodes", async () => {
    const img = visual().querySelector("img")!;
    expect(img.getAttribute("src")).toContain("fallback=signal");
    expect(credit()).toBeNull();

    await settle(img, "photo");

    expect(credit()?.textContent).toContain("Photo by A H");
  });

  it("shows the category mark with no credit when the proxy signals failure", async () => {
    await settle(visual().querySelector("img")!, "signal");

    expect(visual().querySelector("img")).toBeNull();
    expect(credit()).toBeNull();
    expect(visual().querySelector(".map-peek-category-mark")?.textContent).toBe("D");
  });
});
