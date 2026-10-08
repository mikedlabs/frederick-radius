import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { Button } from "./Button";
import SectionHeading from "./SectionHeading";

const meta = {
  title: "Radius UI/SectionHeading",
  component: SectionHeading,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The shared section heading. Hierarchy comes from type: the primary register is .text-title (Public Sans 20 semibold) in solid Ink with a 4px tick, and the secondary register is .text-title-sm with no tick. Titles are written in sentence case, never in tracked caps, and there is no trailing hairline. A count is supporting detail: with a link it rides in the link label (See all 183), and without one it follows the title in quiet metadata type.",
      },
    },
  },
  args: {
    title: "Worth your time",
    count: 12,
    href: "/places",
    cta: "See all",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(42rem,calc(100vw-24px))] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrimarySection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { level: 2, name: "Worth your time" });
    const headingStyle = getComputedStyle(heading);
    await expect(headingStyle.fontSize).toBe("20px");
    await expect(headingStyle.fontWeight).toBe("600");
    await expect(headingStyle.textTransform).toBe("none");
    // Solid ink, never gradient-filled text (DESIGN_TELLS; regressed in #1702).
    await expect(headingStyle.backgroundImage).toBe("none");
    await expect(headingStyle.getPropertyValue("-webkit-text-fill-color")).not.toBe("rgba(0, 0, 0, 0)");
    // The count leaves the heading and rides in the link.
    const link = canvas.getByRole("link", { name: "See all 12" });
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(getComputedStyle(link).fontSize).toBe("15px");
    // No trailing hairline.
    await expect(canvasElement.querySelector(".h-px")).toBeNull();
  },
};

export const CountWithoutLink: Story = {
  args: {
    title: "Nearby places",
    count: 26,
    href: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 2 }).textContent).toBe("Nearby places");
    const count = canvasElement.querySelector<HTMLElement>("[data-section-heading-count]")!;
    await expect(count.textContent).toBe("26");
    await expect(getComputedStyle(count).fontSize).toBe("13px");
  },
};

export const SecondarySection: Story = {
  args: {
    title: "Pools",
    count: undefined,
    href: undefined,
    size: "sm",
    accent: "var(--app-cool)",
  },
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByRole("heading", { level: 2, name: "Pools" });
    await expect(getComputedStyle(heading).fontSize).toBe("16px");
    await expect(canvasElement.querySelector("[data-section-heading-tick]")).toBeNull();
  },
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
      <p aria-live="polite" className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
        {showingAll ? "Radius is showing events across Frederick County." : "Radius is showing the strongest nearby matches."}
      </p>
    </div>
  );
}

export const ActionState: Story = {
  render: () => <InteractiveHeading />,
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
  play: async ({ canvasElement }) => {
    // A long title wraps instead of truncating, and nothing scrolls sideways.
    const heading = within(canvasElement).getByRole("heading", { level: 2 });
    await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth + 1);
    await expect(heading.textContent).toBe("What is happening outside Downtown Frederick");
  },
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
};
