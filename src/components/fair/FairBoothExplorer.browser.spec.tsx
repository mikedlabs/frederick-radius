// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FairBoothExplorer, { findBoothResults, type FairBoothExplorerProps } from "./FairBoothExplorer";
import { fairBoothFixture } from "./fair-booth-fixture";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Fair booth explorer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: FairBoothExplorerProps;
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 560, x: 0, y: 0, top: 0, left: 0, bottom: 560, right: 800, toJSON: () => ({}) });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = { data: fairBoothFixture, mapId: "3", selectedBoothId: null, query: "", onMapChange: vi.fn(), onSelectBooth: vi.fn(), onQueryChange: vi.fn(), onOpenVendor: vi.fn(), onShareBooth: vi.fn() };
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  function render(next: Partial<FairBoothExplorerProps> = {}) { props = { ...props, ...next }; act(() => root.render(createElement(FairBoothExplorer, props))); }
  function button(label: string) {
    const node = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
    if (!node) throw new Error(`Missing ${label}`);
    return node;
  }
  function click(label: string) { act(() => button(label).click()); }
  const view = () => container.querySelector("[data-fair-booth-svg]")?.getAttribute("viewBox");
  function pointer(target: Element, type: string, x: number, y: number) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => target.dispatchEvent(event));
  }

  it("finds all brand booths, exact booth numbers, and punctuation without inventing categories", () => {
    expect(findBoothResults(fairBoothFixture, "rad pies").map(({ booth }) => booth.label)).toEqual(["587", "588"]);
    expect(findBoothResults(fairBoothFixture, "booth 3").map(({ booth }) => booth.label)).toEqual(["3"]);
    expect(findBoothResults(fairBoothFixture, "3 brothers cafe")).toHaveLength(1);
    expect(findBoothResults(fairBoothFixture, "open now")).toHaveLength(0);
  });

  it("renders original geometry and labels, highlights search without moving the camera", () => {
    render();
    expect(container.querySelectorAll("[data-fair-booth-id]")).toHaveLength(3);
    expect([...container.querySelectorAll("svg text")].map((node) => node.textContent)).toEqual(["587", "588", "589"]);
    const overview = view();
    render({ query: "Rad Pies" });
    expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(2);
    expect(view()).toBe(overview);
    click("Show booth 587: White Rabbit x Rad Pies");
    expect(props.onSelectBooth).toHaveBeenCalledWith("3:5");
    render({ selectedBoothId: "3:5" });
    expect(view()).not.toBe(overview);
    const focused = view();
    render({ selectedBoothId: null });
    expect(view()).toBe(focused);
    expect(document.activeElement).toBe(button("Show booth 587: White Rabbit x Rad Pies"));
  });

  it("retains original artwork proportions, source annotations, and top-left rotation", () => {
    render({ mapId: "2" });
    expect(container.querySelector("svg image")).toBeNull();
    expect(container.querySelector("[data-fair-booth-context]")).not.toBeNull();
    click("Show original layout");
    expect(container.querySelector("svg image")?.getAttribute("height")).toBe("800");
    expect(container.querySelector('[data-fair-booth-id="2:4"]')?.parentElement?.getAttribute("transform")).toBe("rotate(30 400 200)");
    expect(container.textContent).toContain("Exhibit hall");
    expect(container.textContent).not.toContain("Hidden source label");
    click("Hide original layout");
    expect(container.querySelector("svg image")).toBeNull();
  });

  it("provides source-backed details and only invokes reviewed vendor actions", () => {
    render({ selectedBoothId: "3:5" });
    expect(container.querySelector('[aria-label="Booth 587"]')?.textContent).toContain("White Rabbit x Rad Pies");
    expect(container.querySelector('a[href="https://mobile.map-dynamics.com/exhibitor-profile-g2app.php?ID=1"]')).not.toBeNull();
    expect(container.textContent).toContain("Sep 21, 2026");
    expect(container.textContent).toContain("not a GPS map");
    click("View menu and details");
    expect(props.onOpenVendor).toHaveBeenCalledWith("vendor-white-rabbit-rad-pies");
    click("Share this booth");
    expect(props.onShareBooth).toHaveBeenCalledWith("3:5");
    click("Close booth details");
    expect(props.onSelectBooth).toHaveBeenCalledWith(null);
    render({ mapId: "1", selectedBoothId: "1:3" });
    expect(container.querySelector('[aria-label="Unlabeled space"]')).not.toBeNull();
    expect(container.textContent).toContain("does not give this space a booth number or vendor");
    expect(container.textContent).not.toContain("View menu and details");
  });

  it("offers every source space through native list buttons and keeps cross-map selection controlled", () => {
    render({ mapId: "1" });
    click("Browse booth list");
    expect(container.querySelectorAll('button[aria-label^="Show "]')).toHaveLength(3);
    render({ query: "Rad Pies" });
    click("Show booth 587: White Rabbit x Rad Pies");
    expect(props.onSelectBooth).toHaveBeenCalledWith("3:5");
    expect(props.onMapChange).not.toHaveBeenCalled();
    click("Indoor exhibits");
    expect(props.onMapChange).toHaveBeenCalledWith("2");
  });

  it("supports zoom, keyboard pan, fit, and Escape without recentering on search", () => {
    render();
    const overview = view();
    click("Zoom in");
    const zoomed = view();
    expect(zoomed).not.toBe(overview);
    const canvas = container.querySelector("[data-fair-booth-canvas]")!;
    act(() => canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(view()).not.toBe(zoomed);
    click("Fit whole map");
    expect(view()).toBe(overview);
    render({ selectedBoothId: "3:5" });
    act(() => canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(props.onSelectBooth).toHaveBeenCalledWith(null);
  });

  it("selects a source rectangle on a tap and never selects it after a drag", () => {
    render();
    const shape = container.querySelector('[data-fair-booth-id="3:5"]')!;
    const canvas = container.querySelector("[data-fair-booth-canvas]")!;
    pointer(shape, "pointerdown", 300, 300);
    pointer(canvas, "pointerup", 300, 300);
    expect(props.onSelectBooth).toHaveBeenCalledWith("3:5");
    vi.mocked(props.onSelectBooth).mockClear();
    pointer(shape, "pointerdown", 300, 300);
    pointer(canvas, "pointermove", 400, 350);
    pointer(canvas, "pointerup", 400, 350);
    expect(props.onSelectBooth).not.toHaveBeenCalled();
  });

  it("returns to the whole Fair through the parent without clearing the search", () => {
    const onShowWholeFair = vi.fn();
    render({ query: "Rad Pies", selectedBoothId: "3:5", onShowWholeFair });
    click("Whole fair");
    expect(onShowWholeFair).toHaveBeenCalledOnce();
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });

  it("uses the measured phone canvas for an initially shared booth", () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 353, height: 330, x: 0, y: 0, top: 0, left: 0, bottom: 330, right: 353, toJSON: () => ({}) });
    render({ selectedBoothId: "3:5" });
    const visibleWidth = Number(view()!.split(" ")[2]);
    const boothWidthOnScreen = 35 / visibleWidth * 353;
    expect(boothWidthOnScreen).toBeCloseTo(48);
  });
});
