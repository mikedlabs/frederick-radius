import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import TodaySectionHeading from "./TodaySectionHeading";
import styles from "./TodayLayout.module.css";

const meta = {
  title: "Today/Section heading",
  component: TodaySectionHeading,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story, context) => context.parameters.radiusHeadingPlacesFrame ? (
    <main data-heading-reading-frame data-app-primary-tab="/today" className="app-main-reading"
      style={{ width: 320, maxWidth: "100vw", boxSizing: "border-box" }}>
      <div className={styles.currentContent}>
        <div data-heading-places-grid className={styles.places}>
          <section data-heading-place-section data-today-decision-density="brief">
            <Story />
            <article data-heading-fixture-card className="mt-2 min-w-0 border p-3">
              <h3 className="text-base font-semibold">Offline layout fixture</h3>
              <p className="mt-1 text-sm [overflow-wrap:anywhere]">This fictional card tests the real places column without loading places or media.</p>
            </article>
          </section>
          <article data-heading-fixture-card className="min-w-0 border p-3">
            <h3 className="text-base font-semibold">Second layout fixture</h3>
            <p className="mt-1 text-sm [overflow-wrap:anywhere]">A sibling must fit the same reading column.</p>
          </article>
        </div>
      </div>
    </main>
  ) : <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { title: "Places for right now", meta: "Current hours and nearby options", href: "/places" },
} satisfies Meta<typeof TodaySectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;
export const NeutralSection: Story = {};
export const LiveSection: Story = { args: { title: "Happening now", live: true, href: "/events" } };

type Context = Parameters<NonNullable<Story["play"]>>[0];

/** Source-free layout acceptance. The real grid and shared heading are mounted;
 * fixture cards make an expanding implicit track observable on its siblings. */
