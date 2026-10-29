import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import PlaceHero from "./PlaceHero";
import PlaceSheet from "./PlaceSheet";
import PhotoLightbox from "@/components/ui/PhotoLightbox";

/** Bring real bytes into the browser's lazy-load range before checking them.
 * Cold full-suite runs share asset decoding with the rest of the workshop;
 * a one-second polling default is not a transport or performance contract. */
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

/** Prove the same actual control is painted, settled and owns 44px input. */
async function expectReadySave(save: HTMLButtonElement) {
  await waitFor(async () => {
    await expect(save).toBeVisible();
    const before = save.getBoundingClientRect();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const bounds = save.getBoundingClientRect();
    await expect(Math.abs(bounds.x - before.x)).toBeLessThanOrEqual(0.25);
    await expect(Math.abs(bounds.y - before.y)).toBeLessThanOrEqual(0.25);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    for (const [px, py] of [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]]) {
      await expect(px).toBeGreaterThanOrEqual(0);
      await expect(px).toBeLessThan(document.documentElement.clientWidth);
      await expect(py).toBeGreaterThanOrEqual(0);
      await expect(py).toBeLessThan(document.documentElement.clientHeight);
      const hit = document.elementFromPoint(px, py);
      if (hit?.closest("button") !== save) {
        throw new Error(`Save 44px hit missed: ${JSON.stringify({
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
          point: { x: px, y: py }, viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
          hit: hit ? { tag: hit.tagName, role: hit.getAttribute("role"), label: hit.getAttribute("aria-label") } : null,
        })}`);
      }
      await expect(hit?.closest("button")).toBe(save);
    }
  });
}

const slug = "carroll-creek-linear-park-frederick";
const owned = getOwnedPlacePhoto(slug)!;
const place: PlaceCardData = {
  slug, name: "Carroll Creek Linear Park", category: "outdoors", tags: [],
  city: "Frederick", municipality: "frederick", state: "MD", postal_code: "21701",
  address: "Carroll Creek, Frederick, MD", geom: { lng: -77.4105, lat: 39.4143 },
  open_status: { state: "unknown" }, short_blurb: "The park follows Carroll Creek through Frederick.",
  website: "https://www.cityoffrederickmd.gov/169/Carroll-Creek-Park",
  google_hours: ["Monday: 7:00 AM – 10:00 PM"],
  is_verified: false, feature_score: 0, source: "manual", updated_at: "2026-09-01",
  source_id: "component-workshop:carroll-creek", source_url: null,
  license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
};

function SheetFixture() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={opener} type="button" className="tap-44" onClick={() => setOpen(true)}>View Creek details</button>
    <PlaceSheet place={open ? place : null} onClose={() => setOpen(false)}
      historyLayerId="workshop-creek-photo-continuity" returnFocusRef={opener} />
  </>;
}

function OwnedViewerFixture() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="tap-44" onClick={() => setOpen(true)}>Enlarge Creek photo</button>
    {open && <PhotoLightbox sources={[owned]} alt={place.name} onClose={() => setOpen(false)} />}
  </>;
}

