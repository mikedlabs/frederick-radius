import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import EventArtwork from "./EventArtwork";
import type { EventCardVisual } from "./eventVisuals";

// Declared layout fixtures, not publisher/event evidence. Self-contained SVG
// bytes let the real Next Image and CSS exercise portrait/landscape artwork
// without a publisher, paid image request, or a new production asset.
function layoutArtwork(width: number, height: number): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#22221f" stroke-width="8"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#c34335" stroke-width="8"/><text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#22221f">ARTWORK LAYOUT FIXTURE</text><text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#22221f">NOT A REAL EVENT</text></svg>`)}`;
}
const portrait: EventCardVisual = {
  src: layoutArtwork(600, 900), key: "portrait-layout-fixture", presentation: "artwork",
  caption: "Component fixture · no publisher or event claim",
};
const meta = {
  title: "Events/Intact publisher artwork", component: EventArtwork,
  parameters: { layout: "fullscreen", docs: { description: { component: "Publisher artwork remains contained without headings or motion over its pixels. These are declared layout fixtures, not imported event media." } } },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { visual: portrait },
  decorators: [(Story) => <main className="p-4" style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}>
    <h1 className="text-[22px] font-semibold">Event layout fixture</h1>
    <p className="mb-4 mt-1 text-sm">Published event time stays in readable text.</p>
    <Story />
  </main>],
} satisfies Meta<typeof EventArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;

const assertContained: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const figure = canvasElement.querySelector<HTMLElement>("[data-event-artwork]")!;
  const image = figure.querySelector<HTMLImageElement>("img")!;
  image.scrollIntoView({ block: "center" });
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(image.naturalHeight).toBeGreaterThan(1);
  });
  const style = getComputedStyle(image);
  await expect(style.objectFit).toBe("contain");
  await expect(style.transform).toBe("none");
  await expect(style.animationName).toBe("none");
  // Verify all natural image edges fit within the padded, rounded canvas.
  const imageBox = image.getBoundingClientRect();
  const frame = image.parentElement!.getBoundingClientRect();
  const left = Number.parseFloat(style.paddingLeft), right = Number.parseFloat(style.paddingRight);
  const top = Number.parseFloat(style.paddingTop), bottom = Number.parseFloat(style.paddingBottom);
  const scale = Math.min((imageBox.width - left - right) / image.naturalWidth, (imageBox.height - top - bottom) / image.naturalHeight);
  await expect(image.naturalWidth * scale).toBeLessThanOrEqual(frame.width - left - right);
  await expect(image.naturalHeight * scale).toBeLessThanOrEqual(frame.height - top - bottom);
  await expect(figure.contains(within(canvasElement).getByRole("heading", { name: "Event layout fixture" }))).toBe(false);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
};

export const PortraitAt320: Story = { play: assertContained };
export const LandscapeAt390: Story = {
  args: { visual: { ...portrait, src: layoutArtwork(900, 500), key: "landscape-layout-fixture" } },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: assertContained,
};
export const FailedArtwork: Story = {
  play: async (context) => {
    await assertContained(context);
    context.canvasElement.querySelector<HTMLImageElement>("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(context.canvasElement.querySelector("[data-event-artwork]")).toBeNull());
    await expect(within(context.canvasElement).getByRole("heading", { name: "Event layout fixture" })).toBeVisible();
    await expect(context.canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
  },
};
