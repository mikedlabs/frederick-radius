// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";
import SideRail from "./SideRail";
const state = vi.hoisted(() => ({ pathname: "/today", push: vi.fn(), prefetches: new Map<string, boolean | "auto" | undefined>() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | "auto" }) => { if (props.href) state.prefetches.set(props.href, prefetch); return <a {...props} />; } }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { state.pathname = "/today"; state.push.mockReset(); state.prefetches.clear(); container=document.createElement("div"); document.body.append(container); root=createRoot(container); });
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
  expect(link("/map").getAttribute("data-pending")).toBe("true");
  expect(link("/map").getAttribute("aria-current")).toBeNull();
  expect(link("/today").getAttribute("aria-current")).toBe("page");
  await act(async () => link("/map").dispatchEvent(new Event("pointercancel", {bubbles:true})));
  expect(selected()).toEqual(["Today"]); expect(busy()).toBe("false");
  expect(link("/map").getAttribute("data-pending")).toBe("false");
 });
 it("changes the selected tab only after the destination pathname commits", async () => {
  Object.defineProperty(document, "startViewTransition", { configurable:true, value:(callback:()=>void)=>callback() });
  await mount();
  await act(async () => link("/events").click());
  expect(state.push).toHaveBeenCalledWith("/events"); expect(selected()).toEqual(["Today"]);
  expect(link("/events").getAttribute("data-pending")).toBe("true");
  state.pathname="/events"; await mount();
  expect(selected()).toEqual(["Events"]); expect(busy()).toBe("false");
  expect(link("/events").getAttribute("data-pending")).toBe("false");
 });
 it("clears a provisional drag-out while preserving a request after ordinary pointer exit", async () => {
  Object.defineProperty(document, "startViewTransition", { configurable:true, value:(callback:()=>void)=>callback() });
  await mount();
  await act(async () => link("/map").dispatchEvent(new MouseEvent("pointerdown", {bubbles:true,button:0})));
  await act(async () => link("/map").dispatchEvent(new MouseEvent("pointerout", {bubbles:true,buttons:1,relatedTarget:document.body})));
  expect(link("/map").getAttribute("data-pending")).toBe("false");
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => link("/map").click());
  await act(async () => link("/map").dispatchEvent(new MouseEvent("pointerout", {bubbles:true,buttons:0,relatedTarget:document.body})));
  expect(link("/map").getAttribute("data-pending")).toBe("true");
  expect(selected()).toEqual(["Today"]);
 });
 it.each([["mobile", BottomNav], ["desktop", SideRail]] as const)("does not prefetch the exact current %s tab and preserves other destinations", async (_name, Component) => {
  Object.defineProperty(document, "startViewTransition", { configurable:true, value:(callback:()=>void)=>callback() });
  for (const pathname of ["/today", "/events", "/my-radius"]) {
   state.pathname=pathname; state.prefetches.clear();
   await act(async () => root.render(<Component />));
   expect(link(pathname).getAttribute("href")).toBe(pathname);
   expect(link(pathname).getAttribute("aria-current")).toBe("page");
   expect(state.prefetches.get(pathname)).toBe(false);
   for (const destination of ["/today", "/events", "/my-radius"].filter(href => href !== pathname)) expect(state.prefetches.get(destination)).toBe("auto");
   expect(state.prefetches.get("/map")).toBe(false);
   const destination = pathname === "/events" ? "/today" : "/events";
   await act(async () => link(destination).click());
   expect(state.push).toHaveBeenLastCalledWith(destination);
  }
  state.pathname="/today/tonight"; state.prefetches.clear();
  await act(async () => root.render(<Component />));
  expect(state.prefetches.get("/today")).toBe("auto");
  state.pathname="/events/calendar"; state.prefetches.clear();
  await act(async () => root.render(<Component />));
  expect(state.prefetches.get("/events")).toBe("auto");
 });
 it.each([["mobile", BottomNav], ["desktop", SideRail]] as const)("keeps %s detail tabs navigable without automatically warming destinations", async (_name, Component) => {
  Object.defineProperty(document, "startViewTransition", { configurable:true, value:(callback:()=>void)=>callback() });
  for (const pathname of ["/events/evening-concert", "/places/brewers-alley-frederick"]) {
   state.pathname = pathname; state.prefetches.clear();
   await act(async () => root.render(<Component />));
   expect([...container.querySelectorAll("a")].map(node => node.getAttribute("href"))).toEqual(["/today", "/map", "/events", "/my-radius"]);
   expect(container.querySelector('[aria-label="Primary"]')).not.toBeNull();
   expect([...state.prefetches.values()]).toEqual([false, false, false, false]);
   await act(async () => link("/map").click());
   expect(state.push).toHaveBeenLastCalledWith("/map");
  }
  state.pathname = "/events/calendar"; state.prefetches.clear();
  await act(async () => root.render(<Component />));
  expect(state.prefetches.get("/events")).toBe("auto");
  expect(state.prefetches.get("/map")).toBe(false);
 });

});
