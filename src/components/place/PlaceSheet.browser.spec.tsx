// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";

// The sheet shell, network-backed context blocks and telemetry are outside
// this contract; the hero, strip and description are what is under test.
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ present, children }: { present: boolean; children: (dismiss: () => void) => ReactNode }) =>
    present ? <>{children(() => {})}</> : null,
  SheetHandle: () => null,
}));
vi.mock("@/components/saved/SaveButton", () => ({ default: () => null }));
vi.mock("./ShareButton", () => ({ default: () => null }));
vi.mock("./FieldNotesCard", () => ({ default: () => null }));
vi.mock("@/components/place/GooglePlaceContext", () => ({ default: () => null }));
vi.mock("@/components/plan/PlanFromPlaceLink", () => ({ default: () => null }));
vi.mock("@/lib/aerial", () => ({ nearestAerial: () => null, currentSeason: () => "fall" }));
vi.mock("@/lib/decision/telemetry", () => ({
  decisionContextFromPath: () => ({ surface: "map" }),
  trackDecision: vi.fn(),
}));

import PlaceSheet, { knownForLine } from "./PlaceSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const HERO = "/api/place-photo?name=places%2Ftin%2Fphotos%2Fhero&w=800";
const SECOND = "/api/place-photo?name=places%2Ftin%2Fphotos%2Fsecond&w=800";
const BLURB =
  "Tin Corner serves Hungarian street food and cocktails on Market Street.";

function place(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "tin-corner",
    name: "Tin Corner",
    category: "restaurant",
    municipality: "frederick",
    address: "200 N Market St",
    city: "Frederick",
    geom: { lat: 39.416, lng: -77.41 },
    tags: [],
    open_status: { state: "unknown" },
    short_blurb: BLURB,
    description_reviewed: true,
    phone: "301-555-0100",
    google_photo_url: HERO,
    google_photos: [HERO, SECOND],
    google_photo_attribution: {
      photo_name: "places/tin/photos/hero",
      google_maps_uri: "https://maps.google.com/?cid=1",
      authors: [{ display_name: "A H", uri: "https://maps.google.com/maps/contrib/1" }],
    },
    ...overrides,
  } as PlaceCardData;
}

async function settle(img: HTMLImageElement, outcome: "photo" | "signal") {
  await act(async () => {
    const size = outcome === "photo" ? 800 : 1;
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

describe("PlaceSheet photos", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function open(data: PlaceCardData = place()) {
    await act(async () =>
      root.render(
        <PlaceSheet place={data} onClose={() => {}} historyLayerId="place-sheet-test" />,
      ),
    );
  }

  const hero = () =>
    container.querySelector("[data-place-sheet-hero]")?.getAttribute("data-place-sheet-hero");
  const heroImg = () =>
    container.querySelector<HTMLImageElement>('[data-place-sheet-hero="photo"] img');
  const stripImgs = () =>
    [...container.querySelectorAll<HTMLImageElement>("[data-place-sheet-strip-photo] img")];

  it("withholds the photo credit until the hero decodes", async () => {
    await open();

    expect(hero()).toBe("photo");
    expect(heroImg()?.getAttribute("src")).toContain("fallback=signal");
    expect(container.querySelector(".lucide-expand")).not.toBeNull();
    expect(container.textContent).not.toContain("Photo by");

    await settle(heroImg()!, "photo");

    expect(container.textContent).toContain("Photo by A H");
  });

  it("drops the hero, its Expand control and its credit when the proxy signals failure", async () => {
    await open();
    await settle(heroImg()!, "signal");

    expect(hero()).toBe("category");
    expect(container.querySelector('[aria-label="View Tin Corner photos"]')).toBeNull();
    expect(container.querySelector(".lucide-expand")).toBeNull();
    expect(container.textContent).not.toContain("Photo by");
    // The photoless header carries the identity instead.
    expect(container.querySelector("header h2")?.textContent).toBe("Tin Corner");
  });

  it("removes a strip photo that comes back as the failure signal", async () => {
    await open();
    expect(stripImgs()).toHaveLength(1);
    expect(stripImgs()[0].getAttribute("src")).toContain("fallback=signal");

    await settle(stripImgs()[0], "signal");

    expect(stripImgs()).toHaveLength(0);
  });
});

describe("PlaceSheet description", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("prints the blurb once, without a Known for prefix", async () => {
    await act(async () =>
      root.render(
        <PlaceSheet place={place()} onClose={() => {}} historyLayerId="place-sheet-test" />,
      ),
    );

    const text = container.textContent ?? "";
    expect(text.split("Tin Corner serves Hungarian street food").length - 1).toBe(1);
    expect(text).not.toContain("Known for");
    expect(container.querySelector("[data-place-known-for]")).toBeNull();
  });

  it("keeps Known for for the structured known_for list", async () => {
    await act(async () =>
      root.render(
        <PlaceSheet
          place={place({ known_for: ["langos", "chimney cake"] })}
          onClose={() => {}}
          historyLayerId="place-sheet-test"
        />,
      ),
    );

    expect(container.querySelector("[data-place-known-for]")?.textContent).toBe(
      "Known for langos and chimney cake.",
    );
    const text = container.textContent ?? "";
    expect(text.split("Tin Corner serves Hungarian street food").length - 1).toBe(1);
  });
});

describe("knownForLine", () => {
  it("reads as one plain sentence from the structured list", () => {
    expect(knownForLine(["Detroit-style pizza"])).toBe("Known for Detroit-style pizza.");
    expect(knownForLine(["beer garden", "food truck schedule", "dog-friendly garden."]))
      .toBe("Known for beer garden, food truck schedule, and dog-friendly garden.");
  });

  it("says nothing without structured data", () => {
    expect(knownForLine(undefined)).toBeNull();
    expect(knownForLine([])).toBeNull();
    expect(knownForLine(["  "])).toBeNull();
  });
});
