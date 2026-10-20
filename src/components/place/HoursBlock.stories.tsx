import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Hours } from "@/data/places";
import { easternDayKey } from "@/lib/tz";
import HoursBlock from "./HoursBlock";

const now = new Date();
const today = easternDayKey(now);
const hours: Hours = {
  mon: [{ open: "10:00", close: "21:00" }], tue: [{ open: "10:00", close: "21:00" }],
  wed: [{ open: "10:00", close: "21:00" }], thu: [{ open: "10:00", close: "21:00" }],
  fri: [{ open: "10:00", close: "17:00" }], sat: [{ open: "10:00", close: "17:00" }], sun: [{ open: "13:00", close: "17:00" }],
  _official: { slug: "demonstration-library", source_url: "https://www.fcpl.org/branches-hours/c-burr-artz-public-library", closures_url: "https://www.fcpl.org/holiday-closings", observed_at: new Date(+now - 60_000).toISOString(), expires_at: new Date(+now + 6 * 86_400_000).toISOString(), coverage_from: today, coverage_through: easternDayKey(new Date(+now + 7 * 86_400_000)), exceptions: [{ date: today, closed: true, reason: "Demonstration closure" }] },
};
const meta = {
  title: "Places/Official hours", component: HoursBlock, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(24rem,calc(100vw-32px))]"><p className="mb-3 text-sm">Demonstration schedule. This is a component example, not current library status.</p><Story /></div>],
  args: { hours, verified: true, provenance: "Demonstration of hours from an official source." },
} satisfies Meta<typeof HoursBlock>;
export default meta;
type Story = StoryObj<typeof meta>;
async function expectTouchDisclosure(label: HTMLElement) {
  const summary = label.closest("summary");
  if (!summary) throw new Error("Hours label must belong to its native disclosure");
  await expect(summary).toBeVisible();
  const rect = summary.getBoundingClientRect();
  await expect(rect.width).toBeGreaterThanOrEqual(44);
  await expect(rect.height).toBeGreaterThanOrEqual(44);
  for (const [dx, dy] of [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]]) {
    const hit = summary.ownerDocument.elementFromPoint(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2 + dy);
    await expect(hit !== null && summary.contains(hit)).toBe(true);
  }
}
async function expectTouchLink(link: HTMLElement) {
  link.scrollIntoView({ block: "center", inline: "nearest" });
  await waitFor(async () => {
    const box = link.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    for (const [dx, dy] of [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]]) {
      const hit = link.ownerDocument.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      await expect(hit !== null && link.contains(hit)).toBe(true);
    }
  });
}
export const DatedClosure: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectTouchDisclosure(canvas.getByText("Hours today · Closed"));
    await userEvent.click(canvas.getByText("Hours today · Closed"));
    const branch = canvas.getByRole("link", { name: "Official branch hours" });
    const closures = canvas.getByRole("link", { name: "FCPL holiday closures" });
    await expect(branch).toHaveAttribute("href", "https://www.fcpl.org/branches-hours/c-burr-artz-public-library");
    await expect(closures).toHaveAttribute("href", "https://www.fcpl.org/holiday-closings");
    await expectTouchLink(branch);
    await expectTouchLink(closures);
    const first = branch.getBoundingClientRect();
    const second = closures.getBoundingClientRect();
    if (second.top >= first.bottom) await expect(second.top - first.bottom).toBeGreaterThanOrEqual(4);
    else await expect(second.left - first.right).toBeGreaterThanOrEqual(12);
    await expect(canvas.getByText(/normal weekly hours/)).toBeVisible();

    // Larger reading text wraps these same source links onto separate rows.
    // Restore the workshop root even when an ownership assertion fails.
    const root = canvasElement.ownerDocument.documentElement;
    const fontSize = root.style.getPropertyValue("font-size");
    const fontPriority = root.style.getPropertyPriority("font-size");
    try {
      root.style.setProperty("font-size", "200%");
      await expectTouchLink(branch);
      await expectTouchLink(closures);
      await expect(closures.getBoundingClientRect().top - branch.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(4);
    } finally {
      if (fontSize) root.style.setProperty("font-size", fontSize, fontPriority);
      else root.style.removeProperty("font-size");
    }
  },
};

export const Unconfirmed: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { hours: undefined, website: "https://example.org/", phone: "301-555-0100", provenance: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Hours not recently confirmed")).toBeVisible();
    const website = canvas.getByRole("link", { name: "Check the official website" });
    const phone = canvas.getByRole("link", { name: "Call to check hours" });
    await expect(website).toHaveAttribute("href", "https://example.org/");
    await expect(website).toHaveAttribute("target", "_blank");
    await expect(phone).toHaveAttribute("href", "tel:3015550100");
    // Both wrapped actions retain independent physical hit areas in WebKit.
    await expectTouchLink(website);
    await expectTouchLink(phone);
    const first = website.getBoundingClientRect();
    const second = phone.getBoundingClientRect();
    await expect(second.top - first.bottom).toBeGreaterThanOrEqual(4);
    await expect(canvas.queryByText(/Hours today/)).not.toBeInTheDocument();
  },
};
export const MerchantWeek: Story = {
  args: { hours: { ...hours, _official: { ...hours._official!, kind: "merchant", schedule_kind: "weekly", source_name: "Demonstration cafe", source_url: "https://example.org/", closures_url: undefined, exceptions: [] } }, provenance: "Hours from the demonstration cafe." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectTouchDisclosure(canvas.getByText(/Hours today/));
    await userEvent.click(canvas.getByText(/Hours today/));
    await expect(canvas.getByRole("link", { name: "Official business hours" })).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "FCPL holiday closures" })).not.toBeInTheDocument();
  },
};
