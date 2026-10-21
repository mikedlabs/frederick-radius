import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import MapPeek from "./MapPeek";
import type { MapPinPlace } from "./types";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";

const creek: MapPinPlace = {
  slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
  category: "outdoors", municipality: "frederick", geom: { lat: 39.4143, lng: -77.4105 },
  source: "manual", is_verified: true, open_status: { state: "unknown" },
  short_blurb: "A reviewed place photograph anchors the selected map result.",
};
const meta = {
  title: "Map/Photo-led place preview",
  component: MapPeek,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: {
    component: "The real selected-place preview, using existing exact owned or licensed images. Metadata and anonymous auth are controlled workshop responses. They do not certify current hours. Place facts, independent actions and exact Details opener remain usable if an image fails.",
  } } },
  args: { place: creek, distanceOrigin: null, distanceOriginLabel: "from you", onClose: fn(), onDetails: fn() },
  beforeEach: () => {
    const original = window.fetch;
    const saved = window.localStorage.getItem("fr:saved:v1");
    window.localStorage.removeItem("fr:saved:v1");
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname === "/api/auth/me") return Response.json({ user: null });
      if (url.pathname.startsWith("/api/places/map-card/")) return Response.json({ place: null }, { status: 404 });
      return original(input, init);
    };
    return () => {
      window.fetch = original;
      if (saved === null) window.localStorage.removeItem("fr:saved:v1");
      else window.localStorage.setItem("fr:saved:v1", saved);
    };
  },
  render: args => <div data-app-primary-tab="/map" style={{ minHeight: "100dvh", background: "var(--app-bg-sunken)" }}>
    <div style={{ height: 56 }} aria-hidden />
    <div data-map-preview-host style={{ position: "relative", height: "calc(100dvh - 56px - 68px - env(safe-area-inset-top) - env(safe-area-inset-bottom))" }}>
      <MapPeek {...args} />
    </div>
    <div style={{ height: 68 }} aria-hidden />
  </div>,
} satisfies Meta<typeof MapPeek>;
export default meta;
type Story = StoryObj<typeof meta>;

async function reachable(target: HTMLElement) {
  target.scrollIntoView({ block: "center", inline: "nearest" });
  await waitFor(async () => {
    const box = target.getBoundingClientRect();
    const owner = target.ownerDocument;
    const view = owner.defaultView!;
    const hits = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
      const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy;
      const hit = owner.elementFromPoint(x, y);
      return x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight && hit !== null && target.contains(hit);
    });
    const geometry = JSON.stringify({ label: target.getAttribute("aria-label") ?? target.textContent, box: box.toJSON(), hits });
    await expect(box.width, geometry).toBeGreaterThanOrEqual(44);
    await expect(box.height, geometry).toBeGreaterThanOrEqual(44);
    await expect(hits, geometry).toEqual([true, true, true, true, true]);
  });
}

