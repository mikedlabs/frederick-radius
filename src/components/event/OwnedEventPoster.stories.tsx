import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventCardVisual } from "./eventVisuals";
import EventPosterCard from "./EventPosterCard";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";

const nowISO = "2029-10-10T12:00:00-04:00";
const title = "Offline fixture";
type Venue = { slug: string; name: string; src: string; caption: string; position: string };
const fairgrounds: Venue = {
  slug: "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick", name: "Frederick Fairgrounds",
  src: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
  caption: "Venue · Frederick Fairgrounds during The Great Frederick Fair", position: "100% 50%",
};
const mccurdy: Venue = { slug: "mccurdy-field", name: "McCurdy Field",
  src: "/images/seasons/spring/aerial-view-baseball-field.jpg", caption: "Venue · McCurdy Field", position: "50% 50%" };
const brewers: Venue = { slug: "brewers-alley-frederick", name: "Brewer's Alley",
  src: "/place-photos/brewers-alley-2004.jpg", caption: "Venue · Brewer's Alley side entrance, photographed in 2004", position: "50% 50%" };
function fixture(venue: Venue): EventWithMeta {
  return {
    slug: `offline-poster-${venue.slug}`, title, description: "This is a fictional event for the offline layout test.",
    starts_at: "2029-10-10T19:00:00-04:00", ends_at: "2029-10-10T21:00:00-04:00", timezone: "America/New_York",
    venue_name: venue.name, venue_place_slug: venue.slug, address: "", municipality: "frederick", municipality_name: "Frederick",
    geom: { lat: 39.4, lng: -77.4 }, geo_confidence: "area", category: "arts", category_name: "Arts & culture", audience: [],
    is_free: false, source: "manual", is_verified: true, source_id: `offline-poster-${venue.slug}`,
    source_url: "https://example.test/offline-poster-fixture", confidence: "curated", license: "Synthetic component facts only",
    first_seen_at: nowISO, last_verified_at: nowISO,
  };
}
const meta = {
  title: "Events/Owned venue Poster acceptance", component: EventPosterCard,
  parameters: { layout: "fullscreen", a11y: { test: "error" },
    docs: { description: { component: "The actual EventPosterCard with existing local owned venue photos and fictional event facts. Normal cases require native decode; enlarged cases measure actual text growth and complete fact visibility. The error story dispatches a component error after successful decode; it does not represent an upstream outage or compiled Next transport proof." } } },
  decorators: [(Story) => <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 752, background: "var(--app-bg)", color: "var(--app-ink)" }}>
    <h1 className="text-base font-semibold">Offline Poster acceptance fixture</h1>
    <p className="mb-4 mt-1 text-sm">Fictional event facts. The image identifies the venue, not this event.</p>
    <Story />
  </main>],
  beforeEach: () => {
    const root = document.documentElement, previous = root.style.getPropertyValue("font-size"), priority = root.style.getPropertyPriority("font-size");
    root.style.setProperty("font-size", "100%");
    return () => { if (previous) root.style.setProperty("font-size", previous, priority); else root.style.removeProperty("font-size"); };
  },
  args: { event: fixture(fairgrounds), nowISO, priorityImage: true },
} satisfies Meta<typeof EventPosterCard>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

