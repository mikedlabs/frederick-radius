// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getScope, setScope } from "@/lib/scope";
import CategoryGeography from "./CategoryGeography";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Category geography", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/category/coffee");
    setScope(null);
    vi.clearAllMocks();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); setScope(null); });
  function render(areas: string[], selectedTown: string | null = null) {
    const places = areas.map((municipality) => ({ municipality }));
    act(() => root.render(<CategoryGeography places={places} current={selectedTown} selectedTown={selectedTown} />));
  }
  it("scales each segment to real listed results and stores a real town filter while keeping focus", () => {
    render(["frederick", "frederick", "brunswick", "unlisted"]);
    expect(container.querySelector("figcaption")?.textContent).toBe("4 listings by area");
    const segments = [...container.querySelectorAll<HTMLElement>("figure div[aria-hidden] span")];
    expect(segments.map((s) => s.style.flexGrow)).toEqual(["2", "1", "1"]);
    expect(container.querySelector("figure")?.textContent).toContain("Town not listed");
    const town = container.querySelector<HTMLButtonElement>('button[aria-label="Show 1 listing in Brunswick"]')!;
    act(() => town.click());
    expect(getScope()).toBe("town:brunswick");
    expect(document.cookie).toContain("fr_scope=town%3Abrunswick");
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(container.querySelector("select"));
  });
  it("retains precise counts for one known town, a selected town with no results, and unknown-only results", () => {
    render(["brunswick"]);
    expect(container.textContent).toContain("1 listing in Brunswick");
    expect(container.querySelector("figure")).toBeNull();
    render([], "brunswick");
    expect(container.textContent).toContain("0 listings in Brunswick");
    expect(container.querySelector("figure")).toBeNull();
    render(["unlisted"]);
    expect(container.textContent).toContain("1 listing");
    expect(container.textContent).not.toContain("1 listing in");
  });
});
