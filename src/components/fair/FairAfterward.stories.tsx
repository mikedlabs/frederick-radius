import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import FairAfterward, {
  FAIR_AFTERWARD_FRAMES,
  FAIR_AFTERWARD_PHOTO_CREDIT,
} from "./FairAfterward";

const meta = {
  title: "Fair/FairAfterward",
  component: FairAfterward,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The Fair guide's Home after the run: when it ran, three owned 2024 frames credited only after they load, and one action that hands visitors to this weekend.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        className="mx-auto max-w-[48rem] px-4 sm:px-6"
        style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FairAfterward>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile390: Story = {
  name: "Record and weekend handoff / 390px",
  globals: {
    viewport: { value: "radiusMobile", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "See what's on this weekend" }),
    ).toHaveAttribute("href", "/events?lens=weekend");
    // Frames past the right edge load lazily, so wait for the first credit
    // and check that every credit sits under a frame that really loaded.
    await waitFor(() =>
      expect(
        canvas.getAllByText(FAIR_AFTERWARD_PHOTO_CREDIT).length,
      ).toBeGreaterThan(0),
    );
    for (const credit of canvas.getAllByText(FAIR_AFTERWARD_PHOTO_CREDIT)) {
      const image = credit
        .closest("figure")
        ?.querySelector<HTMLImageElement>("img");
      await expect(image?.naturalWidth ?? 0).toBeGreaterThan(0);
    }
  },
};

export const Narrow320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
};

export const WithAnotherGuide: Story = {
  name: "With another live county guide",
  args: {
    nextMoment: { title: "Catoctin Colorfest", slug: "catoctin-colorfest-2026" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Open the Catoctin Colorfest guide" }),
    ).toHaveAttribute("href", "/moments/catoctin-colorfest-2026");
  },
};

export const OnePhotoMissing: Story = {
  name: "A frame that fails to load is removed",
  args: {
    // The missing frame leads so it requests at once, even in a narrow strip
    // where later frames wait for their lazy load.
    frames: [
      {
        id: "missing",
        base: "/images/fair/not-a-published-frame",
        alt: "A frame that is not published.",
      },
      FAIR_AFTERWARD_FRAMES[0],
      FAIR_AFTERWARD_FRAMES[2],
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll("[data-fair-afterward-frame]"),
      ).toHaveLength(2),
    );
    await expect(
      canvasElement.querySelector('[data-fair-afterward-frame="missing"]'),
    ).toBeNull();
  },
};
