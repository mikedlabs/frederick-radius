// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ItineraryButton from "./ItineraryButton";
import SaveButton from "./SaveButton";
import { useSavedList } from "@/hooks/useSaved";

const mocks = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useFollows", () => ({ useFollowMutationState: () => "idle", useIsFollowed: () => false, useToggleFollow: () => vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ decisionContextFromPath: () => ({ surface: "events", position: "detail" }), trackDecision: vi.fn() }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: vi.fn() }));
vi.mock("@/lib/pwa-display", () => ({ isStandalone: () => false, isInstallPromptSuppressedPath: () => false }));
vi.mock("@/lib/return-bridge", () => ({ currentReturnBridgeState: () => ({ completed: true, valueKind: null }), openReturnBridge: vi.fn(), cancelPendingReturnBridgeValue: vi.fn(), signalReturnBridgeValue: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const KEY = "fr:saved:v1";
const EVENT = "donut-thursday-test";
function SavedSnapshot() { return <output>{JSON.stringify(useSavedList())}</output>; }

describe("Event detail save uses the Saved tab's device store", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); localStorage.clear();
  });
  async function render(fullPage = false) {
    await act(async () => root.render(<><SavedSnapshot /><ItineraryButton eventId={EVENT} label="Add Donut Thursday to itinerary" />{fullPage && <SaveButton refType="event" refId={EVENT} label="Save Donut Thursday" />}</>));
  }
  function button(index = 0) { return container.querySelectorAll<HTMLButtonElement>("button")[index]; }
  function saved() { return JSON.parse(container.querySelector("output")!.textContent!); }
  async function click(index = 0) { await act(async () => button(index).click()); }

  it("persists the detail action in Saved through unmount and later remount", async () => {
    const oldItinerary = JSON.stringify([{ id: "old-plan-event", added_at: "2026-10-01T12:00:00Z" }]);
    localStorage.setItem("fr:itinerary:v1", oldItinerary);
    await render(); await click();
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    const committed = localStorage.getItem(KEY);
    expect(JSON.parse(committed!)).toEqual(saved());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Remove Donut Thursday from Saved");
    expect(mocks.toast.success).toHaveBeenCalled();
    await act(async () => root.render(null));
    await render();
    expect(localStorage.getItem(KEY)).toBe(committed);
    expect(saved()).toHaveLength(1);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("fr:itinerary:v1")).toBe(oldItinerary);
  });

  it("never displays saved or emits success when storage rejects the write", async () => {
    await render();
    const control = button();
    const seen: Array<string | null> = [control.getAttribute("aria-pressed")];
    const recordChanges = (records: MutationRecord[]) => {
      // oldValue catches a transient true -> false change in one delivery turn.
      for (const record of records) seen.push(record.oldValue);
      seen.push(control.getAttribute("aria-pressed"));
    };
    const observer = new MutationObserver(recordChanges);
    observer.observe(control, { attributes: true, attributeFilter: ["aria-pressed"], attributeOldValue: true });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await click();
    await Promise.resolve(); // Deliver observer callbacks before stopping it.
    recordChanges(observer.takeRecords());
    observer.disconnect();
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(seen).not.toContain("true");
    expect(saved()).toEqual([]); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("does not trust a write that fails its device-storage readback", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await click();
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(saved()).toEqual([]); expect(mocks.toast.success).not.toHaveBeenCalled(); expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("does not erase saved places or corrupt stored data while saving an event", async () => {
    const place = { type: "place", id: "cafe-nola", saved_at: "2026-10-01T12:00:00Z" };
    localStorage.setItem(KEY, JSON.stringify([place]));
    await render(); await click();
    expect(saved()).toEqual([place, { type: "event", id: EVENT, saved_at: expect.any(String) }]);
    await act(async () => root.render(null));
    const corrupt = "{unfinished"; localStorage.setItem(KEY, corrupt);
    await render(); await click();
    expect(localStorage.getItem(KEY)).toBe(corrupt);
    expect(button().getAttribute("aria-pressed")).toBeNull();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-label")).toBe("Saved state unavailable for Donut Thursday");
  });

  it("keeps both event controls synchronized and rejects failed removal", async () => {
    await render(true); await click();
    expect(button(1).getAttribute("aria-pressed")).toBe("true");
    const committed = localStorage.getItem(KEY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    await click(1);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button(1).getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(KEY)).toBe(committed);
    expect(mocks.toast.error).toHaveBeenCalled();
    vi.restoreAllMocks(); await click(1);
    expect(button().getAttribute("aria-pressed")).toBe("false"); expect(saved()).toEqual([]);
  });

  it("makes an unreadable readback unknown after removal instead of keeping a false saved claim", async () => {
    await render(true); await click();
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    let blocked = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      set.call(this, key, value);
      if (key === KEY) blocked = true;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === KEY && blocked) throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    });
    mocks.toast.success.mockClear();
    await click();
    expect(get.call(localStorage, KEY)).toBe("[]");
    for (const control of container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(control.getAttribute("aria-pressed")).toBeNull();
      expect(control.disabled).toBe(true);
      expect(control.getAttribute("aria-label")).toContain("Saved state unavailable");
    }
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("updates both existing event actions when another tab removes the saved event", async () => {
    await render(true); await click();
    await act(async () => {
      localStorage.setItem(KEY, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "[]", storageArea: localStorage }));
    });
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button(1).getAttribute("aria-pressed")).toBe("false");
  });

  it("treats a malformed stored row as unavailable on both event controls without replacing it", async () => {
    localStorage.setItem(KEY, "[null]");
    await render(true);
    for (const control of container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(control.disabled).toBe(true);
      expect(control.getAttribute("aria-pressed")).toBeNull();
      expect(control.getAttribute("aria-label")).toContain("Saved state unavailable");
    }
    expect(localStorage.getItem(KEY)).toBe("[null]");
  });

  it("honors the rendered Add intent twice before either control rerenders", async () => {
    await render(true);
    await act(async () => { button().click(); button(1).click(); });
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    expect(button().getAttribute("aria-pressed")).toBe("true"); expect(button(1).getAttribute("aria-pressed")).toBe("true");
  });
});
