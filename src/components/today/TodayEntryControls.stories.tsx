import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TodayAsk from "./TodayAsk";
import TodayScopeStatus from "./TodayScopeStatus";
import styles from "./TodayLayout.module.css";

function EntryControls() {
  return <div data-today-entry-controls className={styles.entryControls}>
    <TodayAsk embedded showQuickNeeds={false} density="arrival" />
    <div className={styles.scope}><TodayScopeStatus density="compact" /></div>
  </div>;
}

const meta = {
  title: "Today/Unified discovery controls",
  component: EntryControls,
  parameters: { layout: "centered", a11y: { test: "error" }, nextjs: { navigation: { pathname: "/today", query: { in: "county" } } } },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
} satisfies Meta<typeof EntryControls>;
export default meta;
type Story = StoryObj<typeof meta>;

const usableControls: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const group = canvasElement.querySelector<HTMLElement>("[data-today-entry-controls]")!;
  const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
  const area = canvas.getByRole("combobox", { name: "Choose your area" });
  const location = canvas.getByRole("button", { name: "Use my location" });
  await expect(find).toHaveAttribute("href", "/search");
  await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
  await expect(area).toBeEnabled();
  await expect(area).toHaveValue("county");
  await expect(within(find).getByText("Find what you need", { exact: true })).toBeVisible();
  await expect(canvas.getByRole("status")).toHaveTextContent("Countywide briefing");
  await expect(canvas.queryByRole("link", { name: "Open now" })).not.toBeInTheDocument();
  const bounds = group.getBoundingClientRect();
  for (const control of [find, area, location]) {
    control.scrollIntoView({ block: "center" });
    const box = control.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(box.left).toBeGreaterThanOrEqual(bounds.left - 1);
    await expect(box.right).toBeLessThanOrEqual(bounds.right + 1);
    await expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
    if (control instanceof HTMLSelectElement) {
      // Native select scrollWidth conceals a clipped selected option.
      const style = getComputedStyle(control);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const labelWidth = context.measureText(control.selectedOptions[0].textContent ?? "").width;
      const available = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - 20;
      await expect(labelWidth).toBeLessThanOrEqual(available + 1);
    }
  }
  await expect(find.getBoundingClientRect().bottom).toBeLessThanOrEqual(area.getBoundingClientRect().top + 1);
  await expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
  await expect(canvasElement.querySelector("a a, a button, a select")).toBeNull();
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
