import { useLayoutEffect, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import PlaceCard from "./PlaceCard";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import nearbyStyles from "@/components/now/RightNow.module.css";

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
    const art = canvasElement.querySelector<HTMLElement>("[data-nearby-category-art]")!;
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.querySelector("svg")).not.toBeNull();
    expect(art.getBoundingClientRect().width).toBeGreaterThanOrEqual(60);
    expect(canvasElement.querySelector("article")!.getBoundingClientRect().height).toBeLessThan(300);
    await expect(within(canvasElement).getByRole("heading", { name: "Carroll Creek Promenade" })).toBeVisible();
  },
};

export const RestaurantWithoutPhoto320: Story = {
  args: { lazyPhoto: false, place: { ...creek, slug: "olde-town-restaurant-mount-airy", name: "Olde Town Restaurant",
    category: "restaurant", city: "Mount Airy", municipality: "mount-airy", postal_code: "21771",
    address: "206 S Main St, Mt Airy, MD 21771", geom: { lng: -77.1552773, lat: 39.3761508 } } },
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await nearbyActions(canvasElement, "206 S Main St, Mt Airy, MD 21771");
    expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull();
    expect(canvasElement.querySelector('[data-nearby-category-art][aria-hidden="true"]')).not.toBeNull();
    const actions = canvasElement.querySelector<HTMLElement>("[data-save-ref]")!.parentElement!;
    expect(getComputedStyle(actions).gridTemplateColumns.trim().split(/\s+/)).toHaveLength(2);
  },
};

export const RestaurantWithoutPhoto390: Story = {
  args: RestaurantWithoutPhoto320.args,
  play: RestaurantWithoutPhoto320.play,
};

export const NoPhotoNarrowDoubledText: Story = {
  args: NoReviewedPhoto.args,
  decorators: [(Story) => <DoubledText><Story /></DoubledText>],
  play: async ({ canvasElement }) => {
    await nearbyActions(canvasElement, "38 S Market St");
    const article = canvasElement.querySelector<HTMLElement>("article")!;
    expect(article.querySelector("[data-nearby-category-art]")).not.toBeNull();
    const actions = article.querySelector<HTMLElement>("[data-save-ref]")!.parentElement!;
    expect(getComputedStyle(actions).gridTemplateColumns.trim().split(/\s+/)).toHaveLength(1);
    for (const label of article.querySelectorAll<HTMLElement>("h3, p, [data-save-ref], a[aria-label^='Directions']")) {
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
      expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);
    }
    for (const [control, label] of [[within(article).getByRole("button", { name: /^Save / }), "Save"],
      [within(article).getByRole("link", { name: /^Directions to / }), "Directions"]] as const) {
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      let text: Node | null = walker.nextNode();
      while (text && text.textContent?.trim() !== label) text = walker.nextNode();
      expect(text).not.toBeNull();
      const range = document.createRange();
      range.selectNodeContents(text!);
      // Also exercise wider text metrics, as system fonts differ by platform.
      // Restore the inline value so this remains the actual shipped design.
      const spacing = control.style.letterSpacing;
      for (const candidate of [spacing, "0.08em"]) {
        control.style.letterSpacing = candidate;
        expect(range.getClientRects()).toHaveLength(1);
        expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
      }
      control.style.letterSpacing = spacing;
    }
  },
};

function DarkAppearance({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-appearance");
    root.setAttribute("data-appearance", "dark");
    return () => { if (previous === null) root.removeAttribute("data-appearance"); else root.setAttribute("data-appearance", previous); };
  }, []);
  return <div style={{ width: 288 }}>{children}</div>;
}