async function viewport(width: number, height: number) {
  if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
    const browser = await import("vitest/browser");
    await browser.page.viewport(width, height);
  }
  await waitFor(() => expect(window.innerWidth).toBe(width));
  await document.fonts.ready;
}
function parts(canvasElement: HTMLElement, venue: Venue) {
  const article = canvasElement.querySelector<HTMLElement>("article[data-event-poster]")!;
  expect(article).not.toBeNull();
  const link = article.querySelector<HTMLAnchorElement>(`a[href="/events/offline-poster-${venue.slug}"]`)!;
  expect(link).not.toBeNull();
  const heading = within(article).getByText(title, { exact: true });
  const facts = [...article.querySelectorAll("p")].filter(node => /7:00|9:00/.test(node.textContent ?? "") || node.textContent?.includes(venue.name));
  expect(facts.length).toBeGreaterThan(0);
  expect(article.textContent).toContain(venue.name);
  expect(article.textContent).toContain("7:00");
  expect(article.textContent).toContain("9:00");
  return { article, link, heading, facts };
}
function readableFragments(node: HTMLElement, container: HTMLElement) {
  const box = node.getBoundingClientRect(), frame = container.getBoundingClientRect();
  expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
  expect(node.scrollHeight).toBeLessThanOrEqual(node.clientHeight + 1);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    const range = document.createRange(); range.selectNodeContents(walker.currentNode);
    for (const line of range.getClientRects()) {
      if (!line.width) continue;
      expect(line.left).toBeGreaterThanOrEqual(Math.max(box.left, frame.left) - 1);
      expect(line.right).toBeLessThanOrEqual(Math.min(box.right, frame.right) + 1);
      expect(line.top).toBeGreaterThanOrEqual(Math.max(box.top, frame.top) - 2);
      expect(line.bottom).toBeLessThanOrEqual(Math.min(box.bottom, frame.bottom) + 2);
    }
  }
}
async function ownedPoster(context: Context, venue: Venue) {
  const { canvasElement } = context;
  const visual = eventCardVisual(context.args.event)!;
  expect(visual.src).toBe(venue.src); expect(visual.caption).toBe(venue.caption); expect(visual.presentation).toBe("photo");
  const p = parts(canvasElement, venue);
  expect(p.article.getAttribute("data-event-poster")).toBe("photo");
  const image = p.article.querySelector<HTMLImageElement>("img")!;
  expect(image).not.toBeNull();
  image.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => {
    await image.decode();
    expect(image.isConnected).toBe(true); expect(image.complete).toBe(true);
    expect(image.naturalWidth).toBeGreaterThan(1); expect(image.naturalHeight).toBeGreaterThan(1);
  });
  const selected = new URL(image.currentSrc || image.src, document.baseURI);
  expect(decodeURIComponent(selected.searchParams.get("url") ?? selected.pathname)).toBe(venue.src);
  expect(getComputedStyle(image).objectFit).toBe("cover"); expect(getComputedStyle(image).objectPosition).toBe(venue.position);
  const caption = within(canvasElement).getByText(venue.caption, { exact: true });
  expect(p.article.contains(caption)).toBe(false); expect(p.link.contains(caption)).toBe(false);
  expect(canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
  await expect(caption).toBeVisible();
  readableFragments(caption, caption.parentElement!);
  for (const node of [p.heading, ...p.facts]) { await expect(node).toBeVisible(); readableFragments(node, p.article); }
  expect(p.link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(p.link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  expect(canvasElement.querySelector("a a")).toBeNull();
  expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  for (const candidate of canvasElement.querySelectorAll("img")) expect(`${candidate.src} ${candidate.currentSrc} ${candidate.srcset}`).not.toContain("/api/place-photo");
  return { ...p, image, caption };
}
async function enlarged(context: Context, venue: Venue) {
  await viewport(320, 844);
  const p = await ownedPoster(context, venue);
  const nodes = [p.heading, ...p.facts, p.caption];
  const normal = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
  document.documentElement.style.setProperty("font-size", "200%");
  await waitFor(() => {
    expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    nodes.forEach((node, index) => expect(parseFloat(getComputedStyle(node).fontSize) / normal[index]).toBeCloseTo(2, 2));
  });
  // Check the actual product layout after text changes. The fixture does not
  // resize the card or amend overflow to manufacture complete fact visibility.
  await ownedPoster(context, venue);
}
export const Fairgrounds390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false }, motion: "reduce" },
  play: async context => { await viewport(390, 844); await ownedPoster(context, fairgrounds); } };
export const McCurdy390: Story = { args: { event: fixture(mccurdy) }, globals: Fairgrounds390.globals,
  play: async context => { await viewport(390, 844); await ownedPoster(context, mccurdy); } };
export const FairgroundsDesktop: Story = { globals: { viewport: { value: "radiusDesktop", isRotated: false }, motion: "reduce" },
  play: async context => { await viewport(1440, 900); await ownedPoster(context, fairgrounds); } };
export const Fairgrounds320Root200: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  play: context => enlarged(context, fairgrounds) };
export const McCurdy320Root200: Story = { args: { event: fixture(mccurdy) }, globals: Fairgrounds320Root200.globals,
  play: context => enlarged(context, mccurdy) };
export const FairgroundsDeclaredError: Story = { globals: Fairgrounds390.globals,
  play: async context => {
    await viewport(390, 844);
    const p = await ownedPoster(context, fairgrounds);
    // Deliberate component failure simulation after real owned-image decode.
    // This is not a fixture response, upstream outage, or compiled proof.
    p.image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(context.canvasElement.querySelector("img")).toBeNull());
    expect(context.canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
    const fallback = parts(context.canvasElement, fairgrounds);
    expect(fallback.article.getAttribute("data-event-fallback")).toBe("date-category");
    await expect(fallback.link).toBeVisible();
    for (const node of [fallback.heading, ...fallback.facts]) { await expect(node).toBeVisible(); readableFragments(node, fallback.article); }
  } };

async function licensedCredit(context: Context) {
  const metadata = CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"];
  const credit = context.canvasElement.querySelector<HTMLElement>("[data-event-licensed-credit]")!;
  expect(credit).not.toBeNull();
  expect(credit.textContent).toContain(metadata.image.creator);
  expect(credit.textContent).toContain(metadata.image.modifications);
  for (const [label, href] of [["Wikimedia Commons", metadata.image.source_url],
    [metadata.image.license.label, metadata.image.license.url], ["Original photograph", metadata.provenance.original_source_url]]) {
    const link = within(credit).getByRole("link", { name: label });
    expect(link).toHaveAttribute("href", href);
    expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    readableFragments(link, credit);
  }
  readableFragments(credit, credit);
}
export const LicensedBrewers390: Story = { args: { event: fixture(brewers) }, globals: Fairgrounds390.globals,
  play: async context => { await viewport(390, 844); await ownedPoster(context, brewers); await licensedCredit(context); } };
export const LicensedBrewers320Root200: Story = { args: { event: fixture(brewers) }, globals: Fairgrounds320Root200.globals,
  play: async context => { await enlarged(context, brewers); await licensedCredit(context); } };
