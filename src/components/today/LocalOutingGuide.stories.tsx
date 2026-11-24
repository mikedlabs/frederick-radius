import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { downtownGuide, downtownGuideForDate, weekendGuide } from "@/lib/today/local-outing-guides";
import LocalOutingGuide from "./LocalOutingGuide";

const todayOrigin = "/today?in=frederick#local-outings";
const weekend = weekendGuide(new Date("2026-11-20T19:00:00-05:00"));

const meta = {
  title: "Today/Local outing guide",
  component: LocalOutingGuide,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => (
    <main className="app-main-reading mx-auto max-w-screen-md pt-4 sm:pt-6 lg:max-w-screen-lg"><Story /></main>
  )],
  args: { guide: downtownGuide, returnTo: todayOrigin },
} satisfies Meta<typeof LocalOutingGuide>;
export default meta;
type Story = StoryObj<typeof meta>;

const usableGuide: NonNullable<Story["play"]> = async ({ args, canvasElement, userEvent }) => {
  const canvas = within(canvasElement);
  await canvasElement.ownerDocument.fonts.ready;
  const heading = canvas.getByRole("heading", { level: 1, name: args.guide.title });
  await expect(heading).toBeVisible();
  await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth + 1);
  await expect(canvas.getByRole("img", { name: args.guide.photo.alt })).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Back to Today" })).toHaveAttribute(
    "href",
    args.returnTo === todayOrigin ? todayOrigin : "/today",
  );
  if (args.guide.route) {
    const overview = within(canvas.getByRole("navigation", { name: "Route overview" }));
    for (const stop of args.guide.stops) {
      const link = overview.getByRole("link", { name: new RegExp(stop.routeName!) });
      await expect(link).toHaveAttribute("href", `#${stop.anchor}`);
      await expect(link).toHaveTextContent(stop.suggestedMinutes ? `${stop.suggestedMinutes} min` : "Start");
      await expect(canvasElement.querySelector(`[id="${stop.anchor}"]`)).toBeTruthy();
    }
    const notice = args.guide.notice;
    if (notice) {
      const aside = within(canvas.getByRole("complementary", { name: notice.heading }));
      if (notice.active) await expect(aside.getByText(notice.text)).toBeVisible();
      else await expect(aside.getByText(notice.text)).not.toBeVisible();
      await userEvent.click(aside.getByText(notice.active ? "Holiday hours and parking sources" : `${notice.heading} · Closures and parking`));
      await expect(aside.getByText(notice.text)).toBeVisible();
      for (const source of notice.sources) await expect(aside.getByRole("link", { name: source.label })).toHaveAttribute("href", source.href);
    }
    const { credit } = args.guide.photo;
    if (credit) {
      await userEvent.click(canvas.getByText(`${credit.creator} · ${credit.capturedYear}`));
      await expect(canvas.getByRole("link", { name: `Photo by ${credit.creator}` })).toHaveAttribute("href", credit.source_url);
      await expect(canvas.getByRole("link", { name: credit.license.label })).toHaveAttribute("href", credit.license.url);
    }
  }
  const stops = args.guide.route ? canvas.getByRole("list", { name: "Walking itinerary" }) : canvas.getByRole("list");
  const items = within(stops).getAllByRole("listitem");
  await expect(items).toHaveLength(args.guide.stops.length);
  for (const [index, stop] of args.guide.stops.entries()) {
    const item = within(items[index]);
    const action = item.getByRole("link", { name: `${stop.action.label} for ${stop.title}` });
    await expect(action).toHaveAttribute("href", stop.action.href);
    if (stop.price) await expect(item.getByText(stop.price)).toBeVisible();
    if (stop.photo) {
      await expect(item.getByRole("img", { name: stop.photo.alt })).toBeVisible();
      if (stop.photo.credit) {
        await expect(item.getByRole("link", { name: `Photo source, ${stop.photo.credit.creator}` }))
          .toHaveAttribute("href", stop.photo.credit.source_url);
        await expect(item.getByRole("link", { name: stop.photo.credit.license.label }))
          .toHaveAttribute("href", stop.photo.credit.license.url);
      }
    }
    const disclosure = item.getByLabelText(`Details and source for ${stop.title}`);
    await expect(disclosure.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(item.getByText(stop.description)).not.toBeVisible();
    await userEvent.click(disclosure);
    await expect(item.getByText(stop.description)).toBeVisible();
    if (stop.source.href !== stop.action.href) {
      await expect(item.getByRole("link", { name: `${stop.source.label}, source for ${stop.title}` }))
        .toHaveAttribute("href", stop.source.href);
    }
  }
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  for (const link of canvas.getAllByRole("link")) {
    const bounds = link.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth + 1);
  }
};

export const DowntownOnPhone: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { guide: downtownGuideForDate(new Date("2026-11-24T17:00:00Z")) },
  play: usableGuide,
};

export const ThanksgivingOnPhone: Story = {
  args: { guide: downtownGuideForDate(new Date("2026-11-26T17:00:00Z")) },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: usableGuide,
};

export const WeekendOnPhone: Story = {
  args: { guide: weekend, returnTo: "https://example.org/" },
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  play: usableGuide,
};

export const NarrowWithEnlargedText: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "200%";
    return () => { root.style.fontSize = previous; };
  },
  play: usableGuide,
};

export const WeekendInDarkAppearance: Story = {
  args: { guide: weekend },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.dataset.appearance;
    root.dataset.appearance = "dark";
    return () => {
      if (previous === undefined) delete root.dataset.appearance;
      else root.dataset.appearance = previous;
    };
  },
  play: usableGuide,
};
