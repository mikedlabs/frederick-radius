// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "./brand";
import { APPEARANCE_BOOTSTRAP, APPEARANCE_KEY, applyAppearance, getAppearance, subscribeAppearance } from "./appearance";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.appearance;
  document.head.innerHTML = '<meta name="theme-color" content="initial">';
});
afterEach(() => { vi.restoreAllMocks(); });

describe("explicit product appearance", () => {
  it("starts light without consulting the operating system", () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    window.eval(APPEARANCE_BOOTSTRAP);
    expect(getAppearance()).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.matchMedia).not.toHaveBeenCalled();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(BRAND.colors.cream);
  });
  it("restores only an explicit saved dark choice before hydration", () => {
    window.localStorage.setItem(APPEARANCE_KEY, "dark");
    window.eval(APPEARANCE_BOOTSTRAP);
    expect(getAppearance()).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(BRAND.colors.darkCanvas);
    window.localStorage.setItem(APPEARANCE_KEY, "unexpected");
    window.eval(APPEARANCE_BOOTSTRAP);
    expect(getAppearance()).toBe("light");
  });
  it("keeps the control, native chrome and storage in the same selected appearance", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeAppearance(notify);
    applyAppearance("dark");
    expect(getAppearance()).toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(notify).toHaveBeenCalledOnce();
    window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: "light" }));
    expect(getAppearance()).toBe("light");
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
    applyAppearance("dark");
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("keeps switching usable when browser storage is blocked", () => {
    vi.spyOn(window.Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => applyAppearance("dark")).not.toThrow();
    expect(getAppearance()).toBe("dark");
    vi.spyOn(window.Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => window.eval(APPEARANCE_BOOTSTRAP)).not.toThrow();
    expect(getAppearance()).toBe("light");
  });
});
