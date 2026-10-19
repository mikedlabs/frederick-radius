import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bookmark, LocateFixed, Map, Navigation } from "lucide-react";
import { useState } from "react";
import { expect, fn, within } from "storybook/test";

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

async function establishCurrentStoryFrame(browser: typeof import("vitest/browser"), instruction: HTMLElement) {
  // The runner replaces its iframe between story files. Establish this one
  // through trusted input before native Tab, without focusing the action.
  let setupPointerTrusted = false;
  instruction.addEventListener("pointerdown", event => { setupPointerTrusted = event.isTrusted; }, { once: true });
  await browser.userEvent.click(instruction);
  expect(setupPointerTrusted).toBe(true);
  expect([document.body, document.documentElement]).toContain(document.activeElement);
}

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
  play: async ({ canvasElement }) => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    const keys = browser.server.browser === "webkit" && browser.server.platform === "darwin" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
    const canvas = within(canvasElement);
    await establishCurrentStoryFrame(browser, canvas.getByText("This place is not saved yet."));
    const button = canvas.getByRole("button", { name: "Save Gravel & Grind" });
    const before = button.getBoundingClientRect();
    await browser.userEvent.keyboard(keys);
    expect(button).toHaveFocus();
    await browser.userEvent.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Saved to My Radius");
    await browser.userEvent.keyboard(" ");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Save Gravel & Grind");
    expect(button.getBoundingClientRect().height).toBe(before.height);
  },
};

export const KeyboardFocus: Story = {
  render: (args) => <div className="space-y-3 p-4">
    <p className="text-sm">Use the map action to explore Frederick County.</p>
    <Button {...args} />
  </div>,
  args: {
    children: "Open Frederick County map",
    variant: "secondary",
    iconRight: <Navigation className="h-4 w-4" aria-hidden />,
    onClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    const keys = browser.server.browser === "webkit" && browser.server.platform === "darwin" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
    const canvas = within(canvasElement);
    await establishCurrentStoryFrame(browser, canvas.getByText("Use the map action to explore Frederick County."));
    const button = canvas.getByRole("button", { name: "Open Frederick County map" });
    expect([document.body, document.documentElement]).toContain(document.activeElement);
    await browser.userEvent.keyboard(keys);
    expect(button).toHaveFocus();
    expect(button.matches(":focus-visible")).toBe(true);
    expect(parseFloat(getComputedStyle(button).outlineWidth)).toBeGreaterThanOrEqual(2);
    await browser.userEvent.keyboard("{Enter}");
    expect(args.onClick).toHaveBeenCalledOnce();
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

export const OppositeEdgeAction: Story = {
  render: () => (
    <div className="w-[296px]">
      <Button className="w-full justify-between" iconRight={<Navigation className="h-4 w-4" data-schedule-icon aria-hidden />}>
        <span>Open full schedule</span>
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const button = within(canvasElement).getByRole("button", { name: "Open full schedule" });
    const label = within(button).getByText("Open full schedule");
    const icon = button.querySelector("[data-schedule-icon]")!;
    const edge = button.getBoundingClientRect();
    const padding = getComputedStyle(button);
    expect(Math.abs(label.getBoundingClientRect().left - edge.left - parseFloat(padding.paddingLeft))).toBeLessThanOrEqual(1);
    expect(Math.abs(edge.right - icon.getBoundingClientRect().right - parseFloat(padding.paddingRight))).toBeLessThanOrEqual(1);
    expect(edge.height).toBeGreaterThanOrEqual(44);
  },
};
