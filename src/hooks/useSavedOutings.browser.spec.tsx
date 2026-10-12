// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSavedLocks } from "../../tests/helpers/saved-locks";
import { encodeSpec } from "@/lib/plan/plan-token";
import { MAX_SAVED_OUTINGS, SAVED_OUTINGS_KEY } from "@/lib/saved-outings";
import { SAVED_TRANSIT_STOPS_KEY, SAVED_TRANSIT_BUSES_KEY } from "@/components/transit/transitRiderModel";
import { refreshSavedOutings, removeOuting, saveOuting, useSavedOutings } from "./useSavedOutings";

const persistence = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: persistence.persist }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const token = (seed = 1) => encodeSpec({ v: 1, i: { audience: "date", vibe: "easy", duration_hours: 3, start_at: "2026-10-12T12:28:53.228Z", municipality: "brunswick", seed, require_verified_hours: false }, s: [{ p: "brunswick-heritage-museum" }, { p: "beans-in-the-belfry-brunswick" }, { p: "city-of-brunswick-maryland-train-viewing-platform-brunswick" }] });
function Snapshot() { const state = useSavedOutings(); return <output data-state={state.status}>{state.outings.map((row) => row.title).join(",")}</output>; }

describe("confirmed browser-local outing writes", () => {
  let root: Root;
  let host: HTMLDivElement;
  let locks: ReturnType<typeof installSavedLocks>;
  beforeEach(async () => {
    localStorage.clear();
    refreshSavedOutings();
    locks = installSavedLocks();
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<Snapshot />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    locks.restore();
    vi.restoreAllMocks();
    localStorage.clear();
    refreshSavedOutings();
  });
  const output = () => document.querySelector("output")!;
  const stored = () => JSON.parse(localStorage.getItem(SAVED_OUTINGS_KEY) ?? "[]");

  it("confirms the exact token only after entering the shared lock and reading it back", async () => {
    const release = locks.hold();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const pending = saveOuting(token(), "Our date");
    expect(output().textContent).toBe("");
    expect(writes).not.toHaveBeenCalled();
    await act(async () => { release(); await pending; });
    expect(stored()).toEqual([{ token: token(), title: "Our date", saved_at: expect.any(String) }]);
    expect(output().textContent).toBe("Our date");
    expect(locks.names).toEqual([SAVED_OUTINGS_KEY]);
    expect(persistence.persist).toHaveBeenCalledTimes(1);
  });
  it("makes duplicate saves and removals idempotent instead of reversing a newer intent", async () => {
    await act(async () => saveOuting(token(), "Our date"));
    const first = localStorage.getItem(SAVED_OUTINGS_KEY);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => saveOuting(token(), "A refreshed title"));
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBe(first);
    expect(writes).not.toHaveBeenCalled();
    await act(async () => removeOuting(token()));
    expect(stored()).toEqual([]);
    writes.mockClear();
    await act(async () => removeOuting(token()));
    expect(writes).not.toHaveBeenCalled();
  });
  it("preserves concurrent additions and a removal by reading each intent inside the same lock", async () => {
    const release = locks.hold();
    const first = saveOuting(token(1), "First");
    const second = saveOuting(token(2), "Second");
    const removal = removeOuting(token(1));
    const third = saveOuting(token(3), "Third");
    await act(async () => { release(); await Promise.all([first, second, removal, third]); });
    expect(stored().map((row: { title: string }) => row.title)).toEqual(["Third", "Second"]);
    expect(locks.names).toEqual(Array(4).fill(SAVED_OUTINGS_KEY));
  });
  it("leaves every existing favorites and transit byte unchanged", async () => {
    const original = JSON.stringify([{ type: "event", id: "runtime-concert", saved_at: "2026-10-12" }, { type: "place", id: "cafe-nola", saved_at: "2026-10-12" }, { type: "radius", id: "old-radius", saved_at: "2026-10-12" }, { type: "beer", id: "a-pour", saved_at: "2026-10-12" }]);
    localStorage.setItem("fr:saved:v1", original);
    localStorage.setItem(SAVED_TRANSIT_STOPS_KEY, "unchanged transit stops");
    localStorage.setItem(SAVED_TRANSIT_BUSES_KEY, "unchanged transit buses");
    await act(async () => saveOuting(token(), "Our date"));
    await act(async () => removeOuting(token()));
    expect(localStorage.getItem("fr:saved:v1")).toBe(original);
    expect(localStorage.getItem(SAVED_TRANSIT_STOPS_KEY)).toBe("unchanged transit stops");
    expect(localStorage.getItem(SAVED_TRANSIT_BUSES_KEY)).toBe("unchanged transit buses");
  });
  it("does not publish or claim a save whose write is silently refused", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { await expect(saveOuting(token(), "Refused")).rejects.toThrow("could not confirm"); });
    expect(output().textContent).toBe("");
    expect(output().getAttribute("data-state")).toBe("unavailable");
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBeNull();
    expect(persistence.persist).not.toHaveBeenCalled();
  });
  it("keeps the last confirmed row if removal readback is refused", async () => {
    await act(async () => saveOuting(token(), "Still saved"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { await expect(removeOuting(token())).rejects.toThrow("could not confirm"); });
    expect(output().textContent).toBe("Still saved");
    expect(stored()).toHaveLength(1);
    expect(output().getAttribute("data-state")).toBe("unavailable");
  });
  it("does not publish a new row if only post-write readback becomes blocked", async () => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(function (this: Storage, key: string) { return read.call(this, key); })
      .mockImplementation(() => { throw new Error("Readback blocked"); });
    await act(async () => { await expect(saveOuting(token(), "Unconfirmed")).rejects.toThrow(); });
    expect(output().textContent).toBe("");
    expect(output().getAttribute("data-state")).toBe("unavailable");
    expect(persistence.persist).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(stored()).toHaveLength(1); // A transport may succeed without confirmation.
    await act(async () => refreshSavedOutings());
    expect(output().textContent).toBe("Unconfirmed"); // Explicit actual reread recovers it.
  });
  it.each(["{broken", "null", "{}", "[null]", '[{"token":"wrong","title":"Old","saved_at":"2026-10-12"}]'])
  ("never replaces malformed saved-outing bytes %s", async (raw) => {
    localStorage.setItem(SAVED_OUTINGS_KEY, raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { await expect(saveOuting(token(), "New")).rejects.toThrow(); });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBe(raw);
    expect(output().getAttribute("data-state")).toBe("unavailable");
  });
  it("does not write while storage is blocked and recovers only after a successful retry", async () => {
    const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { await expect(saveOuting(token(), "Blocked")).rejects.toThrow(); });
    expect(writes).not.toHaveBeenCalled();
    expect(output().getAttribute("data-state")).toBe("unavailable");
    reads.mockRestore();
    await act(async () => refreshSavedOutings());
    expect(output().getAttribute("data-state")).toBe("ready");
    await act(async () => saveOuting(token(), "Recovered"));
    expect(output().textContent).toBe("Recovered");
  });
  it("handles another tab's update and clear without reacting to an unrelated key", async () => {
    const external = JSON.stringify([{ token: token(2), title: "Other tab", saved_at: "2026-10-12T12:30:00Z" }]);
    localStorage.setItem(SAVED_OUTINGS_KEY, external);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", storageArea: localStorage })));
    expect(output().textContent).toBe("");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: SAVED_OUTINGS_KEY, storageArea: localStorage })));
    expect(output().textContent).toBe("Other tab");
    localStorage.clear();
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage })));
    expect(output().textContent).toBe("");
  });
  it("reports malformed cross-tab updates without replacing the last confirmed card", async () => {
    await act(async () => saveOuting(token(), "Confirmed"));
    localStorage.setItem(SAVED_OUTINGS_KEY, "[broken");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: SAVED_OUTINGS_KEY })));
    expect(output().textContent).toBe("Confirmed");
    expect(output().getAttribute("data-state")).toBe("unavailable");
  });
  it("fails closed without origin-wide Web Locks", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await expect(saveOuting(token(), "Unsafe")).rejects.toThrow("safely coordinate");
    expect(writes).not.toHaveBeenCalled();
  });
  it("refuses additions beyond the bounded list without deleting existing outings", async () => {
    await act(async () => { for (let n = 1; n <= MAX_SAVED_OUTINGS; n++) await saveOuting(token(n), "Outing " + n); });
    const before = localStorage.getItem(SAVED_OUTINGS_KEY);
    await act(async () => { await expect(saveOuting(token(99), "Too many")).rejects.toThrow("Remove one"); });
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBe(before);
    expect(stored()).toHaveLength(MAX_SAVED_OUTINGS);
    expect(output().getAttribute("data-state")).toBe("ready");
  });
});
