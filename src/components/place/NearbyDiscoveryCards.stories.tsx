import { useLayoutEffect, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import PlaceCard from "./PlaceCard";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

const creek: PlaceCardData = {
  slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
  category: "park", tags: [], city: "Frederick", municipality: "frederick",
  open_status: { state: "unknown" }, short_blurb: "", state: "MD", postal_code: "21701",
  is_verified: false, feature_score: 0, source: "manual", updated_at: "2026-09-01",
  source_id: "component-workshop:nearby-creek", source_url: null,
  license: "Demonstration fixture", confidence: "curated", first_seen_at: "2026-09-01T12:00:00Z",
  last_verified_at: "2026-09-01T12:00:00Z", address: "Carroll Creek between East St and Bentz St",
  geom: { lng: -77.4083747, lat: 39.412786499999996 },
};
const meta = {
  title: "Places/Nearby discovery", component: PlaceCard, tags: ["autodocs"],
  parameters: { layout: "centered", a11y: { test: "error" } },
  decorators: [(Story) => <div style={{ width: 358, maxWidth: "calc(100vw - 32px)" }}><Story /></div>],
  args: { place: creek, variant: "discovery", discoverySurface: "nearby", lazyPhoto: true },
} satisfies Meta<typeof PlaceCard>;
export default meta;
type Story = StoryObj<typeof meta>;

async function nearbyActions(canvasElement: HTMLElement, address = creek.address!) {
  await document.fonts.ready;
  const canvas = within(canvasElement);
  const open = canvas.getByRole("button", { name: /^View / });
  const save = canvas.getByRole("button", { name: /^Save |^Remove / });
  const directions = canvas.getByRole("link", { name: /^Directions to / });
  const article = canvasElement.querySelector<HTMLElement>("article")!;
  expect(article.dataset.placeCardSurface).toBe("nearby");
  for (const control of [open, save, directions]) {
    control.scrollIntoView({ block: "center" });
    await expect(control).toBeVisible();
    const rect = control.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(48);
    expect(rect.height).toBeGreaterThanOrEqual(48);
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    for (const [px, py] of [[x, y], [rect.left + 1, y], [rect.right - 1, y], [x, rect.top + 1], [x, rect.bottom - 1]]) {
      const hit = document.elementFromPoint(px, py);
      expect(hit === control || Boolean(hit && control.contains(hit))).toBe(true);
    }
    expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth);
  }
  expect(open.contains(save)).toBe(false);
  expect(open.contains(directions)).toBe(false);
  expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
  expect(canvas.getAllByText("Hours not confirmed")).toHaveLength(1);
  expect(canvas.getByText(address)).toBeVisible();
}

async function realOwnedPhoto(canvasElement: HTMLElement) {
  const image = canvasElement.querySelector<HTMLImageElement>('[data-place-card-photo-source="owned"] img')!;
  image.scrollIntoView({ block: "center" });
  await waitFor(async () => {
    await image.decode();
    expect(image.naturalWidth).toBeGreaterThan(1);
    expect(image.naturalHeight).toBeGreaterThan(1);
  }, { timeout: 5000 });
  expect(localImagePath(image)).toBe(getOwnedPlacePhoto(creek.slug)!.src);
  expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  const photoBox = image.closest("[data-place-card-photo]")!.getBoundingClientRect();
  const articleBox = image.closest("article")!.getBoundingClientRect();
  expect(photoBox.width).toBeGreaterThanOrEqual(articleBox.width * 0.95);
  expect(photoBox.width / photoBox.height).toBeCloseTo(16 / 9, 1);
}

export const OwnedPhoto: Story = {
  play: async ({ canvasElement }) => {
    await realOwnedPhoto(canvasElement);
    await nearbyActions(canvasElement);
  },
};

export const NarrowPhone: Story = {
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  play: OwnedPhoto.play,
};

function DoubledText({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "32px";
    return () => { document.documentElement.style.fontSize = previous; };
  }, []);
  return <div style={{ width: 288 }}>{children}</div>;
}

export const NarrowDoubledText: Story = {
  decorators: [(Story) => <DoubledText><Story /></DoubledText>],
  parameters: { docs: { description: { story: "Uses an actual 32px root font in a 288px card. The address, hours, and independent controls wrap without clipping." } } },
  play: async ({ canvasElement }) => {
    await realOwnedPhoto(canvasElement);
    await nearbyActions(canvasElement);
    expect(getComputedStyle(within(canvasElement).getByRole("heading", { name: creek.name })).fontSize).toBe("46px");
    const article = canvasElement.querySelector("article")!;
    for (const label of article.querySelectorAll<HTMLElement>("h3, p, [data-save-ref], a[aria-label^='Directions']")) {
      expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
    }
  },
};

