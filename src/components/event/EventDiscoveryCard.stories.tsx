import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import EventCard from "./EventCard";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

const nowISO = "2029-10-10T16:00:00-04:00";
const ownedVenueSrc = getOwnedPlacePhoto("baker-park-frederick")!.src;
const fixture: EventWithMeta = {
  slug: "offline-photo-discovery", title: "Fictional community performance, artist conversation and neighborhood gathering at Baker Park",
  description: "This fictional event is only for component acceptance.",
  starts_at: "2029-10-10T19:00:00-04:00", ends_at: "2029-10-10T21:00:00-04:00", timezone: "America/New_York",
  venue_name: "Baker Park", venue_place_slug: "baker-park-frederick", address: "",
  municipality: "frederick", municipality_name: "Frederick", category: "music", category_name: "Music",
  geom: { lat: 39.417, lng: -77.417 }, geo_confidence: "area", audience: [], is_free: false,
  price_text: "$12 fictional admission", source: "manual", is_verified: false, source_id: "offline-photo-discovery",
  source_url: "https://example.test/offline-photo-discovery", license: "Fictional event fixture",
  confidence: "curated", first_seen_at: nowISO, last_verified_at: nowISO,
  hero_image: "/api/place-photo?name=places%2Foffline%2Fphotos%2Fnever-requested-discovery",
  hero_image_attribution: { kind: "venue", venue_name: "Baker Park", provider: "google_maps",
    source_uri: "https://maps.google.com/?cid=offline-fixture", authors: [] },
};

const meta = {
  title: "Events/Visual discovery cards", component: EventCard,
  parameters: { layout: "fullscreen", a11y: { test: "error" },
    docs: { description: { component: "The actual opt-in Recommended card with real reviewed local venue photographs and fictional event facts. Images identify the venue, not the listed event. No publisher, paid photo, model or live schedule claim. Native image decode, independent credit actions and enlarged reading are checked here; the full compiled Events journey is separate." } } },
  globals: { viewport: { value: "radiusMobile", isRotated: false }, motion: "reduce" },
  decorators: [(Story) => <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 720, color: "var(--app-ink)", background: "var(--app-bg)" }}>
    <h1 className="mb-2 text-lg font-semibold">Offline event card fixture</h1>
    <p className="mb-4 text-sm">Fictional event facts. The real photograph shows the venue.</p>
    <section data-app-primary-tab="/events" aria-labelledby="offline-events-horizon">
      <h2 id="offline-events-horizon" className="mb-3 text-base font-semibold">Today</h2>
      <Story />
    </section>
  </main>],
  beforeEach: () => {
    const root = document.documentElement;
    const prior = root.style.getPropertyValue("font-size"), priority = root.style.getPropertyPriority("font-size");
    root.style.setProperty("font-size", "100%");
    return () => { if (prior) root.style.setProperty("font-size", prior, priority); else root.style.removeProperty("font-size"); };
  },
  args: { event: fixture, variant: "discovery", venuePhotos: "free-reviewed", nowISO },
} satisfies Meta<typeof EventCard>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

async function viewport(width: number) {
  if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
    const browser = await import("vitest/browser"); await browser.page.viewport(width, 844);
  }
  await waitFor(() => expect(window.innerWidth).toBe(width));
  await document.fonts.ready;
}

async function ownsTarget(node: HTMLAnchorElement) {
  node.scrollIntoView({ block: "center", behavior: "instant" });
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  expect(r.height).toBeGreaterThanOrEqual(44);
  expect(r.width).toBeGreaterThanOrEqual(44);
  for (const [dx, dy] of [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]]) {
    const hit = document.elementFromPoint(x + dx, y + dy);
    expect(hit === node || Boolean(hit && node.contains(hit))).toBe(true);
  }
}

function readable(node: HTMLElement, article: HTMLElement) {
  const bounds = article.getBoundingClientRect();
  expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
  expect(node.scrollHeight).toBeLessThanOrEqual(node.clientHeight + 1);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    const range = document.createRange(); range.selectNodeContents(walker.currentNode);
    for (const line of range.getClientRects()) {
      if (!line.width) continue;
      expect(line.left).toBeGreaterThanOrEqual(bounds.left - 1);
      expect(line.right).toBeLessThanOrEqual(bounds.right + 1);
    }
  }
}

