import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MapPeekPhoto } from "./MapPeek";
import styles from "./MapResultSurface.module.css";
import type { PlaceCardPhotoPlan } from "@/lib/place-card-photo";

// Controlled local image transports exercise the actual image/credit/CSS
// lifecycle. Neither photograph depicts the invented fixture venue. There
// are no provider image calls, current venue claims, or credential reads.
const googleFixture = "/from-above/photos/pg-046-3317@800.webp";
const curatedFixture = "/images/seasons/summer/SUMMER CARROL CREEK.jpg";

/** Keep the real image optimizer. The workshop loader encodes local paths
 * and adds sizing parameters; a compiled Next image can wrap the same path. */
function fixtureImagePath(image: HTMLImageElement | null): string | null {
  if (!image) return null;
  const url = new URL(image.currentSrc || image.src, image.ownerDocument.baseURI);
  const source = new URL(url.searchParams.get("url") ?? url.href, image.ownerDocument.baseURI);
  return decodeURIComponent(source.pathname);
}
/** A fallback keeps Details focused, which can scroll the photo out of view.
 * Request and decode the real local image before asserting its ready state. */
async function expectDecodedImage(image: HTMLImageElement) {
  image.scrollIntoView({ block: "nearest" });
  await waitFor(async () => {
    await image.decode();
    const transport = JSON.stringify({ src: image.currentSrc || image.src, complete: image.complete, connected: image.isConnected });
    await expect(image.isConnected, transport).toBe(true);
    await expect(image.complete, transport).toBe(true);
    await expect(image.naturalWidth, transport).toBeGreaterThan(1);
    await expect(image.naturalHeight, transport).toBeGreaterThan(1);
  }, { timeout: 5000 });
}

const plan: PlaceCardPhotoPlan = {
  key: "map-peek-source-transition-component-fixture",
  sources: [
    { kind: "google", src: googleFixture, alt: "Component fixture image transport.", attribution: {
      photo_name: "places/component-fixture/photos/fixture-first",
      google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456",
      authors: [{ display_name: "Component Google fixture", uri: "https://www.google.com/maps/contrib/123" }],
    } },
    { kind: "curated", src: curatedFixture, alt: "Component fixture alternate image transport.", photo: {
      file: "Component fixture.jpg", alt: "Component fixture alternate image transport.",
      author: "Component Commons fixture", license: "CC BY-SA 4.0", verified: true,
      source_url: "https://commons.wikimedia.org/wiki/File:Component_fixture.jpg",
    } },
  ],
};

