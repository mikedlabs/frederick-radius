import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TownLinks from "./TownLinks";

const meta = {
  title: "Municipality/Official town links",
  component: TownLinks,
  parameters: { layout: "fullscreen" },
  args: { slug: "frederick", hideContact: true },
  render: (args) => (
    <div data-town-links-frame style={{ width: 320, maxWidth: "100%", padding: "1rem", boxSizing: "border-box" }}>
      <TownLinks {...args} />
    </div>
  ),
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "100%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
} satisfies Meta<typeof TownLinks>;
export default meta;
type Story = StoryObj<typeof meta>;

async function containedOfficialLink({ canvasElement }: { canvasElement: HTMLElement }) {
  const canvas = within(canvasElement);
  const link = canvas.getByRole("link", { name: /^cityoffrederickmd\.gov$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://www.cityoffrederickmd.gov/");
  await expect(canvas.getByText("Official town site")).toBeVisible();
  const frame = canvasElement.querySelector<HTMLElement>("[data-town-links-frame]")!;
  const card = link.closest("section")!;
  const row = link.parentElement!;
  const icon = link.querySelector("svg")!;
  const text = link.querySelector("span")!;
  const frameBox = frame.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const linkBox = link.getBoundingClientRect();
  const iconBox = icon.getBoundingClientRect();
  const textBox = text.getBoundingClientRect();
  await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth + 1);
  await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  for (const box of [linkBox, iconBox, textBox]) {
    await expect(box.left).toBeGreaterThanOrEqual(rowBox.left - 0.5);
    await expect(box.right).toBeLessThanOrEqual(rowBox.right + 0.5);
    await expect(box.right).toBeLessThanOrEqual(cardBox.right + 0.5);
    await expect(box.right).toBeLessThanOrEqual(frameBox.right + 0.5);
  }
  await expect(text).toHaveTextContent("cityoffrederickmd.gov");
  await expect(getComputedStyle(text).textOverflow).not.toBe("ellipsis");
  console.info("TownLinks measured containment", JSON.stringify({
    rootTextSize: getComputedStyle(document.documentElement).fontSize,
    frame: { width: frameBox.width, scrollWidth: frame.scrollWidth },
    card: { left: cardBox.left, right: cardBox.right, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth },
    row: { left: rowBox.left, right: rowBox.right, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth },
    link: { left: linkBox.left, right: linkBox.right },
    icon: { left: iconBox.left, right: iconBox.right },
    text: { left: textBox.left, right: textBox.right, content: text.textContent },
  }));
}

export const Narrow320: Story = { play: containedOfficialLink };

export const EnlargedRoot320WithWideSystemFont: Story = {
  beforeEach: () => {
    const root = document.documentElement;
    const previousSize = root.style.fontSize;
    const previousFont = root.style.getPropertyValue("--font-sans-base");
    // Existing local system font; this declared fallback reproduces the
    // min-content overflow without downloading or changing the app font.
    root.style.fontSize = "200%";
    root.style.setProperty("--font-sans-base", '"Verdana", sans-serif');
    return () => {
      root.style.fontSize = previousSize;
      if (previousFont) root.style.setProperty("--font-sans-base", previousFont);
      else root.style.removeProperty("--font-sans-base");
    };
  },
  play: containedOfficialLink,
};
