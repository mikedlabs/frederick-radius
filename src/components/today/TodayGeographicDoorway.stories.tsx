import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TodayGeographicDoorwayPending, TodayGeographicDoorwayView } from "./TodayGeographicDoorway";
import { localDiscoveryPlaces, type LocalDiscoveryPlace } from "@/lib/today/discovery-places";

const subjects = localDiscoveryPlaces("county");
const origin = "/today?in=county&intent=coffee#find-radius";
const meta = {
  title: "Today/Local photo discovery", component: TodayGeographicDoorwayView,
  parameters: { layout: "centered", a11y: { test: "error" } },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { scope: "county", returnTo: origin },
} satisfies Meta<typeof TodayGeographicDoorwayView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Check the actual pointer owner across the complete 44px target, including
 * captions and wrapped copy. Browser gates also activate the real anchor once;
 * preventing the default here keeps the isolated workshop on this story. */
async function physicalLink(link: HTMLElement, activate = false) {
  link.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const box = link.getBoundingClientRect(), owner = link.ownerDocument;
  await expect(box.width).toBeGreaterThanOrEqual(44); await expect(box.height).toBeGreaterThanOrEqual(44);
  const hits = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
    const hit = owner.elementFromPoint(box.left + box.width / 2 + dx, box.top + box.height / 2 + dy);
    return Boolean(hit && (hit === link || link.contains(hit)));
  });
  await expect(hits).toEqual([true, true, true, true, true]);
  for (const copy of Array.from(link.querySelectorAll("h3, p, span")).filter(node => node.textContent?.trim())) {
    const text = owner.createRange(); text.selectNodeContents(copy);
    for (const line of text.getClientRects()) {
      await expect(line.left).toBeGreaterThanOrEqual(box.left - 1); await expect(line.right).toBeLessThanOrEqual(box.right + 1);
      await expect(line.top).toBeGreaterThanOrEqual(box.top - 1); await expect(line.bottom).toBeLessThanOrEqual(box.bottom + 1);
    }
  }
  await expect(link.querySelectorAll("a, button, input, select")).toHaveLength(0);
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  if (activate && inBrowserGate) {
    const { userEvent: nativeUserEvent } = await import("vitest/browser");
    const activations: boolean[] = [];
    const onClick = (event: Event) => { event.preventDefault(); activations.push(event.isTrusted); };
    link.addEventListener("click", onClick, { capture: true });
    const oldLocation = window.location.href;
    try {
      await nativeUserEvent.click(link); await expect(activations).toEqual([true]); await expect(window.location.href).toBe(oldLocation);
    } finally { link.removeEventListener("click", onClick, { capture: true }); await nativeUserEvent.cleanup(); }
  }
}

async function decoded(link: HTMLElement, place: LocalDiscoveryPlace) {
  const source = place.photoPlan.sources[0];
  const image = within(link).getByRole("img", { name: source.alt }) as HTMLImageElement;
  image.scrollIntoView({ block: "nearest" });
  await waitFor(async () => { await image.decode(); await expect(image.naturalWidth).toBeGreaterThan(1); await expect(link).toHaveAttribute("data-photo-state", "loaded"); }, { timeout: 5000 });
  await expect(decodeURIComponent(image.currentSrc || image.src)).toContain(source.src);
  await waitFor(async () => { await expect(image).toBeVisible(); await expect(getComputedStyle(image).opacity).toBe("1"); });
}