async function card(context: Context, expectedSource: string) {
  const article = context.canvasElement.querySelector<HTMLElement>('article[data-event-card-layout="discovery"]')!;
  expect(article).not.toBeNull();
  expect(article).toHaveAttribute("data-event-media", "photo");
  const link = article.querySelector<HTMLAnchorElement>(`a[href="/events/${fixture.slug}"]`)!;
  const image = article.querySelector<HTMLImageElement>("img")!;
  image.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => { await image.decode(); expect(image.complete).toBe(true); expect(image.naturalWidth).toBeGreaterThan(1); expect(image.naturalHeight).toBeGreaterThan(1); });
  const source = new URL(image.currentSrc || image.src, document.baseURI);
  expect(decodeURIComponent(source.searchParams.get("url") ?? source.pathname)).toBe(expectedSource);
  expect(getComputedStyle(image).objectFit).toBe("cover");
  const frame = article.querySelector("figure")!.getBoundingClientRect(), box = article.getBoundingClientRect();
  expect(frame.width).toBeGreaterThanOrEqual(box.width - 3);
  expect(frame.width / frame.height).toBeCloseTo(1.6, 2);
  const title = article.querySelector<HTMLElement>("h3")!, time = article.querySelector<HTMLElement>("[data-event-card-time]")!, venue = article.querySelector<HTMLElement>("[data-event-card-venue]")!;
  expect(frame.bottom).toBeLessThanOrEqual(title.getBoundingClientRect().top);
  expect(article.textContent).toContain(context.args.event.title);
  expect(time.textContent).toBe("Wed OCT 10 · 7:00 PM–9:00 PM");
  const heading = article.querySelector<HTMLElement>("[data-event-card-heading]")!;
  expect(title.parentElement).toBe(heading);
  const titleBounds = title.getBoundingClientRect(), headingBounds = heading.getBoundingClientRect();
  expect(titleBounds.left).toBeCloseTo(headingBounds.left, 1);
  expect(titleBounds.width).toBeCloseTo(headingBounds.width, 1);
  expect(heading.textContent).not.toContain("OCT");
  expect(venue.textContent).toContain(context.args.event.venue_name);
  const credit = article.querySelector<HTMLElement>("[data-event-photo-credit]")!;
  expect(credit).not.toBeNull(); expect(link.contains(credit)).toBe(false);
  for (const node of [title, time, venue, credit]) readable(node, article);
  for (const anchor of article.querySelectorAll<HTMLAnchorElement>("a")) await ownsTarget(anchor);
  expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  expect(context.canvasElement.querySelector("a a, a button, button a")).toBeNull();
  for (const img of article.querySelectorAll("img")) expect(`${img.src} ${img.currentSrc} ${img.srcset}`).not.toContain("/api/place-photo");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  expect(document.body.scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  return { article, link, image, title, time, venue, credit };
}

export const OwnedVenue390: Story = {
  play: async context => { await viewport(390); await card(context, ownedVenueSrc); },
};
export const OwnedVenue320Reading200: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  play: async context => {
    await viewport(320);
    const p = await card(context, ownedVenueSrc);
    const reading = [p.title, p.time, p.venue, p.credit];
    const normal = reading.map(node => parseFloat(getComputedStyle(node).fontSize));
    document.documentElement.style.fontSize = "200%";
    await waitFor(() => reading.forEach((node, index) => expect(parseFloat(getComputedStyle(node).fontSize) / normal[index]).toBeCloseTo(2, 2)));
    await card(context, ownedVenueSrc);
  },
};
export const LicensedVenue390: Story = {
  args: { event: { ...fixture, title: "Fictional community event at Brewer's Alley", venue_name: "Brewer's Alley", venue_place_slug: "brewers-alley-frederick" } },
  play: async context => {
    await viewport(390);
    const p = await card(context, CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"].image.src);
    const image = CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"].image;
    expect(p.credit.textContent).toContain("photographed in 2004");
    expect(p.credit.textContent).toContain(image.creator);
    expect(p.credit.textContent).toContain(image.modifications);
    expect(within(p.credit).getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", image.source_url);
    expect(within(p.credit).getByRole("link", { name: image.license.label })).toHaveAttribute("href", image.license.url);
  },
};
export const DeclaredPhotoFailure: Story = {
  play: async context => {
    await viewport(390); const p = await card(context, ownedVenueSrc);
    p.image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(p.article).toHaveAttribute("data-event-media", "none"));
    expect(p.article.querySelector("figure, img, [data-event-photo-credit]")).toBeNull();
    expect(p.article.querySelector('a[data-decision-action="open"]')).toBe(p.link);
    expect(p.article.textContent).toContain(fixture.title); expect(p.article.textContent).toContain("7:00");
    expect(p.article.textContent).toContain("Baker Park"); await ownsTarget(p.link);
  },
};
export const NoPhotoCancelledAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  args: { live: true, nowISO: "2029-10-10T20:00:00-04:00", event: { ...fixture, venue_name: "Fictional community hall", venue_place_slug: undefined, status: "cancelled", ends_at: fixture.starts_at } },
  play: async ({ canvasElement }) => {
    await viewport(320);
    const article = canvasElement.querySelector<HTMLElement>("article")!;
    expect(article).toHaveAttribute("data-event-media", "none");
    expect(article.querySelector("figure, img, [data-event-photo-credit], .live-dot")).toBeNull();
    expect(article.textContent).toContain("Cancelled"); expect(article.textContent).toContain("end time not listed");
    expect(article.textContent).not.toContain("Happening now");
    await ownsTarget(article.querySelector<HTMLAnchorElement>('a[data-decision-action="open"]')!);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  },
};
