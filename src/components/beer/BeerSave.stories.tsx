import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ALL_BEERS, beerKey } from "@/data/beers";
import BeerSheet from "./BeerSheet";
import BeerTasteFlight from "./BeerTasteFlight";
import MyTaps from "./MyTaps";

const KEY = "fr:saved:v1";
const beer = ALL_BEERS[0]!;
function sample(saved = false) {
  const original = localStorage.getItem(KEY);
  localStorage.setItem(KEY, JSON.stringify(saved ? [{ type: "beer", id: beerKey(beer), saved_at: "2026-10-08T13:00:00Z" }] : []));
  return () => {
    if (original === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, original);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: localStorage }));
  };
}
const meta = {
  title: "Radius UI/Confirmed beer saves",
  component: BeerTasteFlight,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="p-4"><Story /></div>],
  beforeEach: () => sample(),
} satisfies Meta<typeof BeerTasteFlight>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Flight: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save flight" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Saved" })).toBeDisabled());
    await expect(JSON.parse(localStorage.getItem(KEY)!).length).toBeGreaterThan(0);
  },
};
export const Detail: Story = {
  render: () => <BeerSheet beer={beer} onClose={() => {}} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole("button", { name: "Save this pour" })).toBeVisible());
    await userEvent.click(body.getByRole("button", { name: "Save this pour" }));
    await waitFor(() => expect(body.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true"));
    await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ type: "beer", id: beerKey(beer), saved_at: expect.any(String) }]);
  },
};
export const SavedPourRemoval: Story = {
  beforeEach: () => sample(true),
  render: () => <MyTaps />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = `Remove ${beer.name} from saved pours`;
    const remove = await canvas.findByRole("button", { name });
    const original = JSON.parse(localStorage.getItem(KEY)!);
    await expect(original).toEqual([{ type: "beer", id: beerKey(beer), saved_at: "2026-10-08T13:00:00Z" }]);
    let release!: () => void;
    let acquired!: () => void;
    const entered = new Promise<void>((resolve) => { acquired = resolve; });
    const untilReleased = new Promise<void>((resolve) => { release = resolve; });
    // The real browser lock keeps the mutation pending without mocking Saved.
    const held = navigator.locks.request(KEY, async () => { acquired(); await untilReleased; });
    await entered;
    try {
      await userEvent.click(remove);
      const pending = await canvas.findByRole("button", { name: `Removing ${beer.name} from saved pours` });
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveAttribute("aria-busy", "true");
      await expect(canvas.getByRole("region", { name: "Saved pours" })).toBeVisible();
      await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(original);
    } finally {
      release();
      await held;
      // Wait for durable removal before fixture restoration, including failure cleanup.
      await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]));
    }
    await waitFor(() => expect(canvas.queryByRole("button", { name })).not.toBeInTheDocument());
    await expect(canvas.queryByRole("button", { name: `Removing ${beer.name} from saved pours` })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "Saved pours" })).not.toBeInTheDocument();
    await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  },
};
