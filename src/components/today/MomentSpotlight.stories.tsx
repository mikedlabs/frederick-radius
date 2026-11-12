import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MomentSpotlight from "./MomentSpotlight";

const meta = {
  title: "Today/Moment spotlight",
  component: MomentSpotlight,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: {
    isDayOf: true,
    moment: {
      slug: "story-fair-frame",
      title: "The Great Frederick Fair",
      spotlightLead: "Check the official program before heading to the Fairgrounds.",
      accent: "var(--app-brand)",
      spotlightFacts: [{ label: "Place", value: "Frederick Fairgrounds" }],
      spotlightImage: {
        src: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
        alt: "The Fairgrounds after dark",
        credit: "Mike D",
        width: 1920,
        height: 1080,
      },
    },
  },
} satisfies Meta<typeof MomentSpotlight>;

export default meta;
type Story = StoryObj<typeof meta>;
export const PhotographFrame: Story = {};
export const AdvanceNotice: Story = { args: { isDayOf: false } };
