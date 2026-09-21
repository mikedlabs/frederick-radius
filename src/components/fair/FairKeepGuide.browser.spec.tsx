// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import FairKeepGuide from "./FairKeepGuide";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { RETURN_BRIDGE_OPEN_EVENT } from "@/lib/return-bridge";

afterEach(() => vi.unstubAllGlobals());
it("copies only a Fair return link and never claims the browser saved a bookmark", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(FairKeepGuide)));
  await act(async () => host.querySelector("button")?.click());
  expect(writeText).toHaveBeenCalledWith(new URL(FAIR_DAY_PATH, window.location.origin).toString());
  expect(host.textContent).toContain("Link copied");
  expect(host.textContent).toContain("plan stays in this browser, not in the link");
  expect(host.textContent).not.toContain("Bookmark saved");
  act(() => root.unmount());
});
it("offers a selectable link when clipboard access is unavailable", async () => {
  vi.stubGlobal("navigator", { clipboard: undefined });
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(FairKeepGuide)));
  await act(async () => host.querySelector("button")?.click());
  expect(host.querySelector("input")?.value).toContain(FAIR_DAY_PATH);
  expect(host.textContent).not.toContain("Link copied");
  act(() => root.unmount());
});

it("offers the shareable setup page without replacing the direct Home Screen action", () => {
  const open = vi.fn();
  window.addEventListener(RETURN_BRIDGE_OPEN_EVENT, open);
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(FairKeepGuide)));
  const details = host.querySelector("details");
  expect(details?.open).toBe(false);
  const setupLink = details?.querySelector('a[href="/install"]');
  expect(setupLink?.textContent).toBe("Home Screen setup and help");
  const installButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Add Radius to Home Screen"),
  );
  act(() => installButton?.click());
  expect(open).toHaveBeenCalledOnce();
  act(() => root.unmount());
  window.removeEventListener(RETURN_BRIDGE_OPEN_EVENT, open);
});
