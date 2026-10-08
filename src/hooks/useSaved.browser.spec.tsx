// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSaved, useSavedList, useToggleSave } from "./useSaved";

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
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Snapshot />));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("does not publish or celebrate a storage write that silently refuses the save", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { expect(() => toggle()).toThrow(); });
    expect(container.textContent).toBe("");
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it("keeps the last confirmed saved row when its removal is refused", async () => {
    await act(async () => toggle());
    vi.clearAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { expect(() => toggle()).toThrow(); });
    expect(container.textContent).toBe("test-event");
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toHaveLength(1);
    expect(effects.cancel).not.toHaveBeenCalled();
  });

  it("does not publish an imperative save that is refused", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { expect(() => addSaved("event", "imperative-event")).toThrow(); });
    expect(container.textContent).toBe("");
    expect(effects.signal).not.toHaveBeenCalled();
  });

  it("does not publish a write whose persisted value cannot be read back", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await act(async () => { expect(() => toggle()).toThrow(); });
    expect(container.textContent).toBe("");
    expect(effects.signal).not.toHaveBeenCalled();
    expect(effects.persist).not.toHaveBeenCalled();
  });

  it.each(["{broken", "null", "{}"])("refuses to replace an unreadable saved value %s", async (raw) => {
    localStorage.setItem("fr:saved:v1", raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { expect(() => toggle(true)).toThrow(); });
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
      expect(attempt).toThrow("The saved list could not be read.");
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
    await act(async () => { expect(() => toggle(true)).toThrow(); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.signal).not.toHaveBeenCalled();
  });

  it("does not publish success when only the post-write readback becomes unavailable", async () => {
    const realRead = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(function (this: Storage, key: string) { return realRead.call(this, key); })
      .mockImplementation(() => { throw new Error("Readback blocked"); });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { expect(() => toggle(true)).toThrow(); });
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
    await act(async () => { expect(toggle(true)).toBe(true); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.signal).not.toHaveBeenCalled();
    await act(async () => { expect(toggle(false)).toBe(false); });
    expect(container.textContent).toBe("other-row");
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toEqual([expect.objectContaining({ type: "radius", id: "other-row" })]);
    writes.mockClear();
    effects.cancel.mockClear();
    await act(async () => { expect(toggle(false)).toBe(false); });
    expect(writes).not.toHaveBeenCalled();
    expect(effects.cancel).not.toHaveBeenCalled();
  });

});
