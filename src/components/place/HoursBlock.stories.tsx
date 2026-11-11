import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Hours } from "@/data/places";
import { easternDayKey } from "@/lib/tz";
import HoursBlock from "./HoursBlock";
import LiveOpenStatus from "./LiveOpenStatus";

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

/** A place with no schedule renders no hours block. Its status line under
 * the title carries the caveat and the date the hours were last checked. */
export const NoScheduleStatusLine: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { docs: { description: { story: "A place with no usable schedule shows no hours block. The status line keeps the plain caveat, with the date the hours themselves were last checked on its own line under it." } } },
  render: () => (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <LiveOpenStatus verified={false} initial={{ state: "unknown" }} hoursCheckedAt={new Date(+now - 30 * 86_400_000).toISOString()} />
      <span className="font-medium" style={{ color: "var(--app-ink-3)" }}>$$</span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const caveat = canvas.getByText("Hours not recently confirmed", { exact: true });
    await expect(caveat).toBeVisible();
    // A plain date, never the green "checked at source" badge.
    const checked = canvas.getByText(/^Hours last checked /);
    await expect(canvas.queryByText(/checked at source/)).not.toBeInTheDocument();
    await expect(checked).toBeVisible();
    await expect(canvas.queryByText(/Check with the business/)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/Hours today/)).not.toBeInTheDocument();
    // The date sits on its own line under the caveat, so a wrapped row never
    // starts with a separator dot, and nothing overflows a 320px phone,
    // including at 200 percent text.
    await expect(checked.getBoundingClientRect().top).toBeGreaterThanOrEqual(caveat.getBoundingClientRect().bottom - 1);
    await expect(window.getComputedStyle(checked, "::before").content).toBe("none");
    const doc = canvasElement.ownerDocument;
    const root = doc.documentElement;
    const fontSize = root.style.getPropertyValue("font-size");
    try {
      root.style.setProperty("font-size", "200%");
      await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(doc.defaultView!.innerWidth + 1);
      await expect(checked).toBeVisible();
    } finally {
      if (fontSize) root.style.setProperty("font-size", fontSize);
      else root.style.removeProperty("font-size");
    }
  },
};

