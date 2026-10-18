import { describe, expect, it } from "vitest";
import { BROWSE_SCROLL_RETURN_KEY, consumeBrowseScrollReturn, markBrowseScrollReturn } from "./browse-scroll-return";

function deviceStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("explicit browse return scroll intent", () => {
  it("restores once for the same safe route and exact filters without storing a second coordinate", () => {
    const storage = deviceStorage();
    const origin = "/events?in=frederick&lens=today&view=calendar";
    markBrowseScrollReturn(`${origin}#events`, storage, 1_000);
    expect(JSON.parse(storage.getItem(BROWSE_SCROLL_RETURN_KEY)!)).toEqual({ key: origin, at: 1_000 });
    expect(consumeBrowseScrollReturn(origin, storage, 1_100)).toBe(true);
    expect(consumeBrowseScrollReturn(origin, storage, 1_200)).toBe(false);
  });

  it.each(["/events?in=brunswick&lens=today", "/events?in=frederick&lens=weekend", "/today", "/map?in=frederick"])("unrelated navigation removes the intent instead of replaying it later: %s", (destination) => {
    const storage = deviceStorage();
    const origin = "/events?in=frederick&lens=today";
    markBrowseScrollReturn(origin, storage, 1_000);
    expect(consumeBrowseScrollReturn(destination, storage, 1_100)).toBe(false);
    expect(consumeBrowseScrollReturn(origin, storage, 1_200)).toBe(false);
  });

  it.each(["https://outside.example/events", "//outside.example/events", "/api/private", "/places/arbitrary", "/events/constructor", "/%2f%2foutside.example/events"])("does not mark an unsafe return: %s", (destination) => {
    const storage = deviceStorage();
    markBrowseScrollReturn(destination, storage, 1_000);
    expect(storage.getItem(BROWSE_SCROLL_RETURN_KEY)).toBeNull();
  });

  it.each([0, 31_001, Number.NaN])("rejects expired, future, or invalid clock evidence: %s", (now) => {
    const storage = deviceStorage();
    markBrowseScrollReturn("/today?in=frederick", storage, 1_000);
    expect(consumeBrowseScrollReturn("/today?in=frederick", storage, now)).toBe(false);
    expect(storage.getItem(BROWSE_SCROLL_RETURN_KEY)).toBeNull();
  });

  it.each(["not json", "null", '"string"', '{"key":"/today","at":"1000"}', '{"key":"https://outside.example/events","at":1000}'])("fails safely and consumes malformed device state: %s", (serialized) => {
    const storage = deviceStorage();
    storage.setItem(BROWSE_SCROLL_RETURN_KEY, serialized);
    expect(consumeBrowseScrollReturn("/today", storage, 1_100)).toBe(false);
    expect(storage.getItem(BROWSE_SCROLL_RETURN_KEY)).toBeNull();
  });

  it("keeps ordinary safe navigation available when device storage is denied", () => {
    const denied = { getItem: () => { throw new Error("storage denied"); }, setItem: () => { throw new Error("storage denied"); }, removeItem: () => { throw new Error("storage denied"); } };
    expect(() => markBrowseScrollReturn("/today", denied, 1_000)).not.toThrow();
    expect(consumeBrowseScrollReturn("/today", denied, 1_100)).toBe(false);
  });
});
