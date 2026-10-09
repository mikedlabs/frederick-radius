import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import RadiusPhoto from "./RadiusPhoto";

/** Owned photography served from public/, so the story never calls Google. */
const OWNED = "/images/seasons/fall/018.jpg";
/** A path that 404s, standing in for a proxy failure. */
const BROKEN = "/images/radius-photo-story-missing.jpg";

const meta = {
  title: "Radius UI/RadiusPhoto",
  component: RadiusPhoto,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The one way to paint a place, venue or event photo. It asks the place-photo proxy for its failure signal, treats an error or a 1px image as missing, and holds any credit until a real image loads. A missing photo in a frame under 120px becomes the category mark on the place's own flat color; a larger frame hands its space to the caller's own layout.",
      },
    },
  },
  args: {
    src: OWNED,
    size: 72,
    category: "park",
    className: "rounded-[var(--app-radius-sm)]",
  },
} satisfies Meta<typeof RadiusPhoto>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadedThumbnail: Story = {};

export const ThumbnailLadder: Story = {
  render: () => (
    <div className="flex items-center gap-3 p-4">
      <RadiusPhoto src={OWNED} size={48} category="park" className="rounded-[var(--app-radius-md)]" />
      <RadiusPhoto src={null} size={48} category="coffee" className="rounded-[var(--app-radius-md)]" />
      <RadiusPhoto src={null} size={48} category="bar" hue="#3684E2" className="rounded-[var(--app-radius-md)]" />
      <RadiusPhoto src={BROKEN} size={48} category="restaurant" className="rounded-[var(--app-radius-md)]" />
    </div>
  ),
};

export const FlyerShownWhole: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: () => (
    <div className="w-[min(42rem,calc(100vw-32px))]">
      <RadiusPhoto
        src={OWNED}
        size={720}
        fit="contain"
        sizes="(max-width: 640px) 100vw, 720px"
        className="aspect-[16/9] w-full rounded-[var(--app-radius-md)]"
      />
    </div>
  ),
};

export const LargeFrameFallsBackToItsLayout: Story = {
  render: () => (
    <div className="w-[min(24rem,calc(100vw-32px))]">
      <RadiusPhoto
        src={BROKEN}
        size={520}
        className="h-32 w-full rounded-[var(--app-radius-md)]"
        fallback={
          <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            Bar in Frederick. The venue has not shared a photo yet.
          </p>
        }
      />
    </div>
  ),
};
