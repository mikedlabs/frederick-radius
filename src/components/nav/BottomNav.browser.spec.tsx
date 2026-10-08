// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";
const state = vi.hoisted(() => ({ pathname: "/today", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void prefetch; return <a {...props} />; } }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { state.pathname = "/today"; state.push.mockReset(); container=document.createElement("div"); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); Reflect.deleteProperty(document,"startViewTransition"); });
const mount=async () => { await act(async () => root.render(<BottomNav />)); };
const link=(href:string) => container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;
const selected=() => [...container.querySelectorAll('[data-selected="true"]')].map(el => el.textContent?.trim());
const busy=() => container.querySelector('[aria-label="Primary"]')?.getAttribute("aria-busy");
describe("BottomNav destination truth", () => {
 it("keeps only the current tab selected during an uncommitted touch", async () => {
  await mount();
  await act(async () => link("/map").dispatchEvent(new MouseEvent("pointerdown", {bubbles:true,button:0})));
  expect(selected()).toEqual(["Today"]);
  expect(busy()).toBe("true");
  await act(async () => link("/map").dispatchEvent(new Event("pointercancel", {bubbles:true})));
  expect(selected()).toEqual(["Today"]); expect(busy()).toBe("false");
 });
 it("changes the selected tab only after the destination pathname commits", async () => {
  Object.defineProperty(document, "startViewTransition", { configurable:true, value:(callback:()=>void)=>callback() });
  await mount();
  await act(async () => link("/events").click());
  expect(state.push).toHaveBeenCalledWith("/events"); expect(selected()).toEqual(["Today"]);
  state.pathname="/events"; await mount();
  expect(selected()).toEqual(["Events"]); expect(busy()).toBe("false");
 });
});