export const NativeBeforeClientListeners: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { docs: { description: { story: "The real HoursBlock markup is copied without React listeners, representing native interaction before its JavaScript is ready. Its arrow follows the actual disclosure instead of waiting for a missed client toggle event." } } },
  render: (args) => <>
    <div hidden data-hours-markup-reference><HoursBlock {...args} /></div>
    <div data-hours-native-surface />
  </>,
  play: async ({ canvasElement }) => {
    const original = canvasElement.querySelector("[data-hours-markup-reference] details");
    const surface = canvasElement.querySelector("[data-hours-native-surface]");
    if (!original || !surface) throw new Error("The actual hours markup is required for the native disclosure regression.");
    // cloneNode copies actual markup, but never React's listeners or state.
    const disclosure = original.cloneNode(true) as HTMLDetailsElement;
    surface.replaceChildren(disclosure);
    const summary = disclosure.querySelector("summary")!;
    const arrow = summary.querySelector("svg")!;
    const rotated = () => {
      const style = getComputedStyle(arrow);
      return style.rotate === "180deg" || style.transform === "matrix(-1, 0, 0, -1, 0, 0)";
    };
    await expectTouchDisclosure(summary);
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(rotated()).toBe(false);
    const browser = (globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__
      ? await import("vitest/browser") : undefined;
    let trustedPointer = false;
    summary.addEventListener("pointerdown", event => { trustedPointer = event.isTrusted; }, { once: true });
    if (browser) await browser.userEvent.click(summary);
    else await userEvent.click(summary);
    if (browser) await expect(trustedPointer).toBe(true);
    await waitFor(async () => {
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(rotated()).toBe(true);
    });
    await expect(surface.querySelector("details")).toBe(disclosure);
    summary.focus();
    if (browser) await browser.userEvent.keyboard("{Enter}");
    else await userEvent.click(summary);
    await waitFor(async () => {
      await expect(disclosure).not.toHaveAttribute("open");
      await expect(rotated()).toBe(false);
    });
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

const qualifiedMuseum: Hours = {
  mon: [{ open: "10:00", close: "17:00" }], tue: [{ open: "10:00", close: "17:00" }],
  wed: [{ open: "10:00", close: "17:00" }], thu: [{ open: "10:00", close: "17:00" }],
  fri: [{ open: "10:00", close: "17:00" }], sat: [{ open: "10:00", close: "17:00" }], sun: [{ open: "10:00", close: "17:00" }],
  _official: {
    ...hours._official!, kind: "merchant", schedule_kind: "weekly", slug: "demonstration-museum",
    source_name: "Demonstration museum", source_url: "https://example.org/museum-hours", closures_url: undefined, exceptions: [],
    qualification: {
      scope: "venue", label: "Museum hours", usage: "display_only",
      note: "Last admission is at 4:30pm. The museum closes at 5pm.",
    },
  },
};

export const QualifiedMuseum: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { hours: qualifiedMuseum, provenance: "Demonstration of a checked museum schedule with a separate admission cutoff." },
  render: (args) => <>
    <div className="mb-3"><LiveOpenStatus hours={args.hours} verified={Boolean(args.verified)} initial={{ state: "unknown" }} /></div>
    <HoursBlock {...args} />
  </>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = canvas.getByText("Last admission is at 4:30pm. The museum closes at 5pm.");
    await expect(note).toBeVisible();
    await expect(note.closest("details")).toBeNull();
    await expect(canvas.getByText("Venue opening not confirmed")).toBeVisible();
    await expect(canvas.getByText("Checked at source")).toBeVisible();
    await expect(canvas.queryByText("Unconfirmed")).not.toBeInTheDocument();
    const label = canvas.getByText("Museum hours today · 10am–5pm");
    await expectTouchDisclosure(label);
    const summary = label.closest("summary")!;
    const browser = (globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__
      ? await import("vitest/browser") : undefined;
    if (browser) {
      // Synthetic key events do not invoke a browser's native <summary>
      // activation. Establish the current story frame with trusted input,
      // then prove the real Enter default action without app key handlers.
      let trustedPointer = false;
      note.addEventListener("pointerdown", (event) => { trustedPointer = event.isTrusted; }, { once: true });
      await browser.userEvent.click(note);
      await expect(trustedPointer).toBe(true);
      summary.focus();
      await expect(summary).toHaveFocus();
      await browser.userEvent.keyboard("{Enter}");
    } else {
      await userEvent.click(summary);
    }
    await waitFor(async () => expect(canvas.getByRole("list", { name: "Museum hours by day" })).toBeVisible());
    await expectTouchLink(canvas.getByRole("link", { name: "Official museum hours" }));
    await expect(canvas.queryByText(/not current enough/)).not.toBeInTheDocument();
    const section = canvas.getByRole("region", { name: "Museum hours" });
    const root = canvasElement.ownerDocument.documentElement;
    const fontSize = root.style.getPropertyValue("font-size");
    try {
      root.style.setProperty("font-size", "200%");
      await expect(note).toBeVisible();
      // Opening the disclosure starts the chevron's rotation. A square turning
      // through 45 degrees is briefly wider than itself, so measure the
      // section at rest rather than mid-turn on a slow runner.
      await Promise.all(section.getAnimations({ subtree: true }).map((animation) => animation.finished));
      await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
    } finally {
      if (fontSize) root.style.setProperty("font-size", fontSize);
      else root.style.removeProperty("font-size");
    }
    summary.focus();
    if (browser) await browser.userEvent.keyboard(" ");
    else await userEvent.click(summary);
    await waitFor(async () => expect(summary.closest("details")).not.toHaveAttribute("open"));
    await expect(summary).toHaveFocus();
    await expect(note).toBeVisible();
  },
};

export const QualifiedKitchen: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  args: {
    hours: { ...qualifiedMuseum, _official: { ...qualifiedMuseum._official!, qualification: {
      scope: "kitchen", label: "Kitchen hours", usage: "display_only", note: "These are kitchen hours. Bar hours may differ.",
    } } },
    provenance: "Demonstration of checked kitchen hours.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("These are kitchen hours. Bar hours may differ.")).toBeVisible();
    await expectTouchDisclosure(canvas.getByText("Kitchen hours today · 10am–5pm"));
    await expect(canvas.getByText("Checked at source")).toBeVisible();
  },
};

export const ExpiredQualifiedMuseum: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    hours: { ...qualifiedMuseum, _official: {
      ...qualifiedMuseum._official!, observed_at: new Date(+now - 8 * 86_400_000).toISOString(),
      expires_at: new Date(+now - 86_400_000).toISOString(),
    } },
    provenance: "Demonstration of a retained schedule that needs a new source check.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Last admission is at 4:30pm. The museum closes at 5pm.")).toBeVisible();
    await expect(canvas.getByText("Needs a new check")).toBeVisible();
    await expect(canvas.queryByText("Checked at source")).not.toBeInTheDocument();
    const label = canvas.getByText("Museum hours today · Hours not confirmed");
    await expectTouchDisclosure(label);
    await userEvent.click(label);
    await expect(canvas.getByText("This posted schedule needs a new source check. Check the official source before going.")).toBeVisible();
    await expect(canvas.getByRole("list", { name: "Museum hours by day" })).toBeVisible();
    await expectTouchLink(canvas.getByRole("link", { name: "Official museum hours" }));
  },
};