async function checkDiscovery({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0], enlarged = false) {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("heading", { name: "Explore local", level: 2 })).toHaveClass("sr-only");
  const links = subjects.map(place => canvas.getByRole("link", { name: `View ${place.name} in ${place.town}` }));
  await expect(canvasElement.querySelectorAll("[data-today-geographic-place]")).toHaveLength(2);
  await expect(canvas.getAllByRole("img")).toHaveLength(2);
  for (const [index, place] of subjects.entries()) {
    const link = links[index]; await decoded(link, place);
    await expect(within(link).getByRole("heading", { name: place.shortName ?? place.name, level: 3 })).toBeVisible();
    await expect(within(link).getByText(place.town, { exact: true })).toBeVisible();
    const url = new URL(link.getAttribute("href")!, "https://radius.test");
    await expect(url.pathname).toBe(`/places/${place.slug}`); await expect(url.searchParams.get("in")).toBe("county");
    await expect(url.searchParams.get("returnTo")).toBe(origin);
    const photo = link.querySelector<HTMLElement>("[data-place-card-photo]")!.getBoundingClientRect();
    const caption = link.querySelector<HTMLElement>("[data-today-geographic-caption]")!.getBoundingClientRect();
    await expect(caption.top).toBeGreaterThanOrEqual(photo.bottom - 1);
    await expect(photo.width / photo.height).toBeCloseTo(4 / 3, 1);
    await physicalLink(link, true);
  }
  const grid = canvasElement.querySelector<HTMLElement>("[data-today-discovery-grid]")!;
  const first = links[0].getBoundingClientRect(), second = links[1].getBoundingClientRect();
  if (enlarged) {
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    await expect(second.top).toBeGreaterThanOrEqual(first.bottom - 1);
  } else {
    await expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(1);
    await expect(Math.abs(first.bottom - second.bottom)).toBeLessThanOrEqual(1);
    await expect(first.width).toBeLessThan(grid.getBoundingClientRect().width * 0.6);
  }
  for (const [name, category] of [["Eat & drink", "food"], ["Get outside", "outside"]]) {
    const link = canvas.getByRole("link", { name }); const url = new URL(link.getAttribute("href")!, "https://radius.test");
    await expect(url.pathname).toBe("/nearby"); await expect(url.searchParams.get("c")).toBe(category);
    await expect(url.searchParams.get("in")).toBe("county"); await expect(url.searchParams.get("returnTo")).toBe(origin);
    await expect(url.searchParams.has("facet")).toBe(false); await physicalLink(link, true);
  }
  await expect(canvasElement.textContent).not.toMatch(/pizza|Zoe|Sabor|open now|recommended|available now/i);
  await expect(canvasElement.querySelector("[data-today-discovery-credit], .place-card-photo-credit")).toBeNull();
  await expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth + 1);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  links[0].focus(); await expect(links[0]).toHaveFocus(); await userEvent.tab(); await expect(links[1]).toHaveFocus();
  await userEvent.tab({ shift: true }); await expect(links[0]).toHaveFocus();
}

export const Local320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: checkDiscovery };
export const Local375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: checkDiscovery };
export const Local390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: checkDiscovery };
export const Local430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, play: checkDiscovery };
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  beforeEach: () => { const previous = document.documentElement.style.fontSize; document.documentElement.style.fontSize = "200%"; return () => { document.documentElement.style.fontSize = previous; }; },
  play: context => checkDiscovery(context, true),
};
export const Dark390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => { const previous = document.documentElement.dataset.appearance; document.documentElement.dataset.appearance = "dark"; return () => { if (previous === undefined) delete document.documentElement.dataset.appearance; else document.documentElement.dataset.appearance = previous; }; },
  play: checkDiscovery,
};

export const DifferentTown: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { scope: "town:brunswick", returnTo: "/today?in=brunswick#today-discovery" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), [place] = localDiscoveryPlaces("town:brunswick");
    const link = canvas.getByRole("link", { name: `View ${place.name} in ${place.town}` });
    await expect(canvasElement.querySelectorAll("[data-today-geographic-place]")).toHaveLength(1);
    await decoded(link, place); await physicalLink(link, true);
    await expect(canvasElement.textContent).not.toMatch(/Frederick|Carillon|Sophie|pizza/);
    const credit = canvasElement.querySelector<HTMLElement>("[data-today-discovery-credit]")!;
    await expect(credit).not.toBeNull(); await expect(link.contains(credit)).toBe(false);
    for (const anchor of Array.from(credit.querySelectorAll("a"))) await physicalLink(anchor);
    await expect(new URL(link.getAttribute("href")!, "https://radius.test").searchParams.get("returnTo")).toBe("/today?in=brunswick#today-discovery");
    for (const name of ["Eat & drink", "Get outside"]) {
      const task = canvas.getByRole("link", { name }); await physicalLink(task, true);
      await expect(new URL(task.getAttribute("href")!, "https://radius.test").searchParams.get("in")).toBe("brunswick");
    }
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  },
};

/** Licensed credits must remain independent, readable controls when long
 * text reflows the two-place layout and a disclosure increases its height. */
