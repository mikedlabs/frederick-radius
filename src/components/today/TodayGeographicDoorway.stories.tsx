import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import { TodayGeographicDoorwayPending, TodayGeographicDoorwayView } from "./TodayGeographicDoorway";

const subjects = [
  { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", title: "Carroll Creek" },
  { slug: "baker-park-frederick", name: "Baker Park", title: "Baker Park" },
  { slug: "visitation-hotel", name: "Visitation Hotel", title: "Visitation Hotel" },
] as const;
const meta = {
  title: "Today/Geographic doorway",
  component: TodayGeographicDoorwayView,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { scope: "county" },
} satisfies Meta<typeof TodayGeographicDoorwayView>;
export default meta;
type Story = StoryObj<typeof meta>;

async function physicalLink(link: HTMLElement) {
  link.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const box = link.getBoundingClientRect(), owner = link.ownerDocument;
  const hits = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
    const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy;
    const hit = owner.elementFromPoint(x, y);
    return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && hit !== null && link.contains(hit);
  });
  await expect(box.width).toBeGreaterThanOrEqual(44);
  await expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(hits).toEqual([true, true, true, true, true]);
  for (const copy of link.querySelectorAll("h2, h3, p")) {
    const text = owner.createRange(); text.selectNodeContents(copy);
    for (const line of text.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(box.left);
      await expect(line.right).toBeLessThanOrEqual(box.right);
      await expect(line.top).toBeGreaterThanOrEqual(box.top);
      await expect(line.bottom).toBeLessThanOrEqual(box.bottom);
    }
  }
  await expect(link.querySelectorAll("a, button, input, select")).toHaveLength(0);
}

async function checkMosaic({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0], enlarged = false) {
  const canvas = within(canvasElement), links = canvas.getAllByRole("link");
  await expect(links).toHaveLength(3);
  await expect(canvas.getAllByRole("img")).toHaveLength(3);
  for (const subject of subjects) {
    const link = canvas.getByRole("link", { name: `View ${subject.name} in Frederick` });
    const photo = getOwnedPlacePhoto(subject.slug)!;
    const image = within(link).getByRole("img", { name: photo.alt }) as HTMLImageElement;
    await expect(link).toHaveAttribute("href", `/places/${subject.slug}`);
    await expect(decodeURIComponent(image.currentSrc || image.src)).toContain(photo.src);
    await waitFor(async () => {
      await image.decode();
      await expect(image.naturalWidth).toBeGreaterThan(1);
      await expect(link).toHaveAttribute("data-photo-state", "loaded");
    }, { timeout: 5_000 });
    // A cached decode can finish on the first frame of the real180ms fade.
    // Require the fully painted photograph, not just its loaded state.
    await waitFor(async () => {
      await expect(image).toBeVisible();
      await expect(getComputedStyle(image).opacity).toBe("1");
    });
    await expect(within(link).getByRole("heading", { name: subject.title })).toBeVisible();
    await physicalLink(link);
  }
  const mosaic = canvasElement.querySelector<HTMLElement>("[data-today-geographic-mosaic]")!;
  const main = links[0].getBoundingClientRect(), supporting = links.slice(1).map(link => link.getBoundingClientRect());
  await expect(mosaic.getBoundingClientRect().height).toBeGreaterThanOrEqual(208);
  if (enlarged) {
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    await expect(parseFloat(getComputedStyle(links[0].querySelector("h2")!).fontSize)).toBeGreaterThanOrEqual(40);
    for (const link of links.slice(1)) {
      const heading = link.querySelector("h3")!;
      await expect(parseFloat(getComputedStyle(heading).fontSize)).toBeGreaterThanOrEqual(28);
      const available = link.clientWidth - parseFloat(getComputedStyle(link.querySelector("[data-today-geographic-caption]")!).paddingLeft)
        - parseFloat(getComputedStyle(link.querySelector("[data-today-geographic-caption]")!).paddingRight);
      await expect(heading.getBoundingClientRect().width).toBeGreaterThanOrEqual(available - 1);
    }
  } else await expect(mosaic.getBoundingClientRect().height).toBeLessThanOrEqual(260);
  await expect(main.height).toBeGreaterThan(supporting[0].height);
  await expect(supporting[0].left).toBeGreaterThan(main.right);
  await expect(supporting[1].top).toBeGreaterThan(supporting[0].bottom);
  await expect(canvasElement.textContent).toBe("Carroll CreekFrederickBaker ParkVisitation Hotel");
  await expect(mosaic.scrollWidth).toBeLessThanOrEqual(mosaic.clientWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  links[0].focus();
  await expect(links[0]).toHaveFocus();
  await userEvent.tab(); await expect(links[1]).toHaveFocus();
  await userEvent.tab(); await expect(links[2]).toHaveFocus();
}

export const ExactOwnedPlaces320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: checkMosaic };
export const ExactOwnedPlaces375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: checkMosaic };
export const ExactOwnedPlaces390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: checkMosaic };
export const ExactOwnedPlaces430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, play: checkMosaic };
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: context => checkMosaic(context, true),
};

export const DifferentTown: Story = {
  args: { scope: "town:brunswick" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
  },
};
export const NearbyDecisionLeads: Story = { ...DifferentTown, args: { scope: "nearme" } };
export const ScopePending: Story = {
  render: () => <TodayGeographicDoorwayPending />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
    const pending = canvasElement.querySelector<HTMLElement>("[data-today-geographic-pending]")!;
    await expect(pending).toHaveAttribute("aria-hidden", "true");
    await expect(pending.getBoundingClientRect().height).toBeGreaterThanOrEqual(208);
    await expect(pending.getBoundingClientRect().height).toBeLessThanOrEqual(260);
  },
};
export const OneFailedImageKeepsEveryPlaceAction: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const failed = canvas.getByRole("link", { name: "View Visitation Hotel in Frederick" });
    failed.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(async () => { await expect(failed.querySelector("img")).toBeNull(); });
    await expect(failed).toHaveAttribute("data-photo-state", "failed");
    await expect(within(failed).getByRole("heading", { name: "Visitation Hotel" })).toBeVisible();
    await physicalLink(failed);
    for (const subject of subjects.slice(0, 2)) {
      const link = canvas.getByRole("link", { name: `View ${subject.name} in Frederick` });
      const image = link.querySelector("img")!;
      await waitFor(async () => { await image.decode(); await expect(link).toHaveAttribute("data-photo-state", "loaded"); });
      await waitFor(async () => {
        await expect(image).toBeVisible();
        await expect(getComputedStyle(image).opacity).toBe("1");
      });
      await physicalLink(link);
    }
    await expect(canvas.getAllByRole("link")).toHaveLength(3);
    await expect(canvas.getAllByRole("img")).toHaveLength(2);
  },
};
