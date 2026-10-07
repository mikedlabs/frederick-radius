import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { expect } from "storybook/test";

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
          "The shared section marker. Its type scale establishes hierarchy before borders or extra cards do. The primary title is solid ink in Public Sans 20 semibold, the secondary register is Public Sans 16 semibold, and an optional count sits at 13 pixels in muted ink. Titles are written in sentence case and are never gradient-filled.",
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
    const heading = canvasElement.querySelector("h2")!;
    const title = heading.querySelector<HTMLElement>("span.truncate")!;
    const headingStyle = getComputedStyle(heading);
    const titleStyle = getComputedStyle(title);
    await expect(headingStyle.fontSize).toBe("20px");
    await expect(headingStyle.fontWeight).toBe("600");
    // Solid ink, never gradient-filled text (DESIGN_TELLS; regressed in #1702).
    await expect(titleStyle.backgroundImage).toBe("none");
    await expect(titleStyle.getPropertyValue("-webkit-text-fill-color")).not.toBe("rgba(0, 0, 0, 0)");
    await expect(titleStyle.textTransform).toBe("none");
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
