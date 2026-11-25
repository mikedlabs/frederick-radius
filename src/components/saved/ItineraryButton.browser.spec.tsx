// @vitest-environment jsdom

import { installSavedLocks } from "../../../tests/helpers/saved-locks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import ItineraryButton from "./ItineraryButton";
import SaveButton, { SAVE_ICON_CLASS } from "./SaveButton";
import { LABELED_EVENT_ACTION_CLASS } from "@/components/event/EventActions";
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
  let locks: ReturnType<typeof installSavedLocks>;
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    locks = installSavedLocks();
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    locks.restore();
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); localStorage.clear();
  });
  async function render(fullPage = false) {
    await act(async () => root.render(<><SavedSnapshot /><ItineraryButton eventId={EVENT} eventName="Donut Thursday" />{fullPage && <SaveButton refType="event" refId={EVENT} label="Save Donut Thursday" />}</>));
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
    expect(button().getAttribute("aria-label")).toBe("Saved Donut Thursday");
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
  it("keeps a queued save unselected and prevents duplicate taps until device confirmation", async () => {
    await render();
    const release = locks.hold();
    await click();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    // aria-busy carries the pending write. The name keeps the state the
    // visitor can see until the device confirms the change.
    expect(button().getAttribute("aria-label")).toBe("Save Donut Thursday");
    expect(saved()).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await click();
    expect(locks.names).toEqual([KEY]);
    await act(async () => { release(); });
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).toHaveBeenCalledOnce();
  });

  it("names the event on removal and restores it from Undo after the control has unmounted", async () => {
    await render(); await click();
    expect(mocks.toast.success).toHaveBeenCalledWith("Saved · Donut Thursday", { id: `save:event:${EVENT}`, duration: 3000, action: { label: "Undo", onClick: expect.any(Function) } });
    await click();
    expect(saved()).toEqual([]);
    expect(mocks.toast).toHaveBeenCalledWith("Removed from Saved · Donut Thursday", { id: `save:event:${EVENT}`, duration: 6000, action: { label: "Undo", onClick: expect.any(Function) } });
    const undo = mocks.toast.mock.calls[0][1].action.onClick;
    await act(async () => root.render(<SavedSnapshot />));
    await act(async () => undo());
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("reports a failed Undo instead of leaving the removal silently in place", async () => {
    await render(); await click(); await click();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    await act(async () => mocks.toast.mock.calls[0][1].action.onClick());
    expect(saved()).toEqual([]);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not undo this change", expect.objectContaining({
      duration: 8000, action: { label: "Try again", onClick: expect.any(Function) },
    }));
    // The card may have unmounted by now, so the error toast is the only way
    // back. Its retry restores the event.
    vi.restoreAllMocks();
    await act(async () => root.render(<SavedSnapshot />));
    await act(async () => mocks.toast.error.mock.calls.at(-1)![1].action.onClick());
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
  });

  it("offers no retry when an ordinary save or removal fails", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    await click();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not save this event", expect.not.objectContaining({ action: expect.anything() }));
    // Save for real, then make the removal fail the same way.
    vi.restoreAllMocks();
    await click();
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    await click();
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not remove from Saved", expect.not.objectContaining({ action: expect.anything() }));
  });

  async function renderShape(appearance: "boxed" | "plain" | "labeled") {
    await act(async () => root.render(<><SavedSnapshot /><ItineraryButton eventId={EVENT} eventName="Donut Thursday" appearance={appearance} /></>));
  }

  it("prints Save, then Saved, beside the bookmark in the labeled shape", async () => {
    // Site audit, November 25, 2026: the event sheet's only Save control was
    // a 36px bookmark with no visible word.
    await renderShape("labeled");
    expect(button().textContent).toBe("Save");
    expect(button().getAttribute("aria-label")).toBe("Save Donut Thursday");
    expect(button().getAttribute("data-save-ref")).toBe(`event:${EVENT}`);
    await click();
    expect(saved()).toEqual([{ type: "event", id: EVENT, saved_at: expect.any(String) }]);
    expect(button().textContent).toBe("Saved");
    expect(button().getAttribute("aria-pressed")).toBe("true");
    // The visible word stays inside the accessible name.
    expect(button().getAttribute("aria-label")).toBe("Saved Donut Thursday");
    await click();
    expect(button().textContent).toBe("Save");
    expect(saved()).toEqual([]);
  });

  it("keeps the labeled word steady while a save is queued, and never claims Saved early", async () => {
    // Review, November 25, 2026: "Removing…" was wider than "Saved" and pushed
    // Share to a second line at 390px while another tab held the lock.
    await renderShape("labeled");
    const release = locks.hold();
    await click();
    expect(button().textContent).toBe("Save");
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Save Donut Thursday");
    await act(async () => { release(); });
    expect(button().textContent).toBe("Saved");
    const removal = locks.hold();
    await click();
    expect(button().textContent).toBe("Saved");
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Saved Donut Thursday");
    await act(async () => { removal(); });
    expect(button().textContent).toBe("Save");
    expect(saved()).toEqual([]);
    await act(async () => root.render(null));
    localStorage.setItem(KEY, "{unfinished");
    await renderShape("labeled");
    expect(button().textContent).toBe("Unavailable");
    expect(button().disabled).toBe(true);
  });

  it("keeps the icon shapes wordless and gives every shape a 44px target class", async () => {
    await renderShape("boxed");
    expect(button().textContent).toBe("");
    expect(button().className).toMatch(/\btap-44\b/);
    expect(button().className).toMatch(/\bborder\b/);
    await renderShape("plain");
    expect(button().textContent).toBe("");
    expect(button().getAttribute("aria-label")).toBe("Save Donut Thursday");
    // An unboxed glyph on a real 44px box, for a list of rows.
    expect(button().className).toMatch(/\bh-11\b/);
    expect(button().className).toMatch(/\bw-11\b/);
    expect(button().className).not.toMatch(/\bborder\b/);
    await renderShape("labeled");
    expect(button().className).toMatch(/\bmin-h-11\b/);
    expect(button().className).toMatch(/\btap-44-y\b/);
  });

  it("reserves the width of Saved in the labeled shape, so the action row keeps its wrap", async () => {
    await renderShape("labeled");
    const word = button().querySelector("[data-save-word]")!;
    expect(word.textContent).toBe("Save");
    // A hidden "Saved" shares the word's grid cell, so Save and Saved are one width.
    expect(word.className).toContain("after:content-['Saved']");
    expect(word.className).toContain("after:invisible");
    expect(word.firstElementChild!.className).toMatch(/\bcol-start-1\b.*\brow-start-1\b/);
  });

  it("shares its icon and labeled class strings with SaveButton and EventActions", async () => {
    await renderShape("plain");
    for (const token of SAVE_ICON_CLASS.split(" ")) expect(button().classList.contains(token)).toBe(true);
    await renderShape("labeled");
    for (const token of LABELED_EVENT_ACTION_CLASS.split(" ")) expect(button().classList.contains(token)).toBe(true);
  });

  it("does not claim Saved state unavailable before the device store is read", () => {
    // Review, November 25, 2026: the static /events HTML named every row's
    // Save "Saved state unavailable for <title>" until hydration.
    for (const appearance of ["boxed", "plain", "labeled"] as const) {
      const host = document.createElement("div");
      host.innerHTML = renderToString(<ItineraryButton eventId={EVENT} eventName="Donut Thursday" appearance={appearance} />);
      const placeholder = host.querySelector("button")!;
      expect(placeholder.outerHTML).not.toMatch(/unavailable/i);
      expect(placeholder.getAttribute("aria-hidden")).toBe("true");
      expect(placeholder.getAttribute("tabindex")).toBe("-1");
      expect(placeholder.disabled).toBe(true);
      expect(placeholder.hasAttribute("title")).toBe(false);
      expect(placeholder.hasAttribute("aria-label")).toBe(false);
      expect(placeholder.getAttribute("data-save-ref")).toBe(`event:${EVENT}`);
      expect(placeholder.textContent).toBe(appearance === "labeled" ? "Save" : "");
    }
  });

  it("reports unsupported coordination without changing readable event saves", async () => {
    await render();
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    await click();
    expect(saved()).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not save this event", { description: "This browser cannot safely coordinate Saved changes. Try a current browser.", duration: 8000 });
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

});
