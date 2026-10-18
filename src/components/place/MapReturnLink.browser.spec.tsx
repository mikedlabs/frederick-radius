// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSE_SCROLL_RETURN_KEY, consumeBrowseScrollReturn } from "@/lib/browse-scroll-return";
import MapReturnLink from "./MapReturnLink";

const navigation = vi.hoisted(() => ({ returnTo: "/today?in=frederick" as string | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.returnTo ? { returnTo: navigation.returnTo } : {}) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  navigation.returnTo = "/today?in=frederick";
  window.sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // Keep JSDOM from attempting the document navigation after React handles
  // the ordinary click. This listener observes default prevention afterwards.
  host.addEventListener("click", (event) => event.preventDefault());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.sessionStorage.clear(); });
async function render() { await act(async () => root.render(<MapReturnLink />)); }
async function click(options: MouseEventInit = {}) {
  await act(async () => host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options })));
}

describe("explicit listing Back action", () => {
  it("keeps the safe document link and marks its exact listing scroll return", async () => {
    await render();
    expect(host.querySelector("a")?.getAttribute("href")).toBe(navigation.returnTo);
    expect(host.textContent).toBe("Back to Today");
    await click();
    expect(consumeBrowseScrollReturn(navigation.returnTo)).toBe(true);
    expect(consumeBrowseScrollReturn(navigation.returnTo)).toBe(false);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("does not leave a same-tab scroll instruction for modified clicks: %j", async (options) => {
    await render();
    await click(options);
    expect(window.sessionStorage.getItem(BROWSE_SCROLL_RETURN_KEY)).toBeNull();
  });

  it("does not replace the safe href or mark arbitrary external history", async () => {
    navigation.returnTo = "https://outside.example/events";
    await render();
    expect(host.querySelector("a")).toBeNull();
    expect(window.sessionStorage.getItem(BROWSE_SCROLL_RETURN_KEY)).toBeNull();
  });
});
