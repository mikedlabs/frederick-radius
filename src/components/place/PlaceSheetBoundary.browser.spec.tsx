// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";

const sheetHarness = vi.hoisted(() => ({
  openSheet: vi.fn(),
  openSheetBySlug: vi.fn(),
}));

vi.mock("./PlaceSheetProvider", () => ({
  usePlaceSheet: () => ({
    openSheet: sheetHarness.openSheet,
    openSheetBySlug: sheetHarness.openSheetBySlug,
    closeSheet: vi.fn(),
  }),
}));

import PlaceSheetBoundary from "./PlaceSheetBoundary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PlaceSheetBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sheetHarness.openSheet.mockReset();
    sheetHarness.openSheetBySlug.mockReset();
    window.history.replaceState({}, "", "/today");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderBoundary(
    anchors: ReturnType<typeof createElement>,
    places: PlaceCardData[] = [],
  ) {
    await act(async () => {
      root.render(
        <PlaceSheetBoundary fetchMissing places={places}>
          {anchors}
        </PlaceSheetBoundary>,
      );
    });
  }

  function click(
    target: Element,
    init: MouseEventInit = {},
  ): { allowed: boolean; reachedAnchor: boolean } {
    const anchor = target.closest("a") ?? target;
    let reachedAnchor = false;
    const preserveNativeNavigation = (event: Event) => {
      reachedAnchor = true;
      event.preventDefault();
    };
    anchor.addEventListener("click", preserveNativeNavigation, { once: true });
    const allowed = target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      }),
    );
    return { allowed, reachedAnchor };
  }

  it("opens a nested place link in the on-demand sheet and keeps its real anchor", async () => {
    await renderBoundary(
      createElement(
        "a",
        { href: "/places/gravel-and-grind-frederick" },
        createElement("span", { "data-place-name": "" }, "Gravel & Grind"),
      ),
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    const target = container.querySelector("[data-place-name]") as HTMLElement;
    const result = click(target);

    expect(result.allowed).toBe(false);
    expect(result.reachedAnchor).toBe(false);
    expect(anchor.getAttribute("href")).toBe(
      "/places/gravel-and-grind-frederick",
    );
    expect(sheetHarness.openSheetBySlug).toHaveBeenCalledWith(
      "gravel-and-grind-frederick",
      { returnFocus: anchor },
    );
    expect(sheetHarness.openSheet).not.toHaveBeenCalled();
  });

  it("uses an already-carried place without another lookup", async () => {
    const place = {
      slug: "carroll-creek-linear-park-frederick",
      name: "Carroll Creek Linear Park",
    } as PlaceCardData;
    await renderBoundary(
      createElement(
        "a",
        { href: `/places/${place.slug}?from=today#details` },
        place.name,
      ),
      [place],
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    click(anchor);

    expect(sheetHarness.openSheet).toHaveBeenCalledWith(place, {
      returnFocus: anchor,
    });
    expect(sheetHarness.openSheetBySlug).not.toHaveBeenCalled();
  });

  it.each([
    ["Meta-click", { metaKey: true }],
    ["Control-click", { ctrlKey: true }],
    ["Shift-click", { shiftKey: true }],
    ["Alt-click", { altKey: true }],
    ["middle-click", { button: 1 }],
  ])("leaves %s to the browser", async (_label, init) => {
    await renderBoundary(
      createElement("a", { href: "/places/gravel-and-grind-frederick" }, "Place"),
    );

    const result = click(container.querySelector("a") as HTMLAnchorElement, init);

    expect(result.reachedAnchor).toBe(true);
    expect(sheetHarness.openSheetBySlug).not.toHaveBeenCalled();
  });

  it.each([
    ["new-tab", { href: "/places/a-place", target: "_blank" }],
    ["download", { href: "/places/a-place", download: "place.html" }],
    ["disabled", { href: "/places/a-place", "aria-disabled": "true" }],
    ["index", { href: "/places" }],
    ["nested route", { href: "/places/a-place/more" }],
    ["malformed slug", { href: "/places/%E0%A4%A" }],
  ])("does not intercept a %s anchor", async (_label, props) => {
    await renderBoundary(createElement("a", props, "Place"));

    const result = click(container.querySelector("a") as HTMLAnchorElement);

    expect(result.reachedAnchor).toBe(true);
    expect(sheetHarness.openSheetBySlug).not.toHaveBeenCalled();
  });
});