const meta = {
  title: "Map/Selected photo continuity",
  component: MapPeekPhoto,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: {
    description: { component: "Real map card CSS with controlled local image bytes and labelled source metadata. These fixtures test the selected-card lifecycle; they do not certify a venue photograph or external provider." },
  } },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    plan, placeName: "Sample selected place near Brunswick station", glyph: "S",
    color: "var(--app-brand)", onOpenDetails: fn(),
  },
  render: args => (
    <div data-app-primary-tab="/map" style={{ padding: "12px 10px", width: "100%" }}>
      <section className={`map-peek ${styles.surface}`} aria-label="Selected place component fixture"
        style={{ position: "relative", left: "auto", right: "auto", bottom: "auto" }}>
        <MapPeekPhoto {...args}>
          <div className="map-peek-text">
            <span className="map-peek-cat">Coffee</span>
            <button type="button" className="map-peek-title-button" onClick={args.onOpenDetails}>
              <span className="map-peek-name">{args.placeName}</span>
            </button>
            <span className="map-peek-address">Component fixture address</span>
            <span className="map-peek-meta">Hours not confirmed</span>
            <button type="button" className="map-peek-details-link" onClick={args.onOpenDetails}>Details</button>
          </div>
        </MapPeekPhoto>
        <div className="map-peek-acts">
          <a href="https://www.google.com/maps/dir/?api=1&destination=39.3135,-77.6261"
            target="_blank" rel="noopener noreferrer" className="map-peek-act map-peek-act-go">Directions</a>
          <button type="button" className="map-peek-act">Save</button>
        </div>
      </section>
    </div>
  ),
} satisfies Meta<typeof MapPeekPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FallbackAndExhaustionAt320: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const root = canvasElement.querySelector<HTMLElement>(".map-peek")!;
    const details = canvas.getByRole("button", { name: "Details" });
    const currentImage = () => root.querySelector<HTMLImageElement>("[data-map-peek-photo-source]");
    await waitFor(() => expect(currentImage()?.dataset.mapPeekPhotoSource).toBe("google"), { timeout: 5000 });
    await expectDecodedImage(currentImage()!);
    await waitFor(async () => {
      const image = currentImage();
      await expect(image?.dataset.mapPeekPhotoSource).toBe("google");
      await expect(fixtureImagePath(image)).toBe(googleFixture);
      await expect(image?.dataset.mapPeekPhotoState).toBe("ready");
      await expect(image?.complete).toBe(true);
      await expect(image?.naturalWidth).toBeGreaterThan(1);
      await expect(image?.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    await expect(canvas.getByText("Component Google fixture")).toBeVisible();
    await expect(root.querySelector("button a, a button")).toBeNull();
    await expect(root.querySelectorAll("img")).toHaveLength(1);
    details.focus();
    currentImage()!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(currentImage()?.dataset.mapPeekPhotoSource).toBe("curated"), { timeout: 5000 });
    await expectDecodedImage(currentImage()!);
    await waitFor(async () => {
      const image = currentImage();
      await expect(image?.dataset.mapPeekPhotoSource).toBe("curated");
      await expect(fixtureImagePath(image)).toBe(curatedFixture);
      await expect(image?.dataset.mapPeekPhotoState).toBe("ready");
      await expect(image?.complete).toBe(true);
      await expect(image?.naturalWidth).toBeGreaterThan(1);
      await expect(image?.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    await expect(canvas.queryByText("Component Google fixture")).not.toBeInTheDocument();
    await expect(canvas.getByText("Photo by Component Commons fixture.")).toBeVisible();
    await expect(canvas.getByText("The image is resized for display; previews may be cropped.")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Component_fixture.jpg");
    await expect(canvas.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0");
    await expect(details).toHaveFocus();
    await expect(canvas.getByText("Hours not confirmed")).toBeVisible();
    await expect(root.querySelectorAll("img")).toHaveLength(1);
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    for (const target of [details, ...root.querySelectorAll<HTMLAnchorElement>(".map-peek-source-credit a")]) {
      target.scrollIntoView({ block: "nearest" });
      const box = target.getBoundingClientRect();
      await expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(box.height).toBeGreaterThanOrEqual(44);
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      await expect(hit !== null && target.contains(hit)).toBe(true);
    }
    details.focus();
    currentImage()!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(currentImage()).toBeNull());
    await expect(root.querySelector("[data-map-peek-photo-state=failed]")).not.toBeNull();
    await expect(root.querySelector(".map-peek-source-credit")).toBeNull();
    await expect(details).toHaveFocus();
    await userEvent.click(details);
    await expect(args.onOpenDetails).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("link", { name: "Directions" })).toBeVisible();
  },
};

export const FallbackAndExhaustionAt375: Story = {
  ...FallbackAndExhaustionAt320,
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
};

export const OwnedPhotoAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { plan: { key: "owned-map-component-fixture", sources: [
    { kind: "owned", src: curatedFixture, alt: "Component fixture owned image transport." },
  ] } },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>(".map-peek")!;
    await expectDecodedImage(root.querySelector<HTMLImageElement>("[data-map-peek-photo-source]")!);
    await waitFor(async () => {
      const image = root.querySelector<HTMLImageElement>("[data-map-peek-photo-source]");
      await expect(image?.dataset.mapPeekPhotoSource).toBe("owned");
      await expect(fixtureImagePath(image)).toBe(curatedFixture);
      await expect(image?.dataset.mapPeekPhotoState).toBe("ready");
      await expect(image?.complete).toBe(true);
      await expect(image?.naturalWidth).toBeGreaterThan(1);
      await expect(image?.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    await expect(root.querySelector(".map-peek-source-credit")).toBeNull();
    await expect(root.querySelector("button a, a button")).toBeNull();
  },
};

export const OwnedPhotoAt430: Story = {
  ...OwnedPhotoAt390,
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
};
