import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Trees, Waves } from "lucide-react";
import { expect, within } from "storybook/test";

import { IconTile, Row, RowList } from "./Row";

/**
 * Ruled directory rows on the page ground. Without a photograph, the
 * leading slot is the plain glyph: a 24px icon in ink-3 with no tile, tint,
 * border or fill, even when a caller still passes a category `tone`.
 */
function Directory() {
  return (
    <main className="mx-auto max-w-xl p-4" style={{ background: "var(--app-bg)" }}>
      <RowList>
        <Row href="/map?at=39.4143,-77.4105" leading={<IconTile icon={Trees} tone="var(--app-brand-2)" />}
          title="Baker Park" subtitle="Second Street and Bentz Street" meta="44 ac" />
        <Row href="/map?at=39.4155,-77.4092" leading={<IconTile icon={Waves} tone="var(--app-cool)" />}
          title="Carroll Creek Linear Park" subtitle="Downtown Frederick" meta="1.3 mi" />
      </RowList>
    </main>
  );
}

const meta = {
  title: "Radius UI/Row",
  component: Directory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof Directory>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectPlainRows(canvasElement: HTMLElement) {
  const view = canvasElement.ownerDocument.defaultView!;
  const canvas = within(canvasElement);
  const probe = canvasElement.ownerDocument.createElement("span");
  probe.style.color = "var(--app-ink-3)";
  canvasElement.append(probe);
  try {
    const ink3 = view.getComputedStyle(probe).color;
    const glyphs = canvasElement.querySelectorAll<HTMLElement>("[data-row-glyph]");
    await expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) {
      const style = view.getComputedStyle(glyph);
      await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      await expect(style.borderTopWidth).toBe("0px");
      await expect(style.color).toBe(ink3);
      const box = glyph.getBoundingClientRect();
      await expect(Math.round(box.width)).toBe(24);
      await expect(Math.round(box.height)).toBe(24);
    }
  } finally { probe.remove(); }
  for (const link of canvas.getAllByRole("link")) {
    const box = link.getBoundingClientRect();
    await expect(box.height).toBeGreaterThanOrEqual(44);
  }
  // One hairline above and below the list; the last row draws none.
  const list = canvasElement.querySelector("ul")!;
  await expect(view.getComputedStyle(list).borderTopWidth).toBe("1px");
  await expect(view.getComputedStyle(list).borderBottomWidth).toBe("1px");
  const rows = list.querySelectorAll<HTMLElement>("li > a");
  await expect(view.getComputedStyle(rows[0]).borderBottomWidth).toBe("1px");
  await expect(view.getComputedStyle(rows[rows.length - 1]).borderBottomWidth).toBe("0px");
}

export const PlainGlyphRows390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => expectPlainRows(canvasElement),
};

export const PlainGlyphRows320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => expectPlainRows(canvasElement),
};

export const Dark: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-appearance");
    root.setAttribute("data-appearance", "dark");
    return () => {
      if (previous === null) root.removeAttribute("data-appearance");
      else root.setAttribute("data-appearance", previous);
    };
  },
  play: async ({ canvasElement }) => expectPlainRows(canvasElement),
};
