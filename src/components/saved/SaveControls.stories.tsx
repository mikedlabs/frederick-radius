import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { resetFollowsSyncFlag, useFollowedSlugs, type FollowedSlugsBootstrap } from "@/hooks/useFollows";
import { useMounted } from "@/hooks/useSaved";
import type { PlaceCardData } from "@/lib/loaders/places";
import MyRadiusButton from "@/components/place/MyRadiusButton";
import SaveButton from "./SaveButton";
import SavedWallet from "./SavedWallet";
import SavedEventWallet from "./SavedEventWallet";
import type { Event } from "@/data/events";

const SLUG = "workshop-stop";
const KEY = "fr:saved:v1";
const place = { slug: SLUG, name: "Workshop stop", category: "restaurant", municipality: "frederick", geom: { lat: 39.4, lng: -77.4 }, open_status: { state: "unknown" } } as unknown as PlaceCardData;
let sequence = 0;
let bootstrap: FollowedSlugsBootstrap = { user: null, slugs: [] };
let finish: (ok: boolean) => Promise<void> = async () => {};

function sample(saved = false) {
  toast.dismiss();
  resetFollowsSyncFlag();
  const originalFetch = window.fetch;
  const originalSaved = localStorage.getItem(KEY);
  localStorage.setItem(KEY, "[]");
  const slugs = new Set(saved ? [SLUG] : []);
  bootstrap = { user: { id: `save-workshop-${++sequence}`, email: null }, slugs: [...slugs] };
  let pending: { desired: boolean; resolve: (response: Response) => void } | null = null;
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (url.pathname === "/api/auth/me") return Response.json({ user: bootstrap.user });
    if (url.pathname === "/api/follows") {
      if (!init?.method) return Response.json({ slugs: [...slugs] });
      return new Promise<Response>((resolve) => { pending = { desired: init.method === "POST", resolve }; });
    }
    // Fixtures never send activity, topic, or other component side channels.
    return Response.json({});
  };
  window.fetch = fixtureFetch;
  finish = async (ok) => {
    await waitFor(() => expect(pending).not.toBeNull());
    const request = pending!; pending = null;
    if (ok) { if (request.desired) slugs.add(SLUG); else slugs.delete(SLUG); }
    request.resolve(new Response(null, { status: ok ? 200 : 503 }));
  };
  return async () => {
    if (pending) {
      const priorToastIds = new Set(toast.getHistory().map((entry) => entry.id));
      const failureTitle = pending.desired ? "Could not save this item" : "Could not remove from Saved";
      await finish(false);
      // Pending stories retain their visible state until teardown. Await the
      // consumer's settled failure before dismissing it so the next story
      // cannot replay a late notification from this request.
      await waitFor(() => expect(toast.getHistory().some((entry) =>
        !priorToastIds.has(entry.id) && "type" in entry && "title" in entry
        && entry.type === "error" && entry.title === failureTitle,
      )).toBe(true));
    }
    await Promise.resolve();
    resetFollowsSyncFlag();
    if (window.fetch === fixtureFetch) window.fetch = originalFetch;
    if (originalSaved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, originalSaved);
    finish = async () => {};
    toast.dismiss();
  };
}

function SaveControls() {
  const { slugs } = useFollowedSlugs(bootstrap);
  // Commit the fixture account before mounting unbootstrapped readers, as in
  // the real-hook persistence harness. This story exercises settled identity.
  const bootstrapCommitted = useMounted();
  if (!bootstrapCommitted) return null;
  return <div data-app-primary-tab="/my-radius" className="space-y-4 p-4">
    <div className="flex items-center gap-4">
      <SaveButton refType="place" refId={SLUG} label="Save Workshop stop" barLabel="Save" />
      <MyRadiusButton slug={SLUG} name="Workshop stop" />
    </div>
    <output aria-label="Confirmed saved places">{slugs.has(SLUG) ? "Workshop stop" : "No saved places"}</output>
    <SavedWallet places={slugs.has(SLUG) ? [place] : []} openSlug={SLUG} />
    <Toaster />
  </div>;
}
const meta = { title: "Saved/Confirmed save controls", component: SaveControls, tags: ["autodocs"] } satisfies Meta<typeof SaveControls>;
export default meta;
type Story = StoryObj<typeof meta>;
async function confirmedControls(canvasElement: HTMLElement, saved: boolean) {
  const canvas = within(canvasElement);
  await waitFor(() => {
    const controls = saved ? [
      canvas.getByRole("button", { name: "Remove Workshop stop from Saved" }),
      canvas.getByRole("button", { name: "Saved. Tap to remove Workshop stop" }),
    ] : canvas.getAllByRole("button", { name: "Save Workshop stop" });
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      expect(control).toHaveAttribute("aria-pressed", String(saved));
      expect(control).toBeEnabled();
    }
  });
  return canvas;
}
async function beginSave(canvasElement: HTMLElement) {
  const canvas = await confirmedControls(canvasElement, false);
  const control = await canvas.findAllByRole("button", { name: "Save Workshop stop" });
  await userEvent.click(control[0]);
  await waitFor(() => expect(canvas.getAllByRole("button", { name: "Saving Workshop stop" })).toHaveLength(2));
  for (const button of canvas.getAllByRole("button", { name: "Saving Workshop stop" })) {
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(button).toBeDisabled();
  }
  await expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("No saved places");
  return canvas;
}

