import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadLenses,
  saveLenses,
  upsertLens,
  deleteLens,
  makeLens,
} from "@/lib/lenses";

/** Minimal in-memory localStorage so the node test env can exercise the
 *  storage round-trip (vitest runs with environment: "node"). */
function installFakeWindow() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}
function clearWindow() {
  delete (globalThis as { window?: unknown }).window;
}

describe("lenses store — SSR safety", () => {
  beforeEach(clearWindow);
  it("returns [] and no-ops with no window (server)", () => {
    expect(loadLenses()).toEqual([]);
    expect(() => saveLenses([makeLens("X", {})])).not.toThrow();
    expect(() => upsertLens(makeLens("Y", {}))).not.toThrow();
  });
});

describe("lenses store — with storage", () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installFakeWindow(); });
  afterEach(clearWindow);

  it("makeLens is deterministic when id/now injected", () => {
    const l = makeLens("Dog walk", { cats: ["park"] }, { id: "fixed", now: 1000, icon: "dog" });
    expect(l).toEqual({
      id: "fixed",
      name: "Dog walk",
      icon: "dog",
      state: { cats: ["park"] },
      createdAt: 1000,
    });
  });

  it("upsert adds, then replaces by id (not duplicate)", () => {
    upsertLens(makeLens("A", { onlyGems: true }, { id: "1", now: 1 }));
    let list = upsertLens(makeLens("B", { when: "weekend" }, { id: "2", now: 2 }));
    expect(list.map((l) => l.id)).toEqual(["2", "1"]); // newest first
    list = upsertLens(makeLens("A renamed", { onlyGems: false }, { id: "1", now: 3 }));
    expect(list).toHaveLength(2);
    expect(list.find((l) => l.id === "1")!.name).toBe("A renamed");
  });

  it("deleteLens removes by id and persists", () => {
    upsertLens(makeLens("A", {}, { id: "1", now: 1 }));
    upsertLens(makeLens("B", {}, { id: "2", now: 2 }));
    const after = deleteLens("1");
    expect(after.map((l) => l.id)).toEqual(["2"]);
    expect(loadLenses().map((l) => l.id)).toEqual(["2"]);
  });

  it("loadLenses tolerates corrupt JSON and non-arrays", () => {
    store.set("fr:lenses:v1", "{not json");
    expect(loadLenses()).toEqual([]);
    store.set("fr:lenses:v1", JSON.stringify({ not: "an array" }));
    expect(loadLenses()).toEqual([]);
    store.set("fr:lenses:v1", JSON.stringify([{ bogus: true }, makeLens("ok", {}, { id: "k", now: 9 })]));
    expect(loadLenses().map((l) => l.id)).toEqual(["k"]); // bad entry filtered
  });
});