const checkPreview: NonNullable<Story["play"]> = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const surface = canvasElement.querySelector<HTMLElement>("[data-map-result-surface]")!;
  const image = surface.querySelector<HTMLImageElement>("img")!;
  // A short landscape scrollport can initially clip a native lazy image.
  // Bring the actual photo into view before checking its normal load event.
  image.scrollIntoView({ block: "nearest", inline: "nearest" });
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(image.dataset.mapPeekPhotoState).toBe("ready");
  });
  const host = canvasElement.querySelector<HTMLElement>("[data-map-preview-host]")!;
  const body = surface.querySelector<HTMLElement>(".map-peek-body")!;
  const frame = surface.querySelector<HTMLElement>(".map-peek-visual")!;
  const text = surface.querySelector<HTMLElement>(".map-peek-text")!;
  await canvasElement.ownerDocument.fonts.ready;
  await waitFor(() => expect(new DOMMatrix(getComputedStyle(surface).transform).isIdentity).toBe(true));
  const surfaceBox = surface.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
  // Shared mobile results reserve8px below the card; desktop reserves12px.
  // The preview's height cap must still leave24px total inside its real host.
  await expect(surfaceBox.top).toBeGreaterThanOrEqual(hostBox.top + 8 - 0.5);
  await expect(surfaceBox.bottom).toBeLessThanOrEqual(hostBox.bottom - 8 + 0.5);
  await expect(surfaceBox.height).toBeLessThanOrEqual(hostBox.height - 24 + 0.5);
  await expect(frame.getBoundingClientRect().width).toBeGreaterThan(body.clientWidth - 1);
  await expect(text.getBoundingClientRect().top).toBeGreaterThanOrEqual(frame.getBoundingClientRect().bottom);
  await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
  await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  const details = canvas.getByRole("button", { name: /^Details$/ });
  const directions = canvas.getByRole("link", { name: /^Directions$/ });
  const save = canvas.getByRole("button", { name: /^Save$/ });
  const share = canvas.getByRole("button", { name: `Share ${args.place.name}` });
  const heading = surface.querySelector<HTMLElement>(".map-peek-title-button")!;
  // The name and Details form one row, with current status below it. The
  // primary destination action gets more space than secondary Save/Share.
  await expect(Math.abs(details.getBoundingClientRect().top - heading.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
  await expect(surface.querySelector("[data-map-place-status]")).toHaveTextContent("Hours not posted");
  await expect(surface.querySelector(".map-peek-cat")).toBeNull();
  await expect(directions.getBoundingClientRect().width).toBeGreaterThan(save.getBoundingClientRect().width);
  // The legacy narrow-screen selector hides direct span children. The new
  // face must remain painted, not merely leave a correctly sized blank button.
  const shareFace = share.querySelector<HTMLElement>(":scope > [data-press-face]")!;
  await expect(shareFace).toBeVisible();
  await expect(shareFace.querySelector("svg")).toBeVisible();
  await expect(within(shareFace).getByText("Share")).toBeVisible();
  // Flex-item blockification computes authored inline-flex as flex.
  await expect(getComputedStyle(shareFace).display).toBe("flex");
  for (const target of [details, directions, save, share, canvas.getByRole("button", { name: `Close ${args.place.name}` })]) await reachable(target);
  await expect(directions).toHaveAttribute("target", "_blank");
  await expect(directions).toHaveAttribute("rel", "noopener noreferrer");
  await expect(surface.querySelector("button a, a button")).toBeNull();
  // A native pointer click must hand the actual Details opener to the sheet.
  if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
    const browser = await import("vitest/browser");
    let trusted = false;
    details.addEventListener("pointerdown", event => { trusted = event.isTrusted; }, { once: true });
    await browser.userEvent.click(details);
    await expect(trusted).toBe(true);
  } else await userEvent.click(details);
  await expect(args.onDetails).toHaveBeenCalledOnce();
  await expect(details).toHaveFocus();
  await expect(canvas.getByText("Hours not posted")).toBeVisible();
};

export const OwnedAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: checkPreview };
export const OwnedAt375: Story = { ...OwnedAt320, globals: { viewport: { value: "radiusMobileCompact", isRotated: false } } };
export const OwnedAt390: Story = { ...OwnedAt320, globals: { viewport: { value: "radiusMobile", isRotated: false } } };
export const OwnedAt430: Story = { ...OwnedAt320, globals: { viewport: { value: "radiusMobileLarge", isRotated: false } } };
export const UnknownPhotoAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { place: { ...creek, slug: "workshop-unpictured-place", name: "Sample unpictured place", category: "shops" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull());
    const surface = canvasElement.querySelector<HTMLElement>("[data-map-result-surface]")!;
    await canvasElement.ownerDocument.fonts.ready;
    await waitFor(() => expect(new DOMMatrix(getComputedStyle(surface).transform).isIdentity).toBe(true));
    const frame = canvasElement.querySelector<HTMLElement>(".map-peek-visual")!;
    await expect(frame.getBoundingClientRect().width).toBe(64);
    await expect(frame.getBoundingClientRect().height).toBe(64);
    await expect(canvas.getByText("Hours not posted")).toBeVisible();
    await expect(canvasElement.querySelector(".map-peek-source-credit")).toBeNull();
    for (const target of [canvas.getByRole("button", { name: /^Details$/ }), canvas.getByRole("link", { name: /^Directions$/ }), canvas.getByRole("button", { name: `Close ${args.place.name}` })]) await reachable(target);
    await userEvent.click(canvas.getByRole("button", { name: /^Details$/ }));
    await expect(args.onDetails).toHaveBeenCalledOnce();
  },
};
export const DoubleTextAt320: Story = {
  ...OwnedAt320,
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "200%";
    return () => { root.style.fontSize = previous; };
  },
};
export const LicensedPlace: Story = {
  ...OwnedAt375,
  args: { place: { ...creek, slug: "brewers-alley-frederick", name: "Brewer's Alley", category: "food-drink" } },
  play: async context => {
    await checkPreview(context);
    const canvas = within(context.canvasElement);
    const photo = getLandmarkPhoto(context.args.place.slug)!;
    const sourceLink = canvas.getByRole("link", { name: `Photo by ${photo.author}. Wikimedia Commons` });
    await expect(sourceLink).toHaveTextContent(photo.author);
    await expect(sourceLink).toHaveAttribute("href", photo.source_url);
    const licenseLink = canvas.getByRole("link", { name: photo.license });
    const editSummary = canvas.getByText("Edited photo", { exact: true });
    const fullEdits = canvas.getByText(photo.modifications!, { exact: true });
    await expect(fullEdits).not.toBeVisible();
    for (const target of [sourceLink, licenseLink, editSummary]) await reachable(target);
    editSummary.focus();
    await userEvent.click(editSummary);
    await expect(fullEdits).toBeVisible();
    await expect(editSummary).toHaveFocus();
    for (const target of [sourceLink, licenseLink, editSummary, canvas.getByRole("link", { name: /^Directions$/ }), canvas.getByRole("button", { name: `Close ${context.args.place.name}` })]) await reachable(target);
    await userEvent.click(editSummary);
    await expect(fullEdits).not.toBeVisible();
    await expect(context.args.onDetails).toHaveBeenCalledOnce();
  },
};

