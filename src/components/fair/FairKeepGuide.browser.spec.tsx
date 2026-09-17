// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import FairKeepGuide from "./FairKeepGuide";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";

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