async function exercisePlacesHeading({ canvasElement, args }: Context) {
  const document = canvasElement.ownerDocument;
  const view = document.defaultView!;
  const root = document.documentElement;
  const previousSize = root.style.getPropertyValue("font-size");
  const previousPriority = root.style.getPropertyPriority("font-size");
  const previousViewport = { width: view.innerWidth, height: view.innerHeight };
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  const browser = inBrowserGate ? await import("vitest/browser") : null;
  const canvas = within(canvasElement);
  const frame = canvasElement.querySelector<HTMLElement>("[data-heading-reading-frame]")!;
  const grid = canvasElement.querySelector<HTMLElement>("[data-heading-places-grid]")!;
  const heading = canvasElement.querySelector<HTMLElement>("[data-today-section-heading]")!;
  const copy = heading.querySelector<HTMLElement>(".today-section-heading__copy")!;
  const title = within(heading).getByRole("heading", { name: args.title });
  const metaText = heading.querySelector<HTMLElement>("p")!;
  const action = canvas.getByRole("link", { name: `${args.cta}: ${args.title}` });
  const size = (element: Element) => parseFloat(view.getComputedStyle(element).fontSize);
  const origin = view.location.href;

  const physicalAction = async (minimumHeight: number) => waitFor(async () => {
    // Native focus scrolling may settle across paints. Never pre-focus or
    // scroll the action to manufacture keyboard reachability or physical hits.
    const box = action.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const hits = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]].map(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return px >= 0 && py >= 0 && px < view.innerWidth && py < view.innerHeight
        && (hit === action || Boolean(hit && action.contains(hit)));
    });
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(minimumHeight);
    await expect(hits, "the action owns its center and four physical44px cardinal samples").toEqual([true, true, true, true, true]);
  });

  const readableLayout = async () => {
    await waitFor(() => expect(copy).toBeVisible());
    const frameBox = frame.getBoundingClientRect();
    const frameStyle = view.getComputedStyle(frame);
    const left = frameBox.left + parseFloat(frameStyle.paddingLeft);
    const right = frameBox.right - parseFloat(frameStyle.paddingRight);
    await expect(frameBox.width).toBe(320);
    await expect(right - left, "the real narrow Today reading column retains physical16px gutters").toBe(288);
    const cards = [...canvasElement.querySelectorAll<HTMLElement>("[data-heading-fixture-card]")];
    for (const element of [grid, heading, copy, title, metaText, action, ...cards]) {
      const box = element.getBoundingClientRect();
      await expect(element).toBeVisible();
      await expect(box.left).toBeGreaterThanOrEqual(left - 1);
      await expect(box.right).toBeLessThanOrEqual(right + 1);
      await expect(element.scrollWidth, `${element.tagName}: content is not clipped to fit`).toBeLessThanOrEqual(element.clientWidth + 1);
      for (let ancestor: HTMLElement | null = element; ancestor && ancestor !== frame.parentElement; ancestor = ancestor.parentElement) {
        const style = view.getComputedStyle(ancestor);
        await expect(["hidden", "clip", "auto", "scroll"], `${ancestor.tagName}: no clipping conceals the measured content`).not.toContain(style.overflowX);
        await expect(style.clipPath).toBe("none");
        await expect(style.clip === "auto" || style.clip === "").toBe(true);
      }
      // Inspect actual text fragments, including anonymous flex text, rather
      // than accepting a narrow parent whose words paint over the action.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const line of range.getClientRects()) {
          if (line.width === 0) continue;
          await expect(line.left).toBeGreaterThanOrEqual(Math.max(left, box.left) - 1);
          await expect(line.right).toBeLessThanOrEqual(Math.min(right, box.right) + 1);
        }
      }
    }
    const actionBox = action.getBoundingClientRect();
    for (const text of [title, metaText]) {
      const box = text.getBoundingClientRect();
      const separate = actionBox.left >= box.right - 1 || actionBox.right <= box.left + 1
        || actionBox.top >= box.bottom - 1 || actionBox.bottom <= box.top + 1;
      await expect(separate, "the wrapped action does not overlap the title or its source/status line").toBe(true);
    }
    await expect(document.body.scrollWidth).toBeLessThanOrEqual(view.innerWidth + 1);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth + 1);
    await expect(action).toHaveAttribute("href", args.href);
    await expect(canvasElement.querySelector("a a, a button")).toBeNull();
  };

  try {
    if (browser) {
      await browser.page.viewport(320, 568);
      await expect([document.body, root], "keyboard acceptance starts at ordinary document focus").toContain(document.activeElement);
    }
    await waitFor(() => expect(view.innerWidth).toBe(320));
    await document.fonts.ready;
    root.style.setProperty("font-size", "100%");
    await waitFor(() => {
      expect(size(root)).toBe(16);
      expect(size(title)).toBe(20);
      expect(size(action)).toBe(14);
    });
    const normal = { title: size(title), action: size(action) };
    await readableLayout();
    await physicalAction(44);

    root.style.setProperty("font-size", "200%");
    await waitFor(() => {
      expect(size(root)).toBe(32);
      expect(size(title) / normal.title).toBeCloseTo(2, 2);
      expect(size(action) / normal.action).toBeCloseTo(2, 2);
    });
    // The existing brief-layout meta note is explicitly12px. Its full text
    // must fit and remain visible; it is not falsely claimed as doubled.
    await readableLayout();
    if (browser) {
      const optionTab = browser.server.browser === "webkit" && browser.server.platform === "darwin";
      const keys = optionTab ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
      let presses = 0;
      while (document.activeElement !== action && presses < 24) {
        await browser.userEvent.keyboard(keys);
        presses += 1;
      }
      await expect(presses).toBeGreaterThan(0);
      await expect(action, `the enlarged action is reached by native ${optionTab ? "Option-Tab" : "Tab"}`).toHaveFocus();
      await physicalAction(88);
      await readableLayout();
    } else {
      // Ordinary Storybook checks geometry only, without synthetic keyboard
      // claims. The opt-in browser gate proves the physical native traversal.
      const box = action.getBoundingClientRect();
      await expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(box.height).toBeGreaterThanOrEqual(88);
    }
    await expect(view.location.href, "layout and keyboard checks do not navigate").toBe(origin);
  } finally {
    if (previousSize) root.style.setProperty("font-size", previousSize, previousPriority);
    else root.style.removeProperty("font-size");
    if (browser) {
      try { await browser.userEvent.cleanup(); }
      finally { await browser.page.viewport(previousViewport.width, previousViewport.height); }
    }
  }
}

export const PlacesGrid320At200Percent: Story = {
  args: { title: "Places to try", cta: "Browse places", meta: "Offline fixture of countywide place choices.", href: "/places" },
  parameters: { layout: "fullscreen", radiusHeadingPlacesFrame: true, a11y: { test: "error" },
    docs: { description: { story: "Offline layout fixture around the real Today places grid. Measures root16 to32 and actual2x heading/action text, readable metadata, unconcealed card/grid bounds, nonoverlapping44px controls, and native browser-gate keyboard reachability. No place provider or navigation is invoked." } } },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  play: (context) => exercisePlacesHeading(context),
};

export const LongPlacesHeading320At200Percent: Story = {
  args: { title: "Places to try across Frederick County", cta: "Expand to the whole county", meta: "Offline layout fixture with a longer title and action.", href: "/places" },
  parameters: PlacesGrid320At200Percent.parameters,
  globals: PlacesGrid320At200Percent.globals,
  play: (context) => exercisePlacesHeading(context),
};
