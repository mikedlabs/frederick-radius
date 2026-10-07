import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import SideRail from "./SideRail";

const meta = {
  title: "Radius Chrome/Navigation",
  component: TopBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "The shared navigation keeps four pages and the existing search doorway. A filled Brick state identifies the selected page. The header is opaque, and every header control is 44px tall with a utility corner and a 1px rule; only the location scope is a capsule. Routes that own their search and scope show the Caslon wordmark from 375px.",
      },
    },
  },
  render: () => (
    <>
      <TopBar />
      <main className="mx-auto max-w-screen-md px-4 py-8 lg:pl-24">
        <h1 className="text-2xl font-semibold">Navigation workshop</h1>
        <p className="mt-2 text-sm">Check the current page, keyboard focus, and touch targets at each viewport.</p>
      </main>
      <BottomNav />
      <SideRail />
    </>
  ),
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TodayAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/today" } } },
};

export const SavedAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/my-radius" } } },
};

export const CountyStatusAt430: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/pulse" } } },
};

export const DesktopEvents: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/events" } } },
};

export const TodayWordmarkAt375: Story = {
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/today" } } },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>("[data-app-topbar]")!;
    const wordmark = [...header.querySelectorAll("span")].find((node) => node.textContent === "Frederick Radius")!;
    await expect(getComputedStyle(wordmark).display).not.toBe("none");
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
  },
};

export const PlaceDetailAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/places/gravel-and-grind" } } },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>("[data-app-topbar]")!;
    for (const control of header.querySelectorAll<HTMLElement>("button, a")) {
      if (getComputedStyle(control).display === "none") continue;
      await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
  },
};
