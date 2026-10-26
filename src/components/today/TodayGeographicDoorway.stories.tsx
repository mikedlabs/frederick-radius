import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { TODAY_PIZZA_CATEGORY_PHOTO, TodayGeographicDoorwayPending, TodayGeographicDoorwayView } from "./TodayGeographicDoorway";

const zoes = getOwnedPlacePhoto("zoes-chocolate-company")!;
const sabor = getLandmarkPhoto("sabor-de-cuba-restaurant-frederick")!;
const subjects = [
  { label: "Find pizza", title: "Find pizza", src: TODAY_PIZZA_CATEGORY_PHOTO.src, alt: TODAY_PIZZA_CATEGORY_PHOTO.alt },
  { label: "View Zoe's Chocolate Company in Frederick", title: "Zoe's Chocolate Company", src: zoes.src, alt: zoes.alt },
  { label: "View Sabor de Cuba Restaurant in Frederick", title: "Sabor de Cuba", src: "/place-photos/sabor-de-cuba-entrance-2018.jpg", alt: sabor.alt },
];
const meta = {
  title: "Today/Dining photo doorway", component: TodayGeographicDoorwayView,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { scope: "county", returnTo: "/today?in=county&intent=coffee#find-radius" },
} satisfies Meta<typeof TodayGeographicDoorwayView>;
export default meta;
type Story = StoryObj<typeof meta>;