export const NoReviewedPhoto: Story = {
  args: { lazyPhoto: false, place: { ...creek, slug: "carroll-creek-promenade", name: "Carroll Creek Promenade", address: "38 S Market St", geom: { lng: -77.410789132118, lat: 39.413000129744 } } },
  play: async ({ canvasElement }) => {
    await nearbyActions(canvasElement, "38 S Market St");
    expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull();
    expect(canvasElement.querySelector("article")!.getBoundingClientRect().height).toBeLessThan(300);
    await expect(within(canvasElement).getByRole("heading", { name: "Carroll Creek Promenade" })).toBeVisible();
  },
};

/** Storybook may wrap a local image in its Next image URL, whose url value
 * can itself be an absolute same-origin image with rendition query parameters.
 * Compare the real subject path, while rejecting either external transport. */
function localImagePath(image: HTMLImageElement): string {
  const transport = new URL(image.currentSrc || image.src, document.baseURI);
  expect(transport.origin).toBe(location.origin);
  const nested = transport.searchParams.get("url");
  const source = nested ? new URL(nested, transport) : transport;
  expect(source.origin).toBe(location.origin);
  return decodeURIComponent(source.pathname);
}

export const LicensedLocalPhoto: Story = {
  args: { place: { ...creek, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", category: "museum", address: "1110 Rosemont Ave, Frederick, MD 21701", geom: { lng: -77.4269867, lat: 39.4235725 } } },
  play: async ({ canvasElement }) => {
    await nearbyActions(canvasElement, "1110 Rosemont Ave, Frederick, MD 21701");
    const source = getLandmarkPhoto("schifferstadt-architectural-museum-frederick")!;
    const image = canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo] img")!;
    image.scrollIntoView({ block: "center" });
    await waitFor(async () => {
      await image.decode();
      expect(image.naturalWidth).toBeGreaterThan(1);
      expect(canvasElement.querySelector(".place-card-photo-credit")?.hasAttribute("inert")).toBe(false);
    });
    expect(localImagePath(image)).toBe(source.localSrc);
    const credit = canvasElement.querySelector(".place-card-photo-credit")!;
    expect(credit.textContent).toContain(source.author);
    expect(credit.textContent).toContain(source.modifications);
    expect(credit.querySelector(`a[href="${source.licenseUrl}"]`)).not.toBeNull();
    expect(credit.closest("button")).toBeNull();
  },
};

export const PhotoFailureKeepsFacts: Story = {
  args: LicensedLocalPhoto.args,
  play: async (context) => {
    await LicensedLocalPhoto.play!(context);
    const image = context.canvasElement.querySelector<HTMLImageElement>("[data-place-card-photo] img")!;
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(context.canvasElement.querySelector("[data-place-card-photo]")).toBeNull());
    expect(context.canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await nearbyActions(context.canvasElement, "1110 Rosemont Ave, Frederick, MD 21701");
  },
};

export const DirectionsKeyboardFocus: Story = {
  render: (args) => <div><p>Choose a place or get directions.</p><PlaceCard {...args} /></div>,
  play: async ({ canvasElement }) => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    const canvas = within(canvasElement);
    const instruction = canvas.getByText("Choose a place or get directions.");
    let trusted = false;
    instruction.addEventListener("pointerdown", event => { trusted = event.isTrusted; }, { once: true });
    await browser.userEvent.click(instruction);
    expect(trusted).toBe(true);
    const tab = browser.server.browser === "webkit" && browser.server.platform === "darwin" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
    await browser.userEvent.keyboard(tab);
    expect(canvas.getByRole("button", { name: /^View / })).toHaveFocus();
    await browser.userEvent.keyboard(tab);
    expect(canvas.getByRole("button", { name: /^Save |^Remove / })).toHaveFocus();
    await browser.userEvent.keyboard(tab);
    const directions = canvas.getByRole("link", { name: /^Directions to / });
    expect(directions).toHaveFocus();
    expect(directions.matches(":focus-visible")).toBe(true);
    const focus = getComputedStyle(directions);
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(focus.outlineOffset) + parseFloat(focus.outlineWidth)).toBeLessThanOrEqual(0);
    expect(focus.outlineColor).toBe(focus.color);
    expect(focus.outlineColor).not.toBe(focus.backgroundColor);
    expect(directions.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  },
};
