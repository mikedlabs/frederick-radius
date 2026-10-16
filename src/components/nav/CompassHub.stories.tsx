import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import CompassHub from "./CompassHub";
import InterceptedDrawer from "./InterceptedDrawer";
import { NATIVE_REQUEST_ENTRY_KEY } from "@/components/search/native-request-return";

/** Explicit workshop transport: no current live facts or provider requests. */
function unavailableDeck() {
  const originalFetch = window.fetch;
  const originalUrl = window.location.href;
  const originalState: unknown = window.history.state;
  const keys = ["fr.compass.pins.v1", "fr.compass.recent.v1"];
  const previous = keys.map((key) => window.localStorage.getItem(key));
  for (const key of keys) window.localStorage.removeItem(key);
  const url = new URL(originalUrl); url.searchParams.delete("deck"); url.searchParams.delete("chapter");
  window.history.replaceState(originalState, "", url);
  const fixture: typeof fetch = (input, init) => {
    const requested = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (requested.origin === window.location.origin && requested.pathname === "/api/deck") {
      return Promise.resolve(new Response("Workshop live source unavailable", { status: 503 }));
    }
    return originalFetch.call(window, input, init);
  };
  window.fetch = fixture;
  return () => {
    if (window.fetch === fixture) window.fetch = originalFetch;
    window.history.replaceState(originalState, "", originalUrl);
    keys.forEach((key, index) => {
      if (previous[index] === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, previous[index]!);
    });
  };
}
const meta = {
  title: "Tools/Request to action",
  component: CompassHub,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/compass" } } },
  beforeEach: unavailableDeck,
  decorators: [(Story) => <main className="mx-auto max-w-screen-md p-4 sm:p-5">
    <p className="mb-4 text-[13px]" style={{ color: "var(--app-ink-2)" }}>This workshop does not show current live reports.</p>
    <Story />
  </main>],
} satisfies Meta<typeof CompassHub>;
export default meta;
type Story = StoryObj<typeof meta>;

const intentFlow = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement);
  const find = canvas.getByRole("link", { name: "Find a place, service, event, or answer" });
  await expect(find).toHaveAttribute("href", "/search");
  await expect(find.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
  const food = canvas.getByRole("button", { name: /^Eat, drink & go out/ });
  await waitFor(() => expect(food).toBeEnabled());
  await userEvent.click(food);
  await expect(food).toHaveAttribute("aria-expanded", "true");
  const actions = document.getElementById(food.getAttribute("aria-controls")!)!;
  const foodActions = within(actions);
  for (const name of ["Book a table", "Find food trucks", "Find live music"]) {
    const action = foodActions.getByRole("link", { name });
    await expect(action).toBeVisible();
    await expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  }
  const table = foodActions.getByRole("link", { name: "Book a table" });
  await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
  const around = canvas.getByRole("button", { name: /^Get around/ });
  await userEvent.click(around);
  await expect(food).toHaveAttribute("aria-expanded", "false");
  await expect(around).toHaveAttribute("aria-expanded", "true");
  await expect(table).not.toBeVisible();
  await expect(canvasElement.scrollWidth - canvasElement.clientWidth).toBeLessThanOrEqual(1);
};
export const IntentAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: intentFlow };
export const IntentAt375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: intentFlow };
export const IntentAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: intentFlow };
export const IntentAt430ReducedMotion: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false }, motion: "reduce" }, play: intentFlow };
export const FullIndex: Story = {
  play: async ({ canvasElement }) => {
    const launcher = within(canvasElement).getByRole("button", { name: "Browse the full tool index" });
    await waitFor(() => expect(launcher).toBeEnabled()); await userEvent.click(launcher);
    const dialog = await within(document.body).findByRole("dialog", { name: "All tools" });
    await expect(within(document.body).getAllByRole("dialog")).toHaveLength(1);
    const index = within(dialog);
    const filter = index.getByRole("searchbox", { name: "Search tools in this section" });
    await userEvent.type(filter, "coffee");
    await expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toEqual({ kind: "tools", query: "coffee" });
    await expect(index.getByRole("link", { name: /^Search everything/ })).toHaveAttribute("href", "/search?q=coffee");
    await expect(index.queryByRole("button", { name: /^Pin / })).not.toBeInTheDocument();
  },
};
export const ShortcutEditor: Story = {
  play: async ({ canvasElement }) => {
    const edit = within(canvasElement).getByRole("button", { name: "Edit" });
    await waitFor(() => expect(edit).toBeEnabled()); await userEvent.click(edit);
    const dialog = await within(document.body).findByRole("dialog", { name: "Edit shortcuts" });
    const editor = within(dialog);
    await userEvent.type(editor.getByRole("searchbox", { name: "Search tools in this section" }), "brunch");
    const pin = editor.getByRole("button", { name: "Pin Brunch guide" });
    await userEvent.click(pin);
    await expect(editor.getByRole("button", { name: "Unpin Brunch guide" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const EmbeddedToolsDrawer: Story = {
  render: () => <InterceptedDrawer title="All tools" bareHeader inlineToolsPanels><div className="p-4"><CompassHub embeddedInToolsDrawer /></div></InterceptedDrawer>,
  play: async () => {
    const drawer = await within(document.body).findByRole("dialog", { name: "All tools" });
    const tools = within(drawer);
    await expect(tools.getByRole("link", { name: "Find a place, service, event, or answer" })).toHaveAttribute("href", "/search");
    const launcher = tools.getByRole("button", { name: "Browse the full tool index" });
    await waitFor(() => expect(launcher).toBeEnabled()); await userEvent.click(launcher);
    const index = await tools.findByRole("region", { name: "All tools" });
    await expect(within(document.body).getAllByRole("dialog")).toHaveLength(1);
    await expect(within(index).getByRole("searchbox", { name: "Search tools in this section" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(tools.queryByRole("region", { name: "All tools" })).not.toBeInTheDocument());
    await expect(within(document.body).getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(launcher).toHaveFocus());
    const edit = tools.getByRole("button", { name: "Edit" }); await userEvent.click(edit);
    const editor = await tools.findByRole("region", { name: "Edit shortcuts" });
    await expect(within(document.body).getAllByRole("dialog")).toHaveLength(1);
    await userEvent.click(within(editor).getByRole("button", { name: "Back to Tools" }));
    await waitFor(() => expect(edit).toHaveFocus());
  },
};
