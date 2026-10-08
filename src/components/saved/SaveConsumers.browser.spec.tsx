// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { MapPinPlace } from "@/components/map/types";
import type { Event } from "@/data/events";
import { ALL_BEERS, beerKey } from "@/data/beers";
import MapPeek from "@/components/map/MapPeek";
import PendingFollowApplier from "@/components/place/PendingFollowApplier";
import BeerSheet from "@/components/beer/BeerSheet";
import BeerTasteFlight from "@/components/beer/BeerTasteFlight";
import MyTaps from "@/components/beer/MyTaps";
import SavedWallet from "./SavedWallet";
import SavedEventWallet from "./SavedEventWallet";

const mocks = vi.hoisted(() => ({
  saved: false, toggle: vi.fn(), toggleLocal: vi.fn(), add: vi.fn(),
  local: [] as Array<{ type: string; id: string; saved_at: string }>,
  failure: null as null | ((description: string) => void),
  query: new URLSearchParams(), replace: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/hooks/useFollows", () => ({
  useIsFollowed: () => mocks.saved,
  useFollowMutationState: () => "idle",
  useToggleFollow: (_slug: string, _source: string, failure?: (description: string) => void) => { mocks.failure = failure ?? null; return mocks.toggle; },
}));
vi.mock("@/hooks/useSaved", () => ({ useMounted: () => true, useSavedList: () => mocks.local, useIsSaved: () => mocks.saved, useToggleSave: () => mocks.toggleLocal, addSaved: (...args: unknown[]) => mocks.add(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => mocks.query }));
vi.mock("@/components/place/PlaceMedallion", () => ({ PlaceMedallion: () => <span /> }));
vi.mock("@/components/place/PlacePhoto", () => ({ default: () => <span /> }));
vi.mock("@/components/beer/BreweryLogo", () => ({ BreweryLogo: () => <span /> }));
vi.mock("@/components/beer/BreweryPhoto", () => ({ BreweryPhoto: () => <span /> }));
vi.mock("@/components/ui/BottomDrawer", () => ({ default: ({ children }: { children: ReactElement }) => children }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn(), logActivity: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const place = { slug: "test-stop", name: "Test stop", category: "restaurant", municipality: "frederick", geom: { lat: 39.4, lng: -77.4 }, open_status: { state: "unknown" } } as unknown as PlaceCardData & MapPinPlace;
const event = { slug: "test-event", title: "Test event", category: "music", municipality: "frederick", starts_at: "2026-10-08T18:00:00Z", ends_at: "2026-10-08T20:00:00Z", timezone: "America/New_York", venue_name: "Test venue", is_free: true, status: "scheduled" } as Event;
const beer = ALL_BEERS[0];
const refusal = () => { throw new DOMException("Blocked", "SecurityError"); };

describe("Existing save consumers report only confirmed changes", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); mocks.saved = false; mocks.failure = null; mocks.local = []; mocks.query = new URLSearchParams();
    mocks.toggle.mockReset(); mocks.toggleLocal.mockReset(); mocks.add.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ place: null })));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function render(view: ReactElement) { await act(async () => root.render(view)); }
  function button(name: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === name || button.textContent?.trim() === name)!; }
  async function click(name: string) { await act(async () => button(name).click()); }
  const peek = () => <MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from map center" onClose={() => {}} onDetails={() => {}} />;

  it("keeps the Map bookmark unsaved while a save is pending, then reflects confirmed membership", async () => {
    let complete!: (saved: boolean) => void;
    mocks.toggle.mockReturnValue(new Promise<boolean>((resolve) => { complete = resolve; }));
    await render(peek()); await click("Save");
    const control = button("Saving…");
    expect(control.disabled).toBe(true); expect(control.getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toggle).toHaveBeenCalledWith(true);
    await act(async () => { mocks.saved = true; complete(true); });
    expect(button("Saved").getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
  it("reports a Map save refusal without a selected bookmark", async () => {
    mocks.toggle.mockImplementation(async () => { mocks.failure?.("Account full."); return false; });
    await render(peek()); await click("Save");
    expect(button("Save").getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not save this place", { description: "Account full." });
  });
  it("leaves a place wallet card present during and after rejected removal", async () => {
    let fail!: (error: Error) => void;
    mocks.toggle.mockReturnValue(new Promise<boolean>((_resolve, reject) => { fail = reject; }));
    await render(<SavedWallet places={[place]} openSlug={place.slug} />);
    await click("Remove Test stop from saved");
    expect(button("Remove Test stop from saved").disabled).toBe(true);
    expect(button("Remove Test stop from saved").textContent).toContain("Removing");
    expect(container.querySelector('[role="listitem"]')).not.toBeNull();
    expect(mocks.toggle).toHaveBeenCalledWith(false);
    await act(async () => fail(new Error("Unavailable")));
    expect(container.querySelector('[role="listitem"]')).not.toBeNull();
    expect(button("Remove Test stop from saved").disabled).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.any(Object));
  });
  it("reports an unchanged place removal refused by the account seam", async () => {
    mocks.toggle.mockImplementation(async () => { mocks.failure?.("Change still pending."); return true; });
    await render(<SavedWallet places={[place]} openSlug={place.slug} />); await click("Remove Test stop from saved");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", { description: "Change still pending." });
  });
  it("keeps an event wallet card and reports rejected device removal", async () => {
    mocks.toggleLocal.mockImplementation(refusal);
    await render(<SavedEventWallet events={[event]} now={new Date("2026-10-08T13:00:00Z")} startRaised />);
    await click("Remove Test event from saved");
    expect(mocks.toggleLocal).toHaveBeenCalledWith(false);
    expect(container.querySelector('[role="listitem"]')).not.toBeNull();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.any(Object));
  });
  it.each(["reject", "refuse"])("reports a post-sign-in %s without a false Saved toast", async (outcome) => {
    mocks.query = new URLSearchParams("follow=test-stop");
    mocks.toggle.mockImplementation(async () => { if (outcome === "reject") throw new Error("Unavailable"); mocks.failure?.("Account changed."); return true; });
    await render(<PendingFollowApplier slug="test-stop" name="Test stop" />);
    expect(mocks.toggle).toHaveBeenCalledWith(true);
    expect(mocks.toast.success).not.toHaveBeenCalled(); expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  it("reports a rejected beer-sheet save without claiming Saved", async () => {
    mocks.toggleLocal.mockImplementation(refusal);
    await render(<BeerSheet beer={beer} onClose={() => {}} />); await click("Save this pour");
    expect(button("Save this pour").getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not save this pour", expect.any(Object));
  });
  it("reports a failed My taps removal and retains the pour", async () => {
    mocks.local = [{ type: "beer", id: beerKey(beer), saved_at: "2026-10-08T13:00:00Z" }];
    mocks.toggleLocal.mockImplementation(refusal);
    await render(<MyTaps />); await click(`Remove ${beer.name} from saved pours`);
    expect(mocks.toggleLocal).toHaveBeenCalledWith(false);
    expect(button(`Remove ${beer.name} from saved pours`)).toBeTruthy();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove this pour", expect.any(Object));
  });
  it("reports an incomplete flight without a false whole-flight Saved state", async () => {
    mocks.add.mockImplementationOnce(() => {}).mockImplementationOnce(refusal);
    await render(<BeerTasteFlight />); await click("Save flight");
    expect(button("Save flight").disabled).toBe(false);
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not save the full flight", expect.any(Object));
  });
});