export const CatoctinAt390: Story = {
  ...LicensedPlace,
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { place: { ...creek, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace", municipality: "thurmont" } },
};

export const ShortScreenAt320: Story = {
  ...OwnedAt320,
  play: async context => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    await browser.page.viewport(320, 540);
    await checkPreview(context);
  },
};

export const FailedLicensedPhoto: Story = {
  ...LicensedPlace,
  play: async context => {
    await checkPreview(context);
    const canvas = within(context.canvasElement);
    context.canvasElement.querySelector<HTMLImageElement>("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(context.canvasElement.querySelector("img")).toBeNull());
    await expect(context.canvasElement.querySelector(".map-peek-source-credit")).toBeNull();
    await expect(canvas.getByText("Brewer's Alley")).toBeVisible();
    await expect(canvas.getByText("Hours not posted")).toBeVisible();
    for (const target of [canvas.getByRole("button", { name: /^Details$/ }), canvas.getByRole("link", { name: /^Directions$/ }), canvas.getByRole("button", { name: /^Save$/ })]) await reachable(target);
    await expect(context.args.onDetails).toHaveBeenCalledOnce();
  },
};

export const ReducedMotionPress: Story = {
  ...OwnedAt320,
  play: async context => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    if (browser.server.browser !== "chromium") return;
    const protocol = browser.cdp();
    const original = matchMedia("(prefers-reduced-motion: reduce)").matches;
    await protocol.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    try {
      await expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
      await checkPreview(context);
      const details = within(context.canvasElement).getByRole("button", { name: /^Details$/ });
      const face = details.querySelector<HTMLElement>(":scope > [data-press-face]")!;
      const before = details.getBoundingClientRect();
      await browser.userEvent.keyboard("[Space>]");
      try {
        await expect(details.matches(":active")).toBe(true);
        await expect(new DOMMatrix(getComputedStyle(face).transform).isIdentity).toBe(true);
        await expect(["none", "1"]).toContain(getComputedStyle(face).scale);
        await expect(getComputedStyle(details).boxShadow).toContain("inset");
        const held = details.getBoundingClientRect();
        await expect([held.x, held.y, held.width, held.height]).toEqual([before.x, before.y, before.width, before.height]);
        await expect(details.matches(":focus-visible")).toBe(true);
        const css = getComputedStyle(details);
        await expect(parseFloat(css.outlineWidth)).toBeGreaterThanOrEqual(2);
        await expect(parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset)).toBeLessThanOrEqual(0);
      } finally { await browser.userEvent.keyboard("[/Space]"); }
      await expect(context.args.onDetails).toHaveBeenCalledTimes(2);
    } finally {
      await protocol.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: original ? "reduce" : "no-preference" }] });
    }
  },
};

export const ShortLandscapeAt568: Story = {
  ...OwnedAt320,
  play: async context => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    await browser.page.viewport(568, 320);
    await checkPreview(context);
  },
};
