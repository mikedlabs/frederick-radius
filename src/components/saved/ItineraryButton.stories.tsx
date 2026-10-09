import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import ItineraryButton from "./ItineraryButton";

const KEY = "fr:saved:v1";
const BRIDGE_KEY = "fr:return-bridge:v1";
const SAMPLE = "workshop-event-save";

/** Workshop-only device data, restored after each story. No event provider or
 * account API is involved in demonstrating the existing save action. */
function sampleStorage(unavailable = false) {
  const original = localStorage.getItem(KEY);
  const originalBridge = localStorage.getItem(BRIDGE_KEY);
  localStorage.setItem(KEY, unavailable ? "{unfinished" : "[]");
  return () => {
    for (const [key, value] of [[KEY, original], [BRIDGE_KEY, originalBridge]]) {
      if (value === null) localStorage.removeItem(key!);
      else localStorage.setItem(key!, value!);
    }
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: localStorage }));
  };
}

const meta = {
  title: "Radius UI/Event save",
  component: ItineraryButton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: { description: { component: "The existing event action saves to this device's Saved list. Its selected state follows confirmed storage; unavailable storage never shows a successful save." } },
  },
  args: { eventId: SAMPLE, label: "Add Sample Frederick event to itinerary" },
  beforeEach: () => sampleStorage(),
} satisfies Meta<typeof ItineraryButton>;
export default meta;
type Story = StoryObj<typeof meta>;

const confirmedSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const save = await canvas.findByRole("button", { name: "Save Sample Frederick event" });
  await waitFor(() => expect(save).toBeEnabled());
  const hitArea = getComputedStyle(save, "::after");
  await expect(parseFloat(hitArea.width)).toBeGreaterThanOrEqual(44);
  await expect(parseFloat(hitArea.height)).toBeGreaterThanOrEqual(44);
  await userEvent.click(save);
  const remove = await canvas.findByRole("button", { name: "Remove Sample Frederick event from Saved" });
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ type: "event", id: SAMPLE, saved_at: expect.any(String) }]);
  await userEvent.click(remove);
  await expect(await canvas.findByRole("button", { name: "Save Sample Frederick event" })).toHaveAttribute("aria-pressed", "false");
  await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
};

export const SaveAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: confirmedSave };
export const SaveAt375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, play: confirmedSave };
export const SaveAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: confirmedSave };
export const SaveAt430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, play: confirmedSave };
export const SaveOnDesktop: Story = { globals: { viewport: { value: "radiusDesktop", isRotated: false } }, play: confirmedSave };
export const UnavailableAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => sampleStorage(true),
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole("button", { name: "Saved state unavailable for Sample Frederick event" });
    await expect(button).toBeDisabled();
    await expect(button).not.toHaveAttribute("aria-pressed");
    await expect(localStorage.getItem(KEY)).toBe("{unfinished");
  },
};

let releaseQueuedSave: () => Promise<void> = async () => {};
async function holdSavedChange() {
  const restore = sampleStorage();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const lock = navigator.locks.request(KEY, async () => { entered(); await gate; });
  await ready;
  releaseQueuedSave = async () => { release(); await lock; await navigator.locks.request(KEY, () => {}); };
  return async () => { await releaseQueuedSave(); restore(); };
}
export const QueuedSaveAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: holdSavedChange,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = await canvas.findByRole("button", { name: "Save Sample Frederick event" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    const pending = await canvas.findByRole("button", { name: "Saving Sample Frederick event" });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending).toHaveAttribute("aria-pressed", "false");
    await expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
    await releaseQueuedSave();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Remove Sample Frederick event from Saved" })).toHaveAttribute("aria-pressed", "true"));
  },
};
