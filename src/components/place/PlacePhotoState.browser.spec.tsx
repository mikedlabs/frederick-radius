// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";

vi.mock("./PlaceSheetProvider", () => ({
  usePlaceSheet: () => ({ openSheet: vi.fn() }),
}));
vi.mock("@/components/saved/SaveButton", () => ({
  default: () => null,
}));

import {
  PlacePhotoHeader,
  PlacePhotoScope,
  PlacePhotoScopeImage,
  PlacePhotoWhen,
  usePlacePhotoState,
} from "./PlacePhotoState";
import PlaceCard from "./PlaceCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PROXY = "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=800";

/** Settle the photo the way a browser would: next/image reports onLoad after
 *  decode, with the element's intrinsic size as the failure signal. */
async function settle(
  img: HTMLImageElement,
  outcome: "photo" | "signal" | "error",
) {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "photo" ? [800, 600] : [1, 1];
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size[0] },
      naturalHeight: { configurable: true, value: size[1] },
    });
    img.dispatchEvent(new Event("load"));
  });
  // next/image runs the user's onLoad after a decode promise.
  await act(async () => {
    await Promise.resolve();
  });
}

function HookProbe({ initial }: { initial: string | null }) {
  const [src, setSrc] = useState(initial);
  const photo = usePlacePhotoState(src);
  return (
    <div data-status={photo.status}>
      {photo.src && photo.status !== "missing" ? (
        // A raw img keeps this probe independent of next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={photo.src}
          onLoad={photo.onLoad}
          onError={photo.onError}
        />
      ) : null}
      <button type="button" onClick={() => setSrc(`${PROXY}&slug=next`)}>
        Next photo
      </button>
    </div>
  );
}

function ScopeProbe({ src }: { src: string | null }) {
  return (
    <PlacePhotoScope src={src}>
      <PlacePhotoHeader photoClassName="frame-photo" missingClassName="frame-missing">
        <PlacePhotoWhen is="visible">
          <div data-slot="photo">
            <PlacePhotoScopeImage alt="" width={800} height={600} />
          </div>
        </PlacePhotoWhen>
        <PlacePhotoWhen is="missing">
          <h1 data-slot="type">Bluegrass Jam</h1>
        </PlacePhotoWhen>
        <PlacePhotoWhen is="ready">
          <p data-slot="credit">Photo by A H · Google Maps</p>
        </PlacePhotoWhen>
      </PlacePhotoHeader>
    </PlacePhotoScope>
  );
}

function place(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "dutchs-daughter",
    name: "Dutch's Daughter",
    category: "restaurant",
    municipality: "frederick",
    address: "581 Himes Ave",
    city: "Frederick",
    geom: { lat: 39.43, lng: -77.42 },
    tags: [],
    open_status: { state: "unknown" },
    google_photo_url: `${PROXY}&slug=dutchs-daughter`,
    ...overrides,
  } as PlaceCardData;
}

describe("usePlacePhotoState", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const status = () =>
    container.querySelector("[data-status]")?.getAttribute("data-status");

  it("asks the proxy for its failure signal and starts as loading", async () => {
    await act(async () => root.render(<HookProbe initial={PROXY} />));

    expect(status()).toBe("loading");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${PROXY}&fallback=signal`,
    );
  });

  it("is missing with no source at all", async () => {
    await act(async () => root.render(<HookProbe initial={null} />));

    expect(status()).toBe("missing");
    expect(container.querySelector("img")).toBeNull();
  });

  it("is ready only after a real image decodes", async () => {
    await act(async () => root.render(<HookProbe initial={PROXY} />));
    await settle(container.querySelector("img")!, "photo");

    expect(status()).toBe("ready");
  });

  it.each(["signal", "error"] as const)(
    "drops the photo on a proxy %s",
    async (outcome) => {
      await act(async () => root.render(<HookProbe initial={PROXY} />));
      await settle(container.querySelector("img")!, outcome);

      expect(status()).toBe("missing");
      expect(container.querySelector("img")).toBeNull();
    },
  );

  it("does not carry one photo's verdict over to the next source", async () => {
    await act(async () => root.render(<HookProbe initial={PROXY} />));
    await settle(container.querySelector("img")!, "photo");
    expect(status()).toBe("ready");

    await act(async () => container.querySelector("button")!.click());

    expect(status()).toBe("loading");
  });
});

describe("PlacePhotoScope", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const slot = (name: string) => container.querySelector(`[data-slot="${name}"]`);

  it("server-renders the photo slot without its credit", () => {
    const html = renderToStaticMarkup(<ScopeProbe src={PROXY} />);

    expect(html).toContain('class="frame-photo"');
    expect(html).toContain('data-slot="photo"');
    expect(html).toContain("fallback=signal");
    expect(html).not.toContain("Photo by");
    expect(html).not.toContain('data-slot="type"');
  });

  it("server-renders the photoless layout when there is no photo", () => {
    const html = renderToStaticMarkup(<ScopeProbe src={null} />);

    expect(html).toContain('class="frame-missing"');
    expect(html).toContain('data-slot="type"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Photo by");
  });

  it("shows the credit once a real photo has loaded", async () => {
    await act(async () => root.render(<ScopeProbe src={PROXY} />));
    expect(slot("credit")).toBeNull();

    await settle(container.querySelector("img")!, "photo");

    expect(slot("credit")?.textContent).toBe("Photo by A H · Google Maps");
    expect(slot("photo")).not.toBeNull();
    expect(container.querySelector("header")?.className).toBe("frame-photo");
  });

  it("swaps a failed photo for the photoless layout with no credit", async () => {
    await act(async () => root.render(<ScopeProbe src={PROXY} />));
    await settle(container.querySelector("img")!, "signal");

    expect(slot("photo")).toBeNull();
    expect(slot("credit")).toBeNull();
    expect(slot("type")?.textContent).toBe("Bluegrass Jam");
    expect(container.querySelector("header")?.className).toBe("frame-missing");
  });
});

describe("PlaceCard thumbnail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const thumb = () =>
    container.querySelector("[data-place-thumb]")?.getAttribute("data-place-thumb");

  it("requests a narrowed, signal-aware proxy photo", async () => {
    await act(async () => root.render(<PlaceCard place={place()} />));

    expect(thumb()).toBe("photo");
    const src = new URL(
      container.querySelector("img")!.getAttribute("src")!,
      "https://frederickradius.local",
    );
    expect(src.searchParams.get("fallback")).toBe("signal");
    expect(src.searchParams.get("w")).toBe("92");
  });

  it("keeps a real photo once it loads", async () => {
    await act(async () => root.render(<PlaceCard place={place()} />));
    await settle(container.querySelector("img")!, "photo");

    expect(thumb()).toBe("photo");
    expect(container.querySelector("img")).not.toBeNull();
  });

  it.each(["signal", "error"] as const)(
    "falls back to the category mark on a proxy %s instead of a cropped plate",
    async (outcome) => {
      await act(async () => root.render(<PlaceCard place={place()} />));
      await settle(container.querySelector("img")!, outcome);

      expect(thumb()).toBe("category");
      expect(container.querySelector("img")).toBeNull();
    },
  );
});