export const Unsaved: Story = { beforeEach: () => sample(), play: async ({ canvasElement }) => { await confirmedControls(canvasElement, false); } };
export const PendingSave: Story = { beforeEach: () => sample(), play: async ({ canvasElement }) => { await beginSave(canvasElement); } };
export const ConfirmedSave: Story = { beforeEach: () => sample(), play: async ({ canvasElement }) => {
  const canvas = await beginSave(canvasElement); await finish(true);
  await waitFor(() => expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("Workshop stop"));
  await confirmedControls(canvasElement, true);
} };
export const FailedSave: Story = { beforeEach: () => sample(), play: async ({ canvasElement }) => {
  const canvas = await beginSave(canvasElement); await finish(false);
  await confirmedControls(canvasElement, false);
  await expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("No saved places");
  await waitFor(() => expect(within(document.body).getByText("Could not save this item")).toBeVisible());
} };
export const PendingRemoval: Story = { beforeEach: () => sample(true), play: async ({ canvasElement }) => {
  const canvas = await confirmedControls(canvasElement, true);
  await userEvent.click(await canvas.findByRole("button", { name: "Remove Workshop stop from saved" }));
  await waitFor(() => expect(canvas.getByRole("button", { name: "Remove Workshop stop from saved" })).toBeDisabled());
  await expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("Workshop stop");
  await expect(canvas.getAllByRole("button", { name: "Removing Workshop stop" })).toHaveLength(2);
  for (const button of canvas.getAllByRole("button", { name: "Removing Workshop stop" })) await expect(button).toHaveAttribute("aria-pressed", "true");
} };
export const FailedRemoval: Story = { beforeEach: () => sample(true), play: async ({ canvasElement }) => {
  const canvas = await confirmedControls(canvasElement, true);
  await userEvent.click(await canvas.findByRole("button", { name: "Remove Workshop stop from saved" })); await finish(false);
  await waitFor(() => expect(canvas.getByRole("button", { name: "Remove Workshop stop from saved" })).toBeEnabled());
  await expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("Workshop stop");
  await confirmedControls(canvasElement, true);
  await waitFor(() => expect(within(document.body).getByText("Could not remove from Saved")).toBeVisible());
} };
export const ConfirmedRemoval: Story = { beforeEach: () => sample(true), play: async ({ canvasElement }) => {
  const canvas = await confirmedControls(canvasElement, true);
  await userEvent.click(await canvas.findByRole("button", { name: "Remove Workshop stop from saved" })); await finish(true);
  await waitFor(() => expect(canvas.getByLabelText("Confirmed saved places")).toHaveTextContent("No saved places"));
  await expect(canvas.queryByRole("list", { name: "Saved places, as a card wallet" })).toBeNull();
  await confirmedControls(canvasElement, false);
} };

const eventSample = {
  slug: "workshop-saved-event", title: "Community concert", description: "The event is a sample for review.",
  starts_at: "2029-10-10T14:00:00-04:00", ends_at: "2029-10-10T16:00:00-04:00", timezone: "America/New_York",
  venue_name: "Community hall", address: "Frederick County", municipality: "frederick", category: "music", audience: [], is_free: true, source: "manual", is_verified: false,
  geom: { lat: 39.414, lng: -77.41 },
} satisfies Event;
const eventNow = new Date("2029-10-08T12:00:00-04:00");
function EventDeck({ multiple = false }: { multiple?: boolean }) {
  return <div data-app-primary-tab="/my-radius" className="w-[min(30rem,100vw)] p-4">
    <SavedEventWallet events={multiple ? [eventSample, { ...eventSample, slug: "workshop-second-event", title: "Library story afternoon" }] : [eventSample]} now={eventNow} />
  </div>;
}
export const SingleCollapsedEventAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => sample(), render: () => <EventDeck />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("listitem").firstElementChild!;
    const disclosure = canvas.getByRole("button", { name: "Show details for Community concert" });
    await expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(96);
    await expect(disclosure.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(disclosure);
    await waitFor(() => expect(canvas.getByRole("link", { name: /Open event/ })).toBeVisible());
    await expect(card.getBoundingClientRect().height).toBeGreaterThanOrEqual(186);
    await userEvent.click(canvas.getByRole("button", { name: "Hide details for Community concert" }));
    await expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(96);
  },
};
export const MultipleCollapsedEventsAt390: Story = {
  ...SingleCollapsedEventAt390, render: () => <EventDeck multiple />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [first, last] = canvas.getAllByRole("listitem");
    await expect(first.firstElementChild!.getBoundingClientRect().height).toBe(186);
    await expect(last.firstElementChild!.getBoundingClientRect().height).toBe(186);
    await expect(Math.abs(last.getBoundingClientRect().top - first.getBoundingClientRect().top - 62)).toBeLessThanOrEqual(1);
    await userEvent.click(canvas.getByRole("button", { name: "Show details for Library story afternoon" }));
    await expect(last.firstElementChild!.getBoundingClientRect().height).toBeGreaterThanOrEqual(186);
    await waitFor(() => expect(canvas.getByRole("link", { name: /Open event/ })).toBeVisible());
  },
};