const meta = {
  title: "Places/Exact photo continuity", component: PlaceHero,
  parameters: { layout: "centered", nextjs: { navigation: { pathname: "/today" } } },
  beforeEach: () => {
    // BottomSheet dismisses on a real route change. Its workshop router must
    // describe this test document, as in the shared Sheet/EventSheet stories.
    const originalPathname = usePathname.getMockImplementation();
    usePathname.mockReturnValue(window.location.pathname);
    return () => {
      if (originalPathname) usePathname.mockImplementation(originalPathname);
      else usePathname.mockReset();
    };
  },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  decorators: [(Story) => <div style={{ width: "min(343px, calc(100vw - 32px))" }}><Story /></div>],
  args: { slug, name: place.name, category: place.category, priority: true },
} satisfies Meta<typeof PlaceHero>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedFullHero: Story = {
  render: (args) => <PlaceHero {...args} />,
  play: async ({ canvasElement }) => {
    const images = within(canvasElement).getAllByRole("img", { name: owned.alt }) as HTMLImageElement[];
    await expect(images).toHaveLength(1);
    for (const image of images) {
      await expectDecodedImage(image);
      const url = new URL(image.currentSrc, window.location.href);
      await expect(decodeURIComponent(url.searchParams.get("url") ?? url.pathname)).toBe(owned.src);
    }
    await expect(canvasElement.querySelector("[data-place-hero]")).toHaveAttribute("data-place-hero-source", "owned");
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    const opener = within(canvasElement).getByRole("button", { name: `View ${place.name} photo` });
    await expect(opener.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(opener.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(opener);
    const dialog = await within(document.body).findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(dialog).toHaveFocus());
    const viewerImages = within(dialog).getAllByRole("img", { name: owned.alt }) as HTMLImageElement[];
    await expect(viewerImages).toHaveLength(1);
    await expectDecodedImage(viewerImages[0]);
    const viewerUrl = new URL(viewerImages[0].currentSrc, window.location.href);
    await expect(decodeURIComponent(viewerUrl.searchParams.get("url") ?? viewerUrl.pathname)).toBe(owned.src);
    await expect(dialog).toHaveAttribute("data-lightbox-photo-source", "owned");
    await expect(dialog.querySelector("[data-lightbox-photo-credit]")).toBeNull();
    await expect(within(dialog).queryByRole("button", { name: "Next photo" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close photo" }));
    await waitFor(() => expect(opener).toHaveFocus());
    await expect(within(document.body).queryByRole("dialog", { name: "Photo viewer" })).toBeNull();
  },
};

export const OwnedCardRemainsStatic: Story = {
  args: { size: "card" },
  play: async ({ canvasElement }) => {
    const image = within(canvasElement).getByRole("img", { name: owned.alt }) as HTMLImageElement;
    await expectDecodedImage(image);
    await expect(canvasElement.querySelector("[data-place-hero]")).toHaveAttribute("data-place-hero-source", "owned");
    await expect(within(canvasElement).queryByRole("button", { name: `View ${place.name} photo` })).toBeNull();
  },
};

export const ExhaustedHeroCollapses: Story = {
  render: (args) => <><PlaceHero {...args} /><h1>{place.name}</h1><p>{place.address}</p></>,
  play: async ({ canvasElement }) => {
    // Exercise the real owned → curated → exhausted state, without treating
    // a dispatched event as proof of an upstream transport response.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const image = canvasElement.querySelector("[data-place-hero] img");
      if (!image) break;
      const src = image.getAttribute("src");
      image.dispatchEvent(new Event("error"));
      await waitFor(() => expect(canvasElement.querySelector("[data-place-hero] img")?.getAttribute("src")).not.toBe(src));
    }
    const hero = canvasElement.querySelector("[data-place-hero]")!;
    await expect(hero).toHaveAttribute("data-place-hero-source", "none");
    await expect(hero.getBoundingClientRect().height).toBe(148);
    await expect(within(canvasElement).queryByRole("button", { name: `View ${place.name} photo` })).toBeNull();
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(within(canvasElement).getByRole("heading", { name: place.name })).toBeVisible();
    await expect(within(canvasElement).getByText(place.address)).toBeVisible();
  },
};

export const OwnedSheetKeepsFactsAfterFailure: Story = {
  render: () => <SheetFixture />,
  play: async ({ canvasElement }) => {
    const originalHref = window.location.href;
    const originalState = window.history.state;
    const originalOverflow = document.body.style.overflow;
    const canvas = within(canvasElement);
    const opener = canvas.getByRole("button", { name: "View Creek details" });
    await userEvent.click(opener);
    const body = within(document.body);
    const dialog = await body.findByRole("dialog", { name: place.name });
    const sheet = within(dialog);
    const image = sheet.getByRole("img", { name: owned.alt }) as HTMLImageElement;
    await expectDecodedImage(image);
    await expect(dialog.querySelector("[data-place-sheet-photo]")).toHaveAttribute("data-place-sheet-photo-source", "owned");
    const save = dialog.querySelector<HTMLButtonElement>(`button[data-save-ref="place:${slug}"]`)!;
    await waitFor(() => expect(save).not.toHaveAttribute("aria-hidden", "true"));
    const saveLabel = save.getAttribute("aria-label");
    await expect(save.closest('[aria-label="View Carroll Creek Linear Park photos"]')).toBeNull();
    await expect(sheet.getAllByRole("heading", { name: place.name })).toHaveLength(1);
    const directions = sheet.getByRole("link", { name: "Directions" });
    const directionsHref = directions.getAttribute("href");
    // Failures arriving after an actually painted, usable Save control must
    // preserve that same control. Image decode alone can precede its staggered
    // entrance; do not inject late errors into an unready opening animation.
    await expectReadySave(save);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = dialog.querySelector("[data-place-sheet-photo] img");
      if (!current) break;
      const src = current.getAttribute("src");
      current.dispatchEvent(new Event("error"));
      await waitFor(() => expect(dialog.querySelector("[data-place-sheet-photo] img")?.getAttribute("src")).not.toBe(src));
    }
    await expect(dialog.querySelector("[data-place-sheet-photo]")).toBeNull();
    await expect(save.isConnected).toBe(true);
    await expect(dialog.querySelector(`button[data-save-ref="place:${slug}"]`)).toBe(save);
    await expect(sheet.getByRole("heading", { name: place.name })).toBeVisible();
    await expect(save).toBeVisible();
    await expect(save).toHaveAttribute("aria-label", saveLabel!);
    await expectReadySave(save);
    await expect(directions).toHaveAttribute("href", directionsHref!);
    await expect(sheet.getByText("Monday", { exact: true })).toBeInTheDocument();
    await expect(sheet.getByText("7:00 AM – 10:00 PM", { exact: true })).toBeInTheDocument();
    await expect(sheet.getByText(/Carroll Creek, Frederick, MD/)).toBeVisible();
    await expect(sheet.getByText("Radius reviewed", { exact: false })).toBeInTheDocument();
    await userEvent.click(sheet.getByRole("button", { name: "Close place details" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: place.name })).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
    // Close consumes this exact owned history entry before the next story
    // observes the document; focus return alone may precede traversal.
    await waitFor(() => expect(window.history.state).toEqual(originalState));
    await expect(window.location.href).toBe(originalHref);
    await expect(document.body.style.overflow).toBe(originalOverflow);
  },
};

export const OwnedViewerHasNoProviderCredit: Story = {
  render: () => <OwnedViewerFixture />,
  play: async ({ canvasElement }) => {
    const opener = within(canvasElement).getByRole("button", { name: "Enlarge Creek photo" });
    await userEvent.click(opener);
    const dialog = await within(document.body).findByRole("dialog", { name: "Photo viewer" });
    const image = within(dialog).getByRole("img", { name: owned.alt }) as HTMLImageElement;
    await expectDecodedImage(image);
    await expect(dialog.querySelector("[data-lightbox-photo-credit]")).toBeNull();
    await expect(dialog).toHaveAttribute("data-lightbox-photo-source", "owned");
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(within(dialog).getByText("These photos are unavailable.")).toBeVisible());
    await userEvent.click(within(dialog).getByRole("button", { name: "Close photo" }));
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const FullHeroReturnsOnBrowserBack: Story = {
  render: (args) => <PlaceHero {...args} />,
  play: async ({ canvasElement }) => {
    const originalHref = window.location.href;
    const originalState = window.history.state;
    const originalOverflow = document.body.style.overflow;
    const opener = within(canvasElement).getByRole("button", { name: `View ${place.name} photo` });
    await userEvent.click(opener);
    const body = within(document.body);
    const viewer = await body.findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(viewer).toHaveFocus());
    await expect(window.history.state?.__frederickRadiusLayer).toMatch(/^photo:/);
    await expect(window.location.href).toBe(originalHref);
    await expect(document.body.style.overflow).toBe("hidden");

    // Real browser traversal, not a synthetic popstate or a mocked Back call.
    window.history.back();
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
    await waitFor(() => expect(window.history.state).toEqual(originalState));
    await expect(window.location.href).toBe(originalHref);
    await expect(document.body.style.overflow).toBe(originalOverflow);
    await expect(within(canvasElement).getByRole("img", { name: owned.alt })).toBeVisible();
  },
};

export const HeroFailureKeepsViewerUntilBrowserBack: Story = {
  render: (args) => <><PlaceHero {...args} /><h1>{place.name}</h1><p>{place.address}</p></>,
  play: async ({ canvasElement }) => {
    const originalHref = window.location.href;
    const originalState = window.history.state;
    const canvas = within(canvasElement);
    const heroImage = canvas.getByRole("img", { name: owned.alt }) as HTMLImageElement;
    await expectDecodedImage(heroImage);
    await userEvent.click(canvas.getByRole("button", { name: `View ${place.name} photo` }));
    const body = within(document.body);
    const viewer = await body.findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(viewer).toHaveFocus());

    // A late error in the actual hero must not remove the open viewer or
    // leave its newly owned history stop without a usable dismissal action.
    heroImage.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("[data-place-hero]")).not.toHaveAttribute("data-place-hero-source", "owned"));
    // Focus and the hero error can precede the viewer’s first painted frame.
    // Keep the entry-time failure, then require the same viewer to be visible.
    await waitFor(() => expect(viewer).toBeVisible());
    await expect(viewer).toHaveAttribute("data-lightbox-photo-source", "owned");
    const viewerImage = within(viewer).getByRole("img", { name: owned.alt });
    viewerImage.dispatchEvent(new Event("error"));
    await waitFor(() => expect(within(viewer).getByText("These photos are unavailable.")).toBeVisible());
    await expect(within(viewer).getByRole("button", { name: "Close photo" })).toBeVisible();
    await expect(window.history.state?.__frederickRadiusLayer).toMatch(/^photo:/);

    window.history.back();
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
    await waitFor(() => expect(window.history.state).toEqual(originalState));
    await expect(window.location.href).toBe(originalHref);
    await expect(canvas.getByRole("heading", { name: place.name })).toBeVisible();
    await expect(canvas.getByText(place.address)).toBeVisible();
  },
};

