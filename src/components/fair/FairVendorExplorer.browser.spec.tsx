// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/BottomDrawer", () => ({ default: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <section role="dialog">{children}</section> : null }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { greatFrederickFair2026Vendors, type FairVendorProfile } from "@/data/fair/great-frederick-fair-2026-vendors";
import FairVendorExplorer, { fairVendorShareUrl, filterFairVendors, type FairVendorExplorerProps } from "./FairVendorExplorer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const food = greatFrederickFair2026Vendors.find((vendor) => vendor.id === "vendor-white-rabbit-rad-pies")!;
const shop: FairVendorProfile = { ...food, id: "vendor-test-shop", name: "Test Pottery", kind: "retail", summary: "Handmade ceramic bowls.", searchAliases: ["ceramics"], highlights: ["Pottery"], booth: { status: "unknown", reason: "No booth location has been reviewed for this test vendor." } };

describe("Fair vendor discovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: FairVendorExplorerProps;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = { open: true, onOpenChange: vi.fn(), vendors: [food, shop], selectedVendorId: null, onSelectVendor: vi.fn(), savedVendorIds: [], onToggleVendor: vi.fn() };
    window.history.replaceState({}, "", "/moments/great-frederick-fair-2026?car=private&party=4&lat=39.4#my-day");
    writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(window, "prompt").mockReturnValue(null);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function render(overrides: Partial<FairVendorExplorerProps> = {}) {
    props = { ...props, ...overrides };
    act(() => root.render(createElement(FairVendorExplorer, props)));
  }
  function button(label: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) => node.getAttribute("aria-label") === label || node.textContent === label);
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  }
  async function click(label: string) { await act(async () => button(label).click()); }

  it("matches both brands as one stop, aliases, categories, and saved filters", () => {
    expect(filterFairVendors([food, shop], "Rad Pies", "all", [])).toEqual([food]);
    expect(filterFairVendors([food, shop], "White Rabbit", "food", [])).toEqual([food]);
    expect(filterFairVendors([food, shop], "ceramics", "retail", [])).toEqual([shop]);
    expect(filterFairVendors([food, shop], "", "saved", [shop.id])).toEqual([shop]);
    expect(filterFairVendors([food, shop], "pizza", "retail", [])).toEqual([]);
  });

  it("keeps save state controlled, browses categories, and offers an honest empty fallback", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render();
    await click(`Save ${food.name} to My Day`);
    expect(props.onToggleVendor).toHaveBeenCalledWith(food);
    expect(storage).not.toHaveBeenCalled();
    render({ savedVendorIds: [food.id] });
    expect(button(`Remove ${food.name} from My Day`).getAttribute("aria-pressed")).toBe("true");
    await click("Shopping");
    expect(container.textContent).toContain(shop.name);
    expect(container.textContent).not.toContain(food.name);
    await click("Saved");
    expect(container.textContent).toContain(food.name);
    render({ savedVendorIds: [] });
    expect(container.textContent).toContain("No saved vendors match this view.");
    expect(container.querySelector<HTMLAnchorElement>('a[href*="exhibitors-g2app"]')?.target).toBe("_blank");
  });

  it("uses a complete selected view with real booth/menu/source labels but no made-up map location", async () => {
    render();
    await click(`Explore ${food.name}`);
    expect(props.onSelectVendor).toHaveBeenCalledWith(food.id);
    render({ selectedVendorId: food.id });
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(container.textContent).toContain("587");
    expect(container.textContent).toContain("588");
    expect(container.textContent).toContain("Fair menus and availability may differ");
    expect(container.textContent).toContain("Vendor hours are not confirmed");
    expect(container.querySelector<HTMLAnchorElement>(`a[href="${food.menuUrl}"]`)?.textContent).toContain(food.menuLabel);
    expect(container.textContent).toContain(food.provenance[0].publisher);
    expect(container.textContent).not.toContain("Show on map");
    render({ selectedVendorId: shop.id });
    expect(container.textContent).toContain("Booth location not confirmed");
    await click("Back to vendors");
    expect(props.onSelectVendor).toHaveBeenCalledWith(null);
  });

  it("handles a missing shared ID without substituting another vendor", () => {
    render({ selectedVendorId: "vendor-no-longer-present" });
    expect(container.textContent).toContain("This vendor is not in the reviewed guide");
    expect(container.querySelectorAll('[aria-label^="Save "]')).toHaveLength(0);
  });

  it("copies a clean canonical vendor link without any private current URL fields", async () => {
    render({ selectedVendorId: food.id });
    await click(`Share ${food.name}`);
    expect(writeText).toHaveBeenCalledWith(fairVendorShareUrl(window.location.origin, food.id));
    const url = new URL(writeText.mock.calls[0][0]);
    expect([...url.searchParams.keys()]).toEqual(["vendor"]);
    expect(url.hash).toBe("#fair-map");
    expect(container.textContent).toContain("Copied");
  });

  it("uses native sharing and leaves cancellation alone", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render({ selectedVendorId: food.id });
    await click(`Share ${food.name}`);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: fairVendorShareUrl(window.location.origin, food.id) }));
    expect(writeText).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it("offers manual copy if native sharing and clipboard fail", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("Unavailable")) });
    writeText.mockRejectedValue(new Error("Denied"));
    render({ selectedVendorId: food.id });
    await click(`Share ${food.name}`);
    expect(window.prompt).toHaveBeenCalledWith("Copy this Fair vendor link:", fairVendorShareUrl(window.location.origin, food.id));
  });
});
