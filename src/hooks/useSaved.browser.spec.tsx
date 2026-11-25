// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSavedLocks } from "../../tests/helpers/saved-locks";
import { addSaved, setEventSaved, useSavedList, useToggleSave } from "./useSaved";

const effects = vi.hoisted(() => ({ persist: vi.fn(), signal: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: effects.persist }));
vi.mock("@/lib/return-bridge", () => ({ signalReturnBridgeValue: effects.signal, cancelPendingReturnBridgeValue: effects.cancel }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let toggle: ReturnType<typeof useToggleSave>;
function Snapshot() {
  const change = useToggleSave("event", "test-event");
  useEffect(() => { toggle = change; }, [change]);
  return <output>{useSavedList().map((item) => item.id).join(",")}</output>;
}

describe("device save write confirmation", () => {
  let locks: ReturnType<typeof installSavedLocks>;
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    locks = installSavedLocks();
    localStorage.clear();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Snapshot />));
  });
  afterEach(async () => {
    locks.restore();
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("does not publish or celebrate a storage write that silently refuses the save", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { await expect(toggle()).rejects.toThrow(); });
    expect(container.textContent).toBe("");
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it("keeps the last confirmed saved row when its removal is refused", async () => {
    await act(async () => toggle());
    vi.clearAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { await expect(toggle()).rejects.toThrow(); });
    expect(container.textContent).toBe("test-event");
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toHaveLength(1);
    expect(effects.cancel).not.toHaveBeenCalled();
  });

  it("does not publish an imperative save that is refused", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { await expect(addSaved("event", "imperative-event")).rejects.toThrow(); });
    expect(container.textContent).toBe("");
    expect(effects.signal).not.toHaveBeenCalled();
  });

  it("does not publish a write whose persisted value cannot be read back", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await act(async () => { await expect(toggle()).rejects.toThrow(); });
    expect(container.textContent).toBe("");
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it.each(["{broken", "null", "{}"])("refuses to replace an unreadable saved value %s", async (raw) => {
    localStorage.setItem("fr:saved:v1", raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { await expect(toggle(true)).rejects.toThrow(); });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("fr:saved:v1")).toBe(raw);
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it.each([
    "[null]",
    "[[]]",
    "[1]",
    "[{}]",
    '[{"type":"unknown","id":"old-row","saved_at":"2026-10-07"}]',
    '[{"type":"event","id":"","saved_at":"2026-10-07"}]',
    '[{"type":"event","id":"   ","saved_at":"2026-10-07"}]',
    '[{"type":"event","id":42,"saved_at":"2026-10-07"}]',
    '[{"type":"event","id":"old-row"}]',
    '[{"type":"event","id":"old-row","saved_at":null}]',
    '[{"type":"event","id":"old-row","saved_at":42}]',
    '[{"type":"place","id":"valid-row","saved_at":"2026-10-07"},{"type":"event","id":"invalid-row"}]',
    "null",
    "{}",
  ].flatMap((raw) => ["toggle", "append"].map((writer) => [writer, raw] as const)))
  ("%s refuses every invalid stored row in %s without replacing its bytes", async (writer, raw) => {
    localStorage.setItem("fr:saved:v1", raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      const attempt = writer === "toggle" ? () => toggle(true) : () => addSaved("event", "new-event");
      await expect(attempt()).rejects.toThrow("The saved list could not be read.");
    });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("fr:saved:v1")).toBe(raw);
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.cancel).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a saved list while its initial read is blocked", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await act(async () => { await expect(toggle(true)).rejects.toThrow(); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.signal).not.toHaveBeenCalled();
  });

  it("does not publish success when only the post-write readback becomes unavailable", async () => {
    const realRead = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(function (this: Storage, key: string) { return realRead.call(this, key); })
      .mockImplementation(() => { throw new Error("Readback blocked"); });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { await expect(toggle(true)).rejects.toThrow(); });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("");
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
    // The transport to device storage may have succeeded; this is uncertainty.
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toHaveLength(1);
  });

  it("keeps explicit add/remove intents idempotent and preserves other rows", async () => {
    await act(async () => addSaved("radius", "other-row"));
    await act(async () => toggle(true));
    vi.clearAllMocks();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { expect(await toggle(true)).toBe(true); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.signal).not.toHaveBeenCalled();
    await act(async () => { expect(await toggle(false)).toBe(false); });
    expect(container.textContent).toBe("other-row");
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toEqual([expect.objectContaining({ type: "radius", id: "other-row" })]);
    writes.mockClear();
    effects.cancel.mockClear();
    await act(async () => { expect(await toggle(false)).toBe(false); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.cancel).not.toHaveBeenCalled();
  });

  it("queues event, radius and toggle writers behind the same origin lock before reading", async () => {
    const release = locks.hold();
    const event = setEventSaved("event-a", true);
    const radius = addSaved("radius", "radius-b");
    const toggled = toggle(true);
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(effects.signal).not.toHaveBeenCalled();
    expect(locks.names).toEqual(["fr:saved:v1", "fr:saved:v1", "fr:saved:v1"]);
    await act(async () => { release(); await Promise.all([event, radius, toggled]); });
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!).map((item: { id: string }) => item.id)).toEqual(["event-a", "radius-b", "test-event"]);
  });

  it("preserves independent writers from separate loaded tab modules", async () => {
    vi.resetModules();
    const otherTab = await import("./useSaved");
    const release = locks.hold();
    const first = setEventSaved("tab-one", true);
    const second = otherTab.addSaved("place", "tab-two");
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    await act(async () => { release(); await Promise.all([first, second]); });
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!).map((item: { id: string }) => item.id)).toEqual(["tab-one", "tab-two"]);
  });

  it("restores a removed event with the day it was first saved, for this tab and every other", async () => {
    const original = "2026-11-18T15:00:00.000Z";
    localStorage.setItem("fr:saved:v1", JSON.stringify([
      { type: "place", id: "kept-place", saved_at: "2026-11-01T12:00:00.000Z" },
      { type: "event", id: "undo-event", saved_at: original },
    ]));
    await act(async () => { expect(await setEventSaved("undo-event", false)).toBe(false); });
    vi.resetModules();
    const otherTab = await import("./useSaved");
    expect(otherTab.useSavedList).toBeTypeOf("function");
    await act(async () => { expect(await setEventSaved("undo-event", true, original)).toBe(true); });
    const stored = JSON.parse(localStorage.getItem("fr:saved:v1")!) as { id: string; saved_at: string }[];
    expect(stored.find((row) => row.id === "undo-event")?.saved_at).toBe(original);
    // A second tab reads the same bytes when the storage event arrives.
    function OtherTab() { return <span>{otherTab.useSavedList().map((row) => `${row.id}@${row.saved_at}`).join(",")}</span>; }
    const tab = document.createElement("div");
    const tabRoot = createRoot(tab);
    await act(async () => tabRoot.render(<OtherTab />));
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "fr:saved:v1", storageArea: localStorage })); });
    expect(tab.textContent).toContain(`undo-event@${original}`);
    await act(async () => tabRoot.unmount());
    // A stamp offered for a row that is already saved changes nothing, and a
    // stamp that is not a date falls back to the time of the save.
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { expect(await setEventSaved("undo-event", true, "2020-01-01T00:00:00.000Z")).toBe(true); });
    expect(writes).not.toHaveBeenCalled();
    await act(async () => { await setEventSaved("fresh-event", true, "not a date"); });
    const fresh = (JSON.parse(localStorage.getItem("fr:saved:v1")!) as { id: string; saved_at: string }[]).find((row) => row.id === "fresh-event");
    expect(Number.isFinite(Date.parse(fresh!.saved_at))).toBe(true);
  });

  it("preserves old data and rejects changes when this browser cannot coordinate writes", async () => {
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "event", id: "old", saved_at: "2026-10-08" }]));
    const old = localStorage.getItem("fr:saved:v1");
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    await expect(setEventSaved("new", true)).rejects.toThrow("coordinate");
    expect(localStorage.getItem("fr:saved:v1")).toBe(old);
    expect(effects.signal).not.toHaveBeenCalled();
  });
});
