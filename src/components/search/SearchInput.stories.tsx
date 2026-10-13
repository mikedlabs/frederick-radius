import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import SearchInput from "./SearchInput";
import { NATIVE_REQUEST_ENTRY_KEY } from "./native-request-return";

const meta = {
  title: "Search/Native request editing",
  component: SearchInput,
  parameters: { layout: "padded", nextjs: { navigation: { pathname: "/search" } } },
  beforeEach: () => {
    const state: unknown = window.history.state;
    const href = window.location.href;
    return () => window.history.replaceState(state, "", href);
  },
  args: { scope: "brunswick", returnTo: "/today?in=brunswick" },
} satisfies Meta<typeof SearchInput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditingAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox", { name: "Search Frederick County" });
    await userEvent.type(input, "coffee & tea");
    await expect(input).toHaveValue("coffee & tea");
    await expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toEqual({ kind: "search", query: "coffee & tea" });
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(input).toHaveValue("");
    await expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft.query).toBe("");
  },
};
export const UrlRequestAt320: Story = {
  args: { defaultValue: "coffee & tea" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};