export const SheetViewerBackAndEscapeKeepPlaceOpen: Story = {
  render: () => <SheetFixture />,
  play: async ({ canvasElement }) => {
    const originalHref = window.location.href;
    const originalState = window.history.state;
    const originalOverflow = document.body.style.overflow;
    const sheetOpener = within(canvasElement).getByRole("button", { name: "View Creek details" });
    await userEvent.click(sheetOpener);
    const body = within(document.body);
    const sheet = await body.findByRole("dialog", { name: place.name });
    const parentState = window.history.state;
    await expect(parentState?.__frederickRadiusLayer).toBe("workshop-creek-photo-continuity");
    const photoOpener = within(sheet).getByRole("button", { name: `View ${place.name} photos` });

    await userEvent.click(photoOpener);
    let viewer = await body.findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(viewer).toHaveFocus());
    await expect(window.history.state?.__frederickRadiusLayer).toMatch(/^photo:/);
    window.history.back();
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
    await waitFor(() => expect(photoOpener).toHaveFocus());
    await waitFor(() => expect(window.history.state).toEqual(parentState));
    await expect(sheet).toBeVisible();
    await expect(document.body.style.overflow).toBe("hidden");

    // The viewer is a React portal beneath BottomSheet in the component tree.
    // A real Escape must close only the photo, not bubble into that parent.
    await userEvent.click(photoOpener);
    viewer = await body.findByRole("dialog", { name: "Photo viewer" });
    await waitFor(() => expect(viewer).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Photo viewer" })).toBeNull());
    await waitFor(() => expect(photoOpener).toHaveFocus());
    await waitFor(() => expect(window.history.state).toEqual(parentState));
    await expect(sheet).toBeVisible();
    await expect(within(sheet).getByRole("heading", { name: place.name })).toBeVisible();
    await expect(document.body.style.overflow).toBe("hidden");

    // Only the next Back dismisses the place and returns to its own opener.
    window.history.back();
    await waitFor(() => expect(body.queryByRole("dialog", { name: place.name })).toBeNull());
    await waitFor(() => expect(sheetOpener).toHaveFocus());
    await waitFor(() => expect(window.history.state).toEqual(originalState));
    await expect(window.location.href).toBe(originalHref);
    await expect(document.body.style.overflow).toBe(originalOverflow);
  },
};
