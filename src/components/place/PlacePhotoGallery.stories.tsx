import { useState } from "react";
import { PlaceCardPhotoCredit } from "./PlaceCardPhoto";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { getOwnedPlacePhoto, getOwnedPlacePhotos } from "@/lib/owned-place-photos";
import { getLandmarkPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
import type { PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { PlacePhotoGalleryView } from "./PlacePhotoGallery";

const slug = "carroll-creek-linear-park-frederick";
const name = "Carroll Creek Linear Park";
const owned = getOwnedPlacePhoto(slug)!;
const commons = getLandmarkPhoto(slug)!;
// Component fixture composition: these two exact Creek sources already
// exist. This does not claim production publishes both as gallery inventory.
const sources: readonly PlaceCardPhotoSource[] = [
  owned,
  { kind: "curated", src: wikimediaUrl(commons.file, 720), alt: commons.alt, photo: commons },
];

function GalleryFixture() {
  return (
    <div data-gallery-lifecycle-fixture onErrorCapture={(event) => {
      // Hold only this controlled component fixture's image-error lifecycle
      // until play releases the late clicked-thumbnail failure. Real source
      // records and credit/decode guards stay intact; this is not a provider
      // health or successfully decoded-image claim.
      if (event.currentTarget.dataset.releaseGalleryFailures !== "true") event.stopPropagation();
    }}>
      <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>Two existing Creek photo sources are composed for this component fixture.</p>
      <h1>{name}</h1>
      <p>Carroll Creek, Frederick, MD</p>
      <PlacePhotoGalleryView sources={sources} name={name} />
    </div>
  );
}

const meta = {
  title: "Places/Photo gallery",
  component: PlacePhotoGalleryView,
  parameters: { layout: "centered", nextjs: { navigation: { pathname: "/places/carroll-creek-linear-park-frederick" } } },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  args: { sources, name },
  decorators: [(Story) => <div style={{ width: "min(343px, calc(100vw - 32px))" }}><Story /></div>],
} satisfies Meta<typeof PlacePhotoGalleryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewedOwnerLibraryPhotos: Story = {
  args: { sources: getOwnedPlacePhotos("visitation-hotel"), name: "Visitation Hotel" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const opener = canvas.getByRole("button", { name: "View Visitation Hotel photo 2" });
    const thumbnail = opener.querySelector<HTMLImageElement>("img")!;
    await thumbnail.decode();
    await expect(thumbnail.naturalWidth).toBeGreaterThan(1);
    const box = opener.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    const previousState = window.history.state;
    await userEvent.click(opener);
    const viewer = await body.findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(viewer).toHaveFocus());
    await expect(viewer).toHaveAttribute("data-lightbox-photo-source", "owned");
    const image = within(viewer).getByRole("img") as HTMLImageElement;
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(viewer.querySelector("[data-lightbox-photo-credit]")).toBeNull();
    await userEvent.click(within(viewer).getByRole("button", { name: "Close photo" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
    await waitFor(() => expect(window.history.state).toEqual(previousState));
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const LateThumbnailFailureKeepsViewerAndNativeBack: Story = {
  render: () => <GalleryFixture />,
  play: async ({ canvasElement }) => {
    const originalHref = window.location.href;
    const originalState = window.history.state;
    const originalOverflow = document.body.style.overflow;
    const canvas = within(canvasElement);
    const body = within(document.body);
    const fixture = canvasElement.querySelector<HTMLElement>("[data-gallery-lifecycle-fixture]")!;
    const opener = canvas.getByRole("button", { name: `View ${name} photo 2` });
    const thumbnail = opener.querySelector<HTMLImageElement>("img")!;
    const resolvedSrc = (image: HTMLImageElement, source: PlaceCardPhotoSource) => {
      const url = new URL(image.currentSrc || image.src, window.location.href);
      const wrappedSource = url.searchParams.get("url");
      if (wrappedSource) return wrappedSource;
      const expected = new URL(source.src, window.location.href);
      // Storybook can append optimizer parameters directly. Remove only its
      // extra sizing keys; retain the exact original photo and source query.
      for (const key of ["w", "q"]) {
        if (!expected.searchParams.has(key)) url.searchParams.delete(key);
      }
      return `${url.origin}${url.pathname}${url.search}`;
    };
    await expect(resolvedSrc(thumbnail, sources[1])).toBe(sources[1].src);
    try {
      // Ordinary Close preserves the real source, removes its history entry,
      // and restores the still-present thumbnail opener.
      await userEvent.click(opener);
      let viewer = await body.findByRole("dialog", { name: "Photo viewer" });
      await waitFor(() => expect(viewer).toHaveFocus());
      await expect(viewer).toHaveAttribute("data-lightbox-photo-source", "curated");
      await expect(resolvedSrc(within(viewer).getByRole("img", { name: commons.alt }) as HTMLImageElement, sources[1])).toBe(sources[1].src);
      await expect(window.history.state?.__frederickRadiusLayer).toMatch(/^photo:/);
      await userEvent.click(within(viewer).getByRole("button", { name: "Close photo" }));
      await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
      await waitFor(() => expect(window.history.state).toEqual(originalState));
      await waitFor(() => expect(opener).toHaveFocus());

      // Reopen, then deliver the actual clicked thumbnail's late native error.
      // The one-photo rail collapses; the viewer must keep its opening snapshot
      // and its own failure/credit state until the user explicitly leaves it.
      await userEvent.click(opener);
      viewer = await body.findByRole("dialog", { name: "Photo viewer" });
      await waitFor(() => expect(viewer).toHaveFocus());
      const viewerState = window.history.state;
      await expect(viewerState?.__frederickRadiusLayer).toMatch(/^photo:/);
      fixture.dataset.releaseGalleryFailures = "true";
      thumbnail.dispatchEvent(new Event("error"));
      await waitFor(() => expect(canvas.queryByRole("heading", { name: "Photos" })).toBeNull());
      await expect(canvas.queryByRole("button", { name: `View ${name} photo 2` })).toBeNull();
      await expect(body.getByRole("dialog", { name: "Photo viewer" })).toBeVisible();
      await expect(window.history.state).toEqual(viewerState);
      await expect(canvas.getByRole("heading", { name })).toBeVisible();
      await expect(canvas.getByText("Carroll Creek, Frederick, MD")).toBeVisible();
      // Existing decode gating must not attach a credit to an image it has
      // never loaded. When present, it remains tied to this exact Commons row.
      const credit = viewer.querySelector<HTMLElement>("[data-lightbox-photo-credit]");
      if (credit) {
        await expect(within(credit).getByText("Photo by " + commons.author + ".")).toBeVisible();
        await expect(within(credit).getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", commons.source_url);
      }

      window.history.back();
      await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
      await waitFor(() => expect(window.history.state).toEqual(originalState));
      await expect(window.location.href).toBe(originalHref);
      await expect(document.body.style.overflow).toBe(originalOverflow);
      await expect(canvas.getByRole("heading", { name })).toBeVisible();
      await expect(canvas.getByText("Carroll Creek, Frederick, MD")).toBeVisible();
    } finally {
      const remaining = body.queryByRole("button", { name: "Close photo" });
      if (remaining) await userEvent.click(remaining);
      delete fixture.dataset.releaseGalleryFailures;
      // Cleanup is separate from the history equality assertions above.
      window.history.replaceState(originalState, "", originalHref);
      document.body.style.overflow = originalOverflow;
    }
  },
};


function ResolvedCreditFixture() {
  const [stage, setStage] = useState<"pending" | "loaded" | "failed">("pending");
  return (
    <div data-resolved-credit-fixture>
      <h1>Creek source credit</h1>
      <p className="text-sm">Controlled component credit states use the existing Commons Creek record. This fixture does not claim image decoding or provider health.</p>
      <PlaceCardPhotoCredit source={stage === "failed" ? null : sources[1]} loaded={stage === "loaded"} />
      <button type="button" className="tap-44" onClick={() => setStage("loaded")}>Resolve fixture credit</button>
      <button type="button" className="tap-44" onClick={() => setStage("failed")}>Exhaust fixture source</button>
    </div>
  );
}

/** The production stylesheet is imported by .storybook/preview.tsx. A credit
 * outside the card button must reserve its pending slot and become readable
 * when its actual owner passes loaded, including gallery/hero/viewer callers.
 * This controlled state composition is independent of provider transport. */
export const ResolvedCreditVisibilityOutsideCardButton: Story = {
  render: () => <ResolvedCreditFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const credit = canvasElement.querySelector<HTMLElement>(".place-card-photo-credit")!;
    const resolve = canvas.getByRole("button", { name: "Resolve fixture credit" });
    // Establish the real global CSS is present; do not override display or
    // fabricate image dimensions to make a source-policy check pass.
    await expect(getComputedStyle(document.documentElement).getPropertyValue("--app-bg").trim()).not.toBe("");
    await expect(credit).toHaveAttribute("aria-hidden", "true");
    await expect(credit).toHaveAttribute("inert");
    await expect(credit).not.toBeVisible();
    const pendingRect = credit.getBoundingClientRect();
    await expect(pendingRect.height).toBeGreaterThan(0);
    await expect(pendingRect.width).toBeGreaterThan(0);
    for (const link of credit.querySelectorAll<HTMLAnchorElement>("a")) {
      link.focus();
      await expect(link).not.toHaveFocus();
    }
    await userEvent.click(resolve);
    await waitFor(() => expect(credit).toBeVisible());
    await expect(credit).not.toHaveAttribute("aria-hidden");
    await expect(credit).not.toHaveAttribute("inert");
    await expect(within(credit).getByText("Photo by " + commons.author + ".")).toBeVisible();
    await expect(within(credit).getByText("The image is resized for display; previews may be cropped.")).toBeVisible();
    const source = within(credit).getByRole("link", { name: "Wikimedia Commons" });
    const license = within(credit).getByRole("link", { name: commons.license });
    await expect(source).toHaveAttribute("href", commons.source_url);
    await expect(license).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0");
    await expect(credit.closest("button")).toBeNull();
    const loadedRect = credit.getBoundingClientRect();
    await expect({ width: loadedRect.width, height: loadedRect.height }).toEqual({ width: pendingRect.width, height: pendingRect.height });
    for (const link of [source, license]) {
      await expect(link).toBeVisible();
      const rect = link.getBoundingClientRect();
      await expect(rect.width).toBeGreaterThanOrEqual(44);
      await expect(rect.height).toBeGreaterThanOrEqual(44);
      await userEvent.tab();
    }
    source.focus();
    await expect(source).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Exhaust fixture source" }));
    await waitFor(() => expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull());
    await expect(canvas.getByRole("heading", { name: "Creek source credit" })).toBeVisible();
  },
};
