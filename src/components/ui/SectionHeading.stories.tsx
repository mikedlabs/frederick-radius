import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SlidersHorizontal } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "./Button";
import SectionHeading from "./SectionHeading";


function setAppearance(appearance: "light" | "dark") {
  const root = document.documentElement;
  const previous = root.getAttribute("data-appearance");
  root.setAttribute("data-appearance", appearance);
  return () => {
    if (previous === null) root.removeAttribute("data-appearance");
    else root.setAttribute("data-appearance", previous);
  };
}

async function readableHeading(canvasElement: HTMLElement, title: string, size: "lg" | "sm" = "lg") {
  const canvas = within(canvasElement);
  const heading = canvas.getByRole("heading", { level: 2 });
  const text = within(heading).getByText(title, { exact: true });
  const headingStyle = getComputedStyle(heading);
  const textStyle = getComputedStyle(text);
  await expect(headingStyle.fontFamily.toLowerCase()).toContain("system-ui");
  await expect(headingStyle.fontFamily.toLowerCase()).not.toMatch(/caslon|georgia|public sans/);
  await expect(parseInt(headingStyle.fontWeight, 10)).toBeGreaterThanOrEqual(size === "sm" ? 600 : 700);
  await expect(textStyle.backgroundImage).toBe("none");
  await expect(textStyle.getPropertyValue("-webkit-text-fill-color")).toBe(textStyle.color);
  await expect(textStyle.color).not.toBe("rgba(0, 0, 0, 0)");
  await expect(text).toBeVisible();
  await expect(text.getBoundingClientRect().width).toBeGreaterThan(0);
  await expect(text.getBoundingClientRect().height).toBeGreaterThanOrEqual(16);
  await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  const action = canvas.queryByRole("link") ?? canvas.queryByRole("button");
  if (!action) return;
  action.scrollIntoView({ block: "nearest" });
  const box = action.getBoundingClientRect();
  // Links keep the existing vertical hit extender. Probe the actual44px hit
  // area rather than insisting their visible text becomes a filled button.
  await expect(box.width).toBeGreaterThanOrEqual(44);
  const hitHeight = Math.max(box.height, parseFloat(getComputedStyle(action, "::after").height) || 0);
  await expect(hitHeight).toBeGreaterThanOrEqual(44);
  for (const offset of [-21.5, 0, 21.5]) {
    const hit = action.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2 + offset);
    await expect(hit !== null && action.contains(hit)).toBe(true);
  }
  action.focus();
  await expect(action).toHaveFocus();
}

const meta = {
  title: "Radius UI/SectionHeading",
  component: SectionHeading,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The shared section marker. Its type scale establishes hierarchy before borders or extra cards do.",
      },
    },
  },
  beforeEach: () => setAppearance("light"),
  args: {
    title: "Worth your time",
    count: 12,
    href: "/places",
    cta: "See all",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(42rem,calc(100vw-24px))] p-3" style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrimarySection: Story = { play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title) };

export const PrimaryTabHeading: Story = {
  decorators: [(Story) => <div data-app-primary-tab="/events"><Story /></div>],
  args: { title: "This weekend", count: 8, href: "/events" },
  play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title),
};

export const SecondarySection: Story = {
  args: {
    title: "Pools",
    count: undefined,
    href: undefined,
    size: "sm",
    accent: "var(--app-cool)",
  },
  play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title, "sm"),
};

function InteractiveHeading() {
  const [showingAll, setShowingAll] = useState(false);

  return (
    <div className="space-y-3">
      <SectionHeading
        title="What starts soon"
        count={showingAll ? 18 : 4}
        cta={showingAll ? "Show less" : "Show all"}
        onCtaClick={() => setShowingAll((value) => !value)}
      />
      <p aria-live="polite" className="text-xs" style={{ color: "var(--app-ink-3)" }}>
        {showingAll ? "Radius is showing events across Frederick County." : "Radius is showing the strongest nearby matches."}
      </p>
    </div>
  );
}

export const ActionState: Story = {
  render: () => <InteractiveHeading />,
  play: async ({ canvasElement }) => {
    await readableHeading(canvasElement, "What starts soon");
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show all" }));
    await expect(canvas.getByRole("heading", { name: "What starts soon 18" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Show less" })).toBeVisible();
  },
};

export const WithTrailingControl: Story = {
  args: {
    title: "Nearby places",
    count: 26,
    href: undefined,
    trailing: (
      <Button
        variant="quiet"
        size="sm"
        aria-label="Change how nearby places are sorted"
        iconLeft={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
      >
        Sort
      </Button>
    ),
  },
  play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title),
};

export const LongFrederickTitleAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  args: {
    title: "What is happening outside Downtown Frederick",
    count: 14,
    href: "/events?in=county",
    cta: "See county",
  },
  play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title),
};

export const LongFrederickTitleAt320Dark: Story = {
  ...LongFrederickTitleAt320,
  beforeEach: () => setAppearance("dark"),
};

export const NarrowActionAt375: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
  },
  args: {
    title: "Frederick County public services near you",
    count: 8,
    href: "/contacts",
    cta: "See services",
  },
  play: ({ canvasElement, args }) => readableHeading(canvasElement, args.title),
};


export const ExplicitContextOverrides: Story = {
  decorators: [(Story) => <div style={{
    "--app-heading-image": "linear-gradient(90deg, var(--app-ink), var(--app-link))",
    "--app-heading-fill": "transparent",
    "--app-heading-rule": "var(--app-cool)",
    "--app-heading-action": "var(--app-cool)",
  } as CSSProperties}><Story /></div>],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const title = within(canvas.getByRole("heading", { level: 2 })).getByText(args.title, { exact: true });
    await expect(getComputedStyle(title).backgroundImage).toContain("linear-gradient");
    await expect(getComputedStyle(title).getPropertyValue("-webkit-text-fill-color")).toBe("rgba(0, 0, 0, 0)");
    const action = canvas.getByRole("link", { name: "See all" });
    const tick = canvas.getByRole("heading", { level: 2 }).querySelector<HTMLElement>('[aria-hidden="true"]')!;
    await expect(getComputedStyle(action).color).toBe(getComputedStyle(tick).backgroundColor);
  },
};
