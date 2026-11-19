import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { consumeFindRequest, type FindTarget } from "@/lib/findBridge";
import TodayAsk from "./TodayAsk";
import TodayScopeStatus from "./TodayScopeStatus";
import styles from "../nav/NavChrome.module.css";

function EntryControls() {
  return <header data-today-header className={styles.bar} style={{ position: "relative" }}>
    <div data-app-topbar-row className="flex min-h-14 items-center justify-end px-3">
      <TodayScopeStatus density="header" />
      <TodayAsk embedded showQuickNeeds={false} density="header" />
    </div>
  </header>;
}

const meta = {
  title: "Today/Unified discovery controls",
  component: EntryControls,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, nextjs: { navigation: { pathname: "/today", query: { in: "county" } } } },
  decorators: [(Story) => <main data-app-primary-tab="/today"
    style={{ width: "min(552px, 100vw)", boxSizing: "border-box" }}><Story /></main>],
} satisfies Meta<typeof EntryControls>;
export default meta;
type Story = StoryObj<typeof meta>;

const usableControls: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  await canvasElement.ownerDocument.fonts.ready;
  const canvas = within(canvasElement);
  const group = canvasElement.querySelector<HTMLElement>("[data-app-topbar-row]")!;
  const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
  const trigger = canvasElement.querySelector<HTMLElement>("[data-today-area-trigger]")!;
  await expect(trigger).toHaveAccessibleName("Choose your area: Whole county");
  await expect(trigger.closest("details")).not.toHaveAttribute("open");
  await expect(canvasElement.querySelector("select")).not.toBeVisible();
  await userEvent.click(trigger);
  const area = canvas.getByRole("combobox", { name: "Choose your area" });
  const location = canvas.getByRole("button", { name: "Use my location" });
  await expect(find).toHaveAttribute("href", "/search");
  await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
  await expect(area).toBeEnabled();
  await expect(area).toHaveValue("county");
  await expect(canvas.getByRole("status")).toHaveTextContent("Countywide briefing");
  await expect(canvas.queryByRole("link", { name: "Open now" })).not.toBeInTheDocument();
  const bounds = group.getBoundingClientRect();
  await expect(bounds.left).toBeGreaterThanOrEqual(0);
  await expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  for (const control of [find, trigger, area, location]) {
    control.scrollIntoView({ block: "center" });
    const box = control.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(box.left).toBeGreaterThanOrEqual(bounds.left - 1);
    await expect(box.right).toBeLessThanOrEqual(bounds.right + 1);
    const controlName = control === area ? "Choose your area" : control === location ? "Use my location" : "Find what you need";
    const diagnostic = { control: controlName, width: box.width, clientWidth: control.clientWidth,
      scrollWidth: control.scrollWidth, groupWidth: bounds.width, font: getComputedStyle(control).font };
    if (control.scrollWidth > control.clientWidth + 1) console.info("Today entry control overflow", JSON.stringify(diagnostic));
    await expect(control.scrollWidth, JSON.stringify(diagnostic)).toBeLessThanOrEqual(control.clientWidth + 1);
    if (control instanceof HTMLSelectElement) {
      // Native select scrollWidth conceals a clipped selected option.
      const style = getComputedStyle(control);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const labelWidth = context.measureText(control.selectedOptions[0].textContent ?? "").width;
      const available = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - 20;
      const selectedDiagnostic = { ...diagnostic, selected: control.selectedOptions[0].textContent,
        labelWidth, available, padding: [style.paddingLeft, style.paddingRight], rootFont: getComputedStyle(document.documentElement).fontSize };
      if (labelWidth > available + 1) console.info("Today native area text overflow", JSON.stringify(selectedDiagnostic));
      await expect(labelWidth, JSON.stringify(selectedDiagnostic)).toBeLessThanOrEqual(available + 1);
    }
  }
  await expect(find.getBoundingClientRect().bottom).toBeLessThanOrEqual(area.getBoundingClientRect().top + 1);
  await expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
  await expect(canvasElement.querySelector("a a, a button, a select")).toBeNull();

  // Native provider actions are essential here: synthetic click helpers can
  // focus the anchor first and conceal WebKit's pointer-activation behavior.
  // Keep ordinary interactive Storybook free of the Vitest-only module.
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  if (inBrowserGate) {
    const { userEvent: nativeUserEvent } = await import("vitest/browser");
    const bridgeWindow = window as Window & { __frPendingFind?: FindTarget };
    // Do not consume or overwrite another surface's queued request.
    await expect(bridgeWindow.__frPendingFind, "Find bridge must be idle before this isolated interaction").toBeUndefined();
    const activeAtOpen: Array<Element | null> = [];
    const onOpenSearch = () => { activeAtOpen.push(canvasElement.ownerDocument.activeElement); };
    const origin = window.location.href;
    window.addEventListener("fr:open-search", onOpenSearch);
    try {
      const panel = trigger.closest("details")!;
      trigger.focus();
      await expect(trigger).toHaveFocus();
      await nativeUserEvent.keyboard("{Escape}");
      await expect(panel).not.toHaveAttribute("open");
      await nativeUserEvent.keyboard("{Enter}");
      await expect(panel).toHaveAttribute("open");
      await nativeUserEvent.keyboard("{Tab}");
      await expect(area).toHaveFocus();
      await nativeUserEvent.keyboard("{Escape}");
      await expect(trigger).toHaveFocus();
      await expect(area).toHaveValue("county");
      // Click a real child of the launcher; never pre-focus the target.
      await nativeUserEvent.click(find.querySelector<HTMLElement>("span")!);
      await expect(activeAtOpen).toHaveLength(1);
      await expect(activeAtOpen[0]).toBe(find);
      await expect(bridgeWindow.__frPendingFind).toBe("global");
      await expect(window.location.href).toBe(origin);
    } finally {
      window.removeEventListener("fr:open-search", onOpenSearch);
      consumeFindRequest("global");
      await nativeUserEvent.cleanup();
    }
  }
};

export const Phone390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: usableControls,
};
export const Phone320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: usableControls,
};
export const Phone375: Story = {
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: usableControls,
};
export const Phone430: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, play: usableControls,
};
export const EnlargedText320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  play: usableControls,
};

/** The app uses native fonts. A wider installed face exposes space assumptions
 * hidden by the narrower Mac system face without changing any geometry check. */
function wideNativeStory(enlarged = false): Story {
  return {
    globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
    beforeEach: () => {
      const root = document.documentElement;
      const previousFamily = root.style.getPropertyValue("--font-sans-base");
      const previousSize = root.style.fontSize;
      root.style.setProperty("--font-sans-base", "Verdana, sans-serif");
      if (enlarged) root.style.fontSize = "200%";
      return () => {
        if (previousFamily) root.style.setProperty("--font-sans-base", previousFamily);
        else root.style.removeProperty("--font-sans-base");
        root.style.fontSize = previousSize;
      };
    },
    play: usableControls,
  };
}

export const WideNative320: Story = wideNativeStory();
export const WideNativeEnlarged320: Story = wideNativeStory(true);
