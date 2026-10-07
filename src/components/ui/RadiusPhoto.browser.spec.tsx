// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RadiusPhoto, {
  RADIUS_PHOTO_MARK_MAX,
  RadiusPhotoMark,
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "./RadiusPhoto";

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

function requested(html: string): URL {
  const src = html.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  expect(src).toBeDefined();
  return new URL(src!, "https://frederickradius.local");
}

describe("RadiusPhoto server render", () => {
  it("always asks the proxy for its failure signal, narrowed to the frame", () => {
    const url = requested(
      renderToStaticMarkup(<RadiusPhoto src={PROXY} size={52} />),
    );

    expect(url.pathname).toBe("/api/place-photo");
    expect(url.searchParams.get("fallback")).toBe("signal");
    expect(url.searchParams.get("w")).toBe("104");
  });

  it("leaves a publisher image untouched and lets Next optimize it", () => {
    const html = renderToStaticMarkup(
      <RadiusPhoto
        src="https://s1.ticketm.net/dam/a/flyer.jpg"
        size={720}
        fit="contain"
        className="aspect-[16/9] w-full"
      />,
    );

    expect(html).toContain("flyer.jpg");
    expect(html).not.toContain("fallback%3Dsignal");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("paints a loading frame with its overlays and no mark", () => {
    const html = renderToStaticMarkup(
      <RadiusPhoto src={PROXY} size={72}>
        <span data-overlay>rule</span>
      </RadiusPhoto>,
    );

    expect(html).toContain('data-radius-photo="loading"');
    expect(html).toContain("data-overlay");
    expect(html).toContain("width:72px");
    expect(html).not.toContain('data-radius-photo="mark"');
  });

  it("draws the category mark for a small frame with no photo", () => {
    const html = renderToStaticMarkup(
      <RadiusPhoto src={null} size={48} category="coffee" />,
    );

    expect(html).toContain('data-radius-photo="mark"');
    expect(html).not.toContain("<img");
  });

  it("hands a large frame with no photo back to the caller's fallback", () => {
    const html = renderToStaticMarkup(
      <RadiusPhoto
        src={undefined}
        size={RADIUS_PHOTO_MARK_MAX}
        fallback={<p data-fallback>Venue details</p>}
      >
        <span data-overlay>rule</span>
      </RadiusPhoto>,
    );

    expect(html).toBe('<p data-fallback="true">Venue details</p>');
  });
});

describe("RadiusPhotoMark", () => {
  it("fills flat with the place hue mixed toward Ink and a Cream glyph", () => {
    const html = renderToStaticMarkup(
      <RadiusPhotoMark category="bar" hue="#3684E2" size={48} />,
    );

    expect(html).toContain("color-mix(in srgb, #3684E2 60%, var(--app-ink))");
    expect(html).toContain("color:var(--app-bg)");
    expect(html).not.toContain("gradient");
    expect(html).toContain("<svg");
  });

  it("uses a quiet category tint without a hue, and never an initial", () => {
    const html = renderToStaticMarkup(
      <RadiusPhotoMark category="coffee" size={36} />,
    );

    expect(html).toContain("var(--app-bg-elevated-solid)");
    expect(html).not.toContain("gradient");
    expect(html).not.toMatch(/>[A-Z]<\/span>/);
  });
});

describe("RadiusPhoto in the browser", () => {
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

  const frame = () =>
    container.querySelector("[data-radius-photo]")?.getAttribute("data-radius-photo");

  it("reports a real decode as loaded and keeps the photo", async () => {
    const onLoaded = vi.fn();
    const onMissing = vi.fn();
    await act(async () =>
      root.render(
        <RadiusPhoto src={PROXY} size={52} onLoaded={onLoaded} onMissing={onMissing} />,
      ),
    );
    await settle(container.querySelector("img")!, "photo");

    expect(frame()).toBe("photo");
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onMissing).not.toHaveBeenCalled();
  });

  it.each(["signal", "error"] as const)(
    "turns a small frame into the category mark on a proxy %s",
    async (outcome) => {
      const onLoaded = vi.fn();
      const onMissing = vi.fn();
      await act(async () =>
        root.render(
          <RadiusPhoto
            src={PROXY}
            size={52}
            category="bar"
            onLoaded={onLoaded}
            onMissing={onMissing}
          >
            <span data-overlay />
          </RadiusPhoto>,
        ),
      );
      await settle(container.querySelector("img")!, outcome);

      expect(frame()).toBe("mark");
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[data-overlay]")).toBeNull();
      expect(onMissing).toHaveBeenCalledTimes(1);
      expect(onLoaded).not.toHaveBeenCalled();
    },
  );

  it("swaps a failed large frame for the caller's typographic fallback", async () => {
    await act(async () =>
      root.render(
        <RadiusPhoto
          src={PROXY}
          size={720}
          className="aspect-[16/9] w-full"
          fallback={<p data-fallback>Venue details</p>}
        />,
      ),
    );
    await settle(container.querySelector("img")!, "signal");

    expect(container.querySelector("[data-fallback]")?.textContent).toBe("Venue details");
    expect(container.querySelector("[data-radius-photo]")).toBeNull();
  });

  it("lets a scope hold the credit until the scoped photo loads", async () => {
    const Card = () => (
      <RadiusPhotoScope src={PROXY} size={720}>
        <RadiusPhotoWhen is="visible">
          <figure>
            <RadiusPhoto size={720} className="h-40 w-full" />
          </figure>
        </RadiusPhotoWhen>
        <RadiusPhotoWhen is="missing">
          <p data-photoless>Bluegrass Jam</p>
        </RadiusPhotoWhen>
        <RadiusPhotoWhen is="ready">
          <p data-credit>Photo by A H · Google Maps</p>
        </RadiusPhotoWhen>
      </RadiusPhotoScope>
    );

    expect(renderToStaticMarkup(<Card />)).not.toContain("Photo by");

    await act(async () => root.render(<Card />));
    expect(container.querySelector("[data-credit]")).toBeNull();
    const img = container.querySelector("img")!;
    expect(new URL(img.getAttribute("src")!, "https://x.test").searchParams.get("fallback"))
      .toBe("signal");

    await settle(img, "photo");
    expect(container.querySelector("[data-credit]")?.textContent).toBe(
      "Photo by A H · Google Maps",
    );
    expect(container.querySelector("[data-photoless]")).toBeNull();
  });

  it("drops the scoped photo and its credit for the photoless layout on a signal", async () => {
    await act(async () =>
      root.render(
        <RadiusPhotoScope src={PROXY} size={720}>
          <RadiusPhotoWhen is="visible">
            <RadiusPhoto size={720} className="h-40 w-full" />
          </RadiusPhotoWhen>
          <RadiusPhotoWhen is="missing">
            <p data-photoless>Bluegrass Jam</p>
          </RadiusPhotoWhen>
          <RadiusPhotoWhen is="ready">
            <p data-credit>Photo by A H</p>
          </RadiusPhotoWhen>
        </RadiusPhotoScope>,
      ),
    );
    await settle(container.querySelector("img")!, "signal");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-credit]")).toBeNull();
    expect(container.querySelector("[data-photoless]")?.textContent).toBe("Bluegrass Jam");
  });
});