async function physicalLink(link: HTMLElement) {
  link.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const box = link.getBoundingClientRect(), owner = link.ownerDocument;
  await expect(box.width).toBeGreaterThanOrEqual(44); await expect(box.height).toBeGreaterThanOrEqual(44);
  const hits = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
    const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy, hit = owner.elementFromPoint(x, y);
    return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && hit !== null && link.contains(hit);
  });
  await expect(hits, JSON.stringify({ target: link.getAttribute("aria-label") ?? link.textContent, box: { x: box.x, y: box.y, width: box.width, height: box.height },
    viewport: { width: innerWidth, height: innerHeight },
    siblings: Array.from(link.closest(".place-card-photo-credit-row")?.querySelectorAll("a, summary") ?? []).map(node => { const r = node.getBoundingClientRect(), css = getComputedStyle(node); return { text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height, display: css.display, margin: css.margin, position: css.position }; }),
    row: link.closest(".place-card-photo-credit-row") ? { gap: getComputedStyle(link.closest(".place-card-photo-credit-row")!).gap, display: getComputedStyle(link.closest(".place-card-photo-credit-row")!).display } : null,
    owners: [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => owner.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)?.outerHTML.slice(0, 240)),
  })).toEqual([true, true, true, true, true]);
  for (const copy of link.querySelectorAll("h2, h3")) {
    const text = owner.createRange(); text.selectNodeContents(copy);
    for (const line of text.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(box.left); await expect(line.right).toBeLessThanOrEqual(box.right);
      await expect(line.top).toBeGreaterThanOrEqual(box.top); await expect(line.bottom).toBeLessThanOrEqual(box.bottom);
    }
  }
  await expect(link.querySelectorAll("a, button, input, select")).toHaveLength(0);
}
async function decoded(link: HTMLElement, subject: typeof subjects[number]) {
  const image = within(link).getByRole("img", { name: subject.alt }) as HTMLImageElement;
  image.scrollIntoView({ block: "nearest" });
  await waitFor(async () => { await image.decode(); await expect(image.naturalWidth).toBeGreaterThan(1); await expect(link).toHaveAttribute("data-photo-state", "loaded"); }, { timeout: 5000 });
  await expect(decodeURIComponent(image.currentSrc || image.src)).toContain(subject.src);
  await waitFor(async () => { await expect(image).toBeVisible(); await expect(getComputedStyle(image).opacity).toBe("1"); });
}
async function checkMosaic({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0], enlarged = false) {
  const canvas = within(canvasElement), links = subjects.map(s => canvas.getByRole("link", { name: s.label }));
  await expect(canvasElement.querySelectorAll("[data-today-discovery-action]")).toHaveLength(3);
  await expect(canvas.getAllByRole("img")).toHaveLength(3);
  for (const [index, subject] of subjects.entries()) {
    const link = links[index]; await decoded(link, subject); await expect(within(link).getByRole("heading", { name: subject.title })).toBeVisible();
    const url = new URL(link.getAttribute("href")!, "https://radius.test");
    await expect(url.searchParams.get("in")).toBe("county");
    await expect(url.searchParams.get("returnTo")).toBe("/today?in=county&intent=coffee#find-radius");
    await physicalLink(link);
  }
  const pizza = new URL(links[0].getAttribute("href")!, "https://radius.test");
  await expect(pizza.pathname).toBe("/nearby"); await expect(pizza.searchParams.get("c")).toBe("food"); await expect(pizza.searchParams.get("facet")).toBe("pizza");
  const grid = canvasElement.querySelector<HTMLElement>("[data-today-discovery-grid]")!, main = links[0].getBoundingClientRect(), support = links.slice(1).map(link => link.getBoundingClientRect());
  await expect(grid.getBoundingClientRect().height).toBeGreaterThanOrEqual(208);
  if (!enlarged) await expect(grid.getBoundingClientRect().height).toBeLessThanOrEqual(260);
  else {
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    await expect(parseFloat(getComputedStyle(links[0].querySelector("h2")!).fontSize)).toBeGreaterThanOrEqual(44);
    for (const link of links.slice(1)) await expect(parseFloat(getComputedStyle(link.querySelector("h3")!).fontSize)).toBeGreaterThanOrEqual(28);
  }
  await expect(main.height).toBeGreaterThan(support[0].height); await expect(support[0].left).toBeGreaterThan(main.right); await expect(support[1].top).toBeGreaterThan(support[0].bottom);
  const credit = canvasElement.querySelector<HTMLElement>(".place-card-photo-credit")!;
  await expect(credit).toBeVisible(); await expect(links[2].contains(credit)).toBe(false);
  const creator = within(credit).getByRole("link", { name: `Photo by ${sabor.author}. Wikimedia Commons` });
  const license = within(credit).getByRole("link", { name: sabor.license });
  const disclosure = within(credit).getByText("Edited photo", { selector: "summary" });
  await expect(creator).toHaveAttribute("href", sabor.source_url);
  await expect(license).toBeVisible();
  for (const target of [creator, license, disclosure]) await physicalLink(target);
  await expect(disclosure.parentElement).not.toHaveAttribute("open");
  await userEvent.click(disclosure);
  await expect(disclosure.parentElement).toHaveAttribute("open");
  await expect(within(credit).getByText(sabor.modifications!, { exact: true })).toBeVisible();
  for (const target of [creator, license, disclosure]) await physicalLink(target);
  await userEvent.click(disclosure);
  await expect(disclosure.parentElement).not.toHaveAttribute("open");
  await expect(canvasElement.textContent).not.toMatch(/open now|recommended|made in Frederick|available now/i);
  await expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth); await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  links[0].focus(); await expect(links[0]).toHaveFocus(); await userEvent.tab(); await expect(links[1]).toHaveFocus(); await userEvent.tab(); await expect(links[2]).toHaveFocus();
}
export const Dining320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: checkMosaic };
export const Dining375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: checkMosaic };
export const Dining390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: checkMosaic };
export const Dining430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, play: checkMosaic };
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  beforeEach: () => { const previous = document.documentElement.style.fontSize; document.documentElement.style.fontSize = "200%"; return () => { document.documentElement.style.fontSize = previous; }; },
  play: context => checkMosaic(context, true),
};
export const DifferentTown: Story = {
  args: { scope: "town:brunswick", returnTo: "/today?in=brunswick" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), link = canvas.getByRole("link", { name: "Find pizza" });
    await expect(canvasElement.querySelectorAll("[data-today-geographic-place]")).toHaveLength(0);
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await decoded(link, subjects[0]); await physicalLink(link);
    await expect(new URL(link.getAttribute("href")!, "https://radius.test").searchParams.get("in")).toBe("brunswick");
    await expect(canvasElement.textContent).toBe("Find pizza");
  },
};
export const NearbyLens: Story = { ...DifferentTown, args: { scope: "nearme", returnTo: "/today?in=nearme" }, play: async ({ canvasElement }) => {
  const link = within(canvasElement).getByRole("link", { name: "Find pizza" });
  await expect(new URL(link.getAttribute("href")!, "https://radius.test").searchParams.get("in")).toBe("nearme");
  await expect(canvasElement.querySelector("[data-today-geographic-place]")).toBeNull(); await decoded(link, subjects[0]); await physicalLink(link);
} };
export const ScopePending: Story = { render: () => <TodayGeographicDoorwayPending />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(canvas.queryByRole("link")).not.toBeInTheDocument(); await expect(canvas.queryByRole("img")).not.toBeInTheDocument(); await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  await expect(canvasElement.querySelector("[data-today-geographic-pending]")).toHaveAttribute("aria-hidden", "true");
} };
export const OneFailedLicensedImageKeepsEveryAction: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), failed = canvas.getByRole("link", { name: subjects[2].label });
    failed.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(async () => { await expect(failed.querySelector("img")).toBeNull(); });
    await expect(failed).toHaveAttribute("data-photo-state", "failed"); await physicalLink(failed);
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    for (const subject of subjects.slice(0, 2)) { const link = canvas.getByRole("link", { name: subject.label }); await decoded(link, subject); await physicalLink(link); }
    await expect(canvasElement.querySelectorAll("[data-today-discovery-action]")).toHaveLength(3);
  },
};