export const NoPhotoDark: Story = {
  args: NoReviewedPhoto.args,
  decorators: [(Story) => <DarkAppearance><Story /></DarkAppearance>],
  play: async ({ canvasElement }) => {
    await nearbyActions(canvasElement, "38 S Market St");
    const art = canvasElement.querySelector<HTMLElement>("[data-nearby-category-art]")!;
    expect(getComputedStyle(art).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
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

/** A mixed result list: the fallback must never look like or replace the
 * credited, exact-place photograph immediately above it. */
export const MixedDiscoveryMobile: Story = {
  decorators: [(Story) => <div style={{ width: 288 }}><Story /></div>],
  render: (args) => <div style={{ display: "grid", gap: 12 }}>
    <div data-mixed-photo><PlaceCard {...args} place={{ ...creek, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum", category: "museum", address: "1110 Rosemont Ave, Frederick, MD 21701", geom: { lng: -77.4269867, lat: 39.4235725 } }} /></div>
    <div data-mixed-fallback><PlaceCard {...args} {...RestaurantWithoutPhoto320.args} /></div>
  </div>,
  play: async ({ canvasElement }) => {
    const photo = canvasElement.querySelector<HTMLElement>("[data-mixed-photo]")!;
    const fallback = canvasElement.querySelector<HTMLElement>("[data-mixed-fallback]")!;
    await nearbyActions(photo, "1110 Rosemont Ave, Frederick, MD 21701");
    await nearbyActions(fallback, "206 S Main St, Mt Airy, MD 21771");
    const image = photo.querySelector<HTMLImageElement>("[data-place-card-photo] img")!;
    await image.decode();
    const source = getLandmarkPhoto("schifferstadt-architectural-museum-frederick")!;
    expect(localImagePath(image)).toBe(source.localSrc);
    expect(photo.querySelector(".place-card-photo-credit")?.textContent).toContain(source.author);
    expect(photo.querySelector(`.place-card-photo-credit a[href="${source.licenseUrl}"]`)).not.toBeNull();
    expect(fallback.querySelector("[data-place-card-photo]")).toBeNull();
    expect(fallback.querySelector('[data-nearby-category-art][aria-hidden="true"] [data-nearby-art-initial]')?.textContent).toBe("O");
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


// Layout fixtures use exact accepted park identities/bytes and canonical
// coordinates. Their unknown hours remain a workshop state, never a live claim.
const ballenger: PlaceCardData = { ...creek, slug: "ballenger-creek-park-frederick", name: "Ballenger Creek Park",
  address: "5420 Ballenger Creek Pike, Frederick, MD 21703", postal_code: "21703",
  geom: { lng: -77.4488307, lat: 39.3816616 } };
function ParksPair({ enlarged = false, reverse = false }: { enlarged?: boolean; reverse?: boolean }) {
  const places = reverse ? [ballenger, creek] : [creek, ballenger];
  return <div className={nearbyStyles.parksExplorer} style={{ width: enlarged ? 288 : "100%" }}>
    <ul className={nearbyStyles.parksGrid} data-nearby-parks-grid>
      {places.map((place, index) => <li key={place.slug} className={nearbyStyles.parkResult}
        data-nearby-parks-row="pair" data-parks-pair-start={index === 0}>
        <PlaceCard place={place} variant="discovery" discoverySurface="nearby" discoveryIntent="parks" lazyPhoto />
      </li>)}
    </ul>
  </div>;
}
async function parksPhysicalTargets(card: HTMLElement) {
  for (const target of card.querySelectorAll<HTMLElement>('button, a, summary')) {
    target.scrollIntoView({ block: "center", behavior: "instant" });
    // WebKit may update DOM geometry before the scrolled hit-test tree paints.
    // Two real frames settle it without relaxing any physical target check.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const b = target.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const minimum = target.closest(".place-card-photo-credit") ? 44 : 48;
    const semanticName = (element: Element) => (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 160);
    const points = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
      const px = x + dx, py = y + dy, hit = document.elementFromPoint(px, py);
      const owner = hit?.closest("button, a, summary");
      return { x: px, y: py, owned: hit !== null && target.contains(hit),
        hit: hit ? { tag: hit.tagName.toLowerCase(), name: semanticName(hit) } : null,
        owner: owner ? { tag: owner.tagName.toLowerCase(), name: semanticName(owner) } : null };
    });
    const diagnostic = JSON.stringify({ target: { tag: target.tagName.toLowerCase(), name: semanticName(target) },
      rect: { x: b.x, y: b.y, width: b.width, height: b.height }, minimum,
      viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, points });
    expect(b.width, diagnostic).toBeGreaterThanOrEqual(minimum); expect(b.height, diagnostic).toBeGreaterThanOrEqual(minimum);
    expect(points.every(point => point.owned), diagnostic).toBe(true);
  }
  expect(card.querySelector('button button, button a, a button, a a')).toBeNull();
}
async function parksTargets(canvasElement: HTMLElement, columns: 1 | 2, expectedOrder = [creek.slug, ballenger.slug]) {
  const row = canvasElement.querySelector<HTMLElement>("[data-nearby-parks-grid]")!;
  expect(getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/)).toHaveLength(columns);
  expect(Array.from(row.querySelectorAll("article")).map(card => card.getAttribute("data-place-card-slug")))
    .toEqual(expectedOrder);
  for (const card of row.querySelectorAll<HTMLElement>("article")) {
    await waitFor(() => expect(card.querySelector("img"), `Required park image: ${card.dataset.placeCardSlug}`).not.toBeNull(), { timeout: 5000 });
    const image = card.querySelector<HTMLImageElement>("img")!;
    image.scrollIntoView({ block: "center" });
    await waitFor(async () => { await image.decode(); expect(image.naturalWidth).toBeGreaterThan(1);
      expect(card.getAttribute("data-place-card-photo-ready")).toBe("true"); });
    expect(card.textContent).not.toContain("Hours not confirmed");
    expect(card.textContent).not.toContain("Carroll Creek between");
    expect(card.textContent).not.toContain("5420 Ballenger Creek");
    await parksPhysicalTargets(card);
  }
  const credit = row.querySelector<HTMLElement>(".place-card-photo-credit")!;
  expect(credit).not.toBeNull(); expect(credit.closest("button, a")).toBeNull();
  const disclosure = credit.querySelector<HTMLElement>("summary")!;
  await userEvent.click(disclosure);
  expect(disclosure.parentElement).toHaveAttribute("open");
  expect(within(credit).getByText(getLandmarkPhoto(ballenger.slug)!.modifications!, { exact: true })).toBeVisible();
  await userEvent.click(disclosure);
  expect(disclosure.parentElement).not.toHaveAttribute("open");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
}
export const ParksGrid390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <ParksPair />,
  play: ({ canvasElement }) => parksTargets(canvasElement, 2),
};
export const ParksGrid320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: () => <ParksPair />,
  play: ({ canvasElement }) => parksTargets(canvasElement, 1),
};
export const ParksGridDoubledText: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  render: () => <DoubledText><ParksPair enlarged /></DoubledText>,
  play: async ({ canvasElement }) => { await parksTargets(canvasElement, 1);
    expect(parseFloat(getComputedStyle(canvasElement.querySelector("h3")!).fontSize)).toBeGreaterThanOrEqual(34); },
};
async function failedParkPair(canvasElement: HTMLElement, expectedOrder: string[]) {
  await parksTargets(canvasElement, 2, expectedOrder);
  const park = canvasElement.querySelector<HTMLElement>(`[data-place-card-slug="${ballenger.slug}"]`)!;
  const failedImage = park.querySelector<HTMLImageElement>("img")!;
  expect(localImagePath(failedImage)).toBe(getLandmarkPhoto(ballenger.slug)!.localSrc);
  failedImage.dispatchEvent(new Event("error"));
  await waitFor(() => expect(park.getAttribute("data-place-card-has-photo")).toBe("false"));
  expect(park.querySelector("[data-place-card-photo], .place-card-photo-credit")).toBeNull();
  const row = canvasElement.querySelector<HTMLElement>("[data-nearby-parks-grid]")!;
  const cards = row.querySelectorAll<HTMLElement>("article");
  expect(cards).toHaveLength(2);
  expect(Array.from(cards).map(card => card.getAttribute("data-place-card-slug"))).toEqual(expectedOrder);
  // Both physical destinations must become full-width, not merely the failed
  // card. This catches the first-failed/second-surviving half-column edge too.
  for (const card of cards) {
    expect(card.getBoundingClientRect().width).toBeGreaterThanOrEqual(row.getBoundingClientRect().width - 2);
    expect(card.querySelectorAll('button, a[aria-label^="Directions"]')).toHaveLength(3);
    await parksPhysicalTargets(card);
  }
  expect(cards[1].getBoundingClientRect().top).toBeGreaterThanOrEqual(cards[0].getBoundingClientRect().bottom);
  expect(park.textContent).toContain(ballenger.name);
  const survivor = row.querySelector<HTMLElement>(`[data-place-card-slug="${creek.slug}"]`)!;
  const survivingImage = survivor.querySelector<HTMLImageElement>("img")!;
  await survivingImage.decode();
  expect(survivingImage.naturalWidth).toBeGreaterThan(1);
  expect(localImagePath(survivingImage)).toBe(getOwnedPlacePhoto(creek.slug)!.src);
  expect(survivor.getAttribute("data-place-card-photo-ready")).toBe("true");
  expect(row.querySelector(".place-card-photo-credit")).toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
}
export const ParksFailureKeepsBothDestinations: Story = {
  ...ParksGrid390,
  play: ({ canvasElement }) => failedParkPair(canvasElement, [creek.slug, ballenger.slug]),
};
export const ParksFirstFailureKeepsBothDestinations: Story = {
  ...ParksGrid390,
  // Reorder only this explicit workshop fixture: Ballenger has one reviewed
  // local source, so its failure exhausts the first card instead of advancing
  // the Creek's independent fallback plan. Production rank is untouched.
  render: () => <ParksPair reverse />,
  play: ({ canvasElement }) => failedParkPair(canvasElement, [ballenger.slug, creek.slug]),
};
