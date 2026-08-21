import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bookmark, LocateFixed, Map, Navigation } from "lucide-react";
import { useState } from "react";

import { Button } from "./Button";

const meta = {
  title: "Radius UI/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The canonical Radius action. Every size keeps at least a 44-pixel tap target, and one primary action should lead each view.",
      },
    },
  },
  args: {
    children: "Find something nearby",
    variant: "primary",
    size: "md",
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "quiet"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const ActionHierarchy: Story = {
  render: () => (
    <div className="flex flex-wrap items-center justify-center gap-2.5 p-4">
      <Button iconLeft={<LocateFixed className="h-4 w-4" aria-hidden />}>
        Use my location
      </Button>
      <Button variant="secondary" iconLeft={<Map className="h-4 w-4" aria-hidden />}>
        Show the county map
      </Button>
      <Button variant="quiet">Not now</Button>
    </div>
  ),
};
export const LoadingAndDisabled: Story = {
  render: () => (
    <div className="flex flex-col items-stretch gap-3 p-4 min-[360px]:flex-row min-[360px]:items-center">
      <Button loading aria-label="Finding nearby places">
        Finding nearby places
      </Button>
      <Button disabled variant="secondary">
        Location unavailable
      </Button>
    </div>
  ),
};

function SavedPlaceAction() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-2 text-center">
      <Button
        variant={saved ? "secondary" : "primary"}
        aria-pressed={saved}
        iconLeft={<Bookmark className="h-4 w-4" aria-hidden />}
        onClick={() => setSaved((value) => !value)}
      >
        {saved ? "Saved to My Radius" : "Save Gravel & Grind"}
      </Button>
      <p aria-live="polite" className="text-xs" style={{ color: "var(--app-ink-3)" }}>
        {saved ? "Gravel & Grind is saved." : "This place is not saved yet."}
      </p>
    </div>
  );
}

export const PressedState: Story = {
  render: () => <SavedPlaceAction />,
};

export const KeyboardFocus: Story = {
  args: {
    children: "Open Frederick County map",
    variant: "secondary",
    iconRight: <Navigation className="h-4 w-4" aria-hidden />,
  },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>("button")?.focus();
  },
};

export const LongActionAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: () => (
    <div className="w-[calc(100vw-24px)] p-3">
      <Button className="w-full whitespace-normal text-center" size="lg">
        Find a public restroom near Carroll Creek
      </Button>
    </div>
  ),
};