export const ThurmontEnlargedCredits320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  args: { scope: "town:thurmont", returnTo: "/today?in=thurmont#today-discovery" },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), places = localDiscoveryPlaces("town:thurmont");
    await expect(places).toHaveLength(2);
    const links = places.map(place => canvas.getByRole("link", { name: `View ${place.name} in ${place.town}` }));
    const credits = places.map(place => canvasElement.querySelector<HTMLElement>(`[data-today-discovery-credit="${place.slug}"]`)!);
    for (const [index, place] of places.entries()) {
      await expect(place.photoPlan.sources[0].kind).toBe("curated");
      await decoded(links[index], place);
      await expect(credits[index]).not.toBeNull();
      await expect(links[index].contains(credits[index])).toBe(false);
      for (const anchor of Array.from(credits[index].querySelectorAll("a"))) await physicalLink(anchor);
      await expect(credits[index].querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
    }

    const summary = credits[0].querySelector<HTMLElement>("details > summary")!;
    const disclosure = summary.closest("details")!;
    await physicalLink(summary);
    summary.focus(); await expect(summary).toHaveFocus();
    const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
    if (inBrowserGate) {
      const { userEvent: nativeUserEvent } = await import("vitest/browser");
      try { await nativeUserEvent.click(summary); } finally { await nativeUserEvent.cleanup(); }
    } else {
      await userEvent.click(summary);
    }
    await expect(disclosure).toHaveAttribute("open");
    await expect(credits[0].querySelector(".place-card-photo-credit-details")).toBeVisible();

    const first = links[0].getBoundingClientRect(), firstCredit = credits[0].getBoundingClientRect();
    const second = links[1].getBoundingClientRect(), secondCredit = credits[1].getBoundingClientRect();
    const tasks = canvas.getByRole("navigation", { name: "Browse by need" }).getBoundingClientRect();
    await expect(firstCredit.top).toBeGreaterThanOrEqual(first.bottom - 1);
    await expect(second.top).toBeGreaterThanOrEqual(firstCredit.bottom - 1);
    await expect(secondCredit.top).toBeGreaterThanOrEqual(second.bottom - 1);
    await expect(tasks.top).toBeGreaterThanOrEqual(secondCredit.bottom - 1);
    for (const name of ["Eat & drink", "Get outside"]) await physicalLink(canvas.getByRole("link", { name }));
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  },
};

async function checkTasksOnly({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0], scope: string, returnTo: string) {
  const canvas = within(canvasElement);
  await expect(canvasElement.querySelector("[data-today-discovery-grid], [data-today-geographic-place], img, .place-card-photo-credit")).toBeNull();
  await expect(canvasElement.querySelectorAll("[data-today-discovery-action]")).toHaveLength(2);
  for (const [name, category] of [["Eat & drink", "food"], ["Get outside", "outside"]]) {
    const link = canvas.getByRole("link", { name }); await physicalLink(link, true);
    const url = new URL(link.getAttribute("href")!, "https://radius.test");
    await expect(url.pathname).toBe("/nearby"); await expect(url.searchParams.get("c")).toBe(category);
    await expect(url.searchParams.get("in")).toBe(scope); await expect(url.searchParams.get("returnTo")).toBe(returnTo);
  }
  await expect(canvasElement.textContent).not.toMatch(/Frederick|Carillon|Sophie|pizza/);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
}
export const NoLocalPhoto: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { scope: "town:mount-airy", returnTo: "/today?in=mount-airy#today-discovery" },
  play: context => checkTasksOnly(context, "mount-airy", "/today?in=mount-airy#today-discovery"),
};
export const NearbyLens: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { scope: "nearme", returnTo: "/today?in=nearme#today-discovery" },
  play: context => checkTasksOnly(context, "nearme", "/today?in=nearme#today-discovery"),
};
export const ScopePending: Story = { render: () => <TodayGeographicDoorwayPending />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(canvas.queryByRole("link")).not.toBeInTheDocument(); await expect(canvas.queryByRole("img")).not.toBeInTheDocument(); await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  await expect(canvasElement.querySelector("[data-today-geographic-pending]")).toHaveAttribute("aria-hidden", "true");
} };
export const FailedPhotoKeepsExactDestination: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), place = subjects[0];
    const failed = canvas.getByRole("link", { name: `View ${place.name} in ${place.town}` });
    await decoded(failed, place); const href = failed.getAttribute("href");
    failed.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(async () => { await expect(failed.querySelector("img")).toBeNull(); });
    await expect(failed).toHaveAttribute("data-photo-state", "failed"); await physicalLink(failed, true);
    await expect(within(failed).getByRole("heading", { name: "Baker Park Carillon" })).toBeVisible();
    await expect(within(failed).getByText(place.town, { exact: true })).toBeVisible(); await expect(failed.getAttribute("href")).toBe(href);
    for (const name of ["Eat & drink", "Get outside"]) await physicalLink(canvas.getByRole("link", { name }), true);
    await expect(canvas.getAllByRole("img")).toHaveLength(1);
    await expect(canvasElement.querySelectorAll("[data-today-geographic-place]")).toHaveLength(2);
  },
};
